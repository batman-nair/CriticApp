from django.db import IntegrityError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.urls import reverse
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics
from rest_framework import permissions
from rest_framework import serializers
from rest_framework import status

from .forms import ReviewForm
from .serializers import ReviewItemSerializer, ReviewSerializer
from .utils import api_utils, review_utils
from .models import ReviewItem, Review
from .permissions import IsOwnerOrReadOnly

CATEGORY_TO_API: dict[str, api_utils.ReviewItemAPIBase] = {
    'movie': api_utils.OMDBItemAPI(),
    'game': api_utils.RAWGItemAPI(),
    'anime': api_utils.JikanItemAPI('anime'),
    'manga': api_utils.JikanItemAPI('manga'),
}

INVALID_USER_RESPONSE = {"response": "False", "error": "User not authenticated."}
INVALID_CATEGORY_RESPONSE = {"response": "False", "error": "Invalid category."}
NOT_OK_RESPONSE = {"response": "False", "error": "Bad reponse from API."}

def view_reviews(request):
    return render(request, 'review/view_reviews.html', {'categories': CATEGORY_TO_API.keys()})

@login_required
def add_review(request):
    form = ReviewForm()
    return render(request, 'review/add_review.html', {'form': form})

def review_item_api_validator(api_func):
    def inner(request, category, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse(INVALID_USER_RESPONSE, status=status.HTTP_403_FORBIDDEN)
        if category not in CATEGORY_TO_API:
            return JsonResponse(INVALID_CATEGORY_RESPONSE, status=status.HTTP_400_BAD_REQUEST)
        return api_func(request, category, *args, **kwargs)
    return inner

@review_item_api_validator
def search_review_item(request, category, search_term):
    api_obj = CATEGORY_TO_API[category]
    return JsonResponse(api_obj.search(search_term))

@review_item_api_validator
def get_review_item_info(request, category, item_id):
    try:
        review_item = ReviewItem.objects.get(item_id=item_id)
        review_item_json = ReviewItemSerializer(review_item).data
        review_item_json["response"] = "True"
        return JsonResponse(review_item_json)
    except ReviewItem.DoesNotExist:
        pass
    api_obj = CATEGORY_TO_API[category]
    item_data = api_obj.get_details(item_id)
    if item_data["response"] == "False":
        return JsonResponse(item_data, status=status.HTTP_400_BAD_REQUEST)
    item_data["category"] = category
    serializer = ReviewItemSerializer(data=item_data)
    if serializer.is_valid():
        serializer.save()
    else:
        print('Error serializing data', category, item_id, serializer.errors)
    return JsonResponse(item_data)


@login_required
def profile_redirect(request):
    return redirect('review:profile', username=request.user.username)

def view_profile(request, username):
    return render(request, 'review/view_reviews.html', {'categories': CATEGORY_TO_API.keys(), 'username': username})


class ReviewList(APIView):
    class OutputSerializer(serializers.ModelSerializer):
        user = serializers.ReadOnlyField(source='user.username')
        review_item = ReviewItemSerializer()
        class Meta:
            model = Review
            fields = '__all__'

    def get(self, request):
        reviews = Review.objects.all()
        query = request.GET.get('query', '')
        username = request.GET.get('username', '')
        filter_categories = request.GET.getlist('filter_categories')
        ordering = request.GET.get('ordering', '')
        reviews = review_utils.get_filtered_review_objects(query, username, filter_categories, ordering)
        data = self.OutputSerializer(reviews, many=True).data

        return Response(data)

class ReviewCreate(generics.CreateAPIView):
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        try:
            response = super().create(request, *args, **kwargs)
        except IntegrityError:
            response = Response({'error': 'Possible duplicate review'}, status=status.HTTP_400_BAD_REQUEST)
        if response.status_code == status.HTTP_201_CREATED:
            messages.success(request, 'Created new review')
            return redirect('review:add_review')
        messages.error(request, 'Error creating review')
        return redirect('review:add_review')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class ReviewDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]


class ReviewPost(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request):
        error_code = None
        is_update = False
        review_data = request.data
        try:
            review_obj = None
            if review_data['id']:
                is_update = True
                review_obj = Review.objects.get(id=review_data['id'])
            serializer = ReviewSerializer(review_obj, review_data)
            serializer.is_valid(raise_exception=True)
            serializer.save(user=request.user)
        except Review.DoesNotExist:
            error_code = 101
        except serializers.ValidationError:
            error_code = 102
        except IntegrityError:
            error_code = 103

        action_word = 'Updat' if is_update else 'Add'
        if error_code:
            messages.error(request, 'Error {}ing review {}'.format(action_word, error_code))
        else:
            messages.success(request, '{}ed review'.format(action_word))

        return redirect('review:add_review')

@login_required
def get_user_review(request, item_id):
    review = get_object_or_404(Review, user=request.user, review_item__item_id=item_id)
    json_data = ReviewSerializer(review).data
    json_data["category"] = review.review_item.category  # Have a custom serializer instead?
    return JsonResponse(json_data)

