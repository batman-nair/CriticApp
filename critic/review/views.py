from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required

from .forms import ReviewForm

from .utils import api_utils, review_utils
from .models import ReviewItem, Review

CATEGORY_TO_API: dict[str, api_utils.ReviewItemAPIBase] = {
    'movie': api_utils.OMDBItemAPI(),
    'game': api_utils.RAWGItemAPI(),
}

INVALID_USER_RESPONSE = {"Response": "False", "Error": "User not authenticated."}
INVALID_CATEGORY_RESPONSE = {"Response": "False", "Error": "Invalid category."}
NOT_OK_RESPONSE = {"Response": "False", "Error": "Bad reponse from API."}

def view_reviews(request):
    return render(request, 'review/view_reviews.html', {'categories': CATEGORY_TO_API.keys()})

@login_required()
def add_review(request):
    if request.method == 'POST':
        form = ReviewForm(request.POST)
        if form.is_valid():
            if request.user.is_authenticated:
                try:
                    form_data = form.cleaned_data
                    review_item = ReviewItem.objects.get(item_id=form_data['item_id'])
                    user = request.user
                    review_data = form_data['review']
                    rating = form_data['rating']
                    tags = form_data['tags']
                    review_obj = Review(user=user, review_item=review_item, review_rating=rating, review_data=review_data, review_tags=tags)
                    review_obj.save()
                    return HttpResponseRedirect('/add')
                except ReviewItem.DoesNotExist:
                    print('ReviewItem does not exist', form_data)
        else:
            print('Hmm okay', form)
    else:
        form = ReviewForm()
    return render(request, 'review/add_review.html', {'form': form})

def search_review_item(request, category, search_term):
    if not request.user.is_authenticated:
        return JsonResponse(INVALID_USER_RESPONSE)
    if category not in CATEGORY_TO_API:
        return JsonResponse(INVALID_CATEGORY_RESPONSE)
    api_obj = CATEGORY_TO_API[category]
    return JsonResponse(api_obj.search(search_term))

def get_review_item_info(request, category, item_id):
    if not request.user.is_authenticated:
        return JsonResponse(INVALID_USER_RESPONSE)
    if category not in CATEGORY_TO_API:
        return JsonResponse(INVALID_CATEGORY_RESPONSE)
    try:
        review_item = ReviewItem.objects.get(item_id=item_id)
        review_item_json = review_item.to_review_json()
        review_item_json["Response"] = "True"
        return JsonResponse(review_item_json)
    except ReviewItem.DoesNotExist:
        pass
    api_obj = CATEGORY_TO_API[category]
    item_data = api_obj.get_details(item_id)
    item_data["Category"] = category
    if item_data["Response"] == "True":
        review_item = ReviewItem.from_review_json(**item_data)
        review_item.save()
    return JsonResponse(item_data)

@login_required
def profile_redirect(request):
    return redirect('review:profile', username=request.user.username)

def view_profile(request, username):
    return render(request, 'review/view_reviews.html', {'categories': CATEGORY_TO_API.keys(), 'username': username})

def get_reviews(request):
    query = request.GET.get('query', '')
    username = request.GET.get('username', '')
    filter_categories = request.GET.getlist('filter_categories')
    ordering = request.GET.get('ordering', '')
    reviews = review_utils.get_filtered_review_objects(query, username, filter_categories, ordering)
    json_data = review_utils.convert_reviews_to_json(reviews)
    return JsonResponse(json_data)
