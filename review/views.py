from django.db import IntegrityError
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics
from rest_framework import permissions
from rest_framework import serializers
from rest_framework import status
from rest_framework.settings import api_settings
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema

from .forms import ReviewForm
from .serializers import ReviewItemSerializer, ReviewSerializer, ExternalLookupSerializer
from .utils import api_utils, review_utils, metrics
from .models import ReviewItem, Review
from .permissions import IsOwnerOrReadOnly
from .response_formatters import success_response, error_response

CATEGORY_TO_API: dict[str, api_utils.ReviewItemAPIBase] = {
    'movie': api_utils.OMDBItemAPI(),
    'game': api_utils.RAWGItemAPI(),
    'anime': api_utils.JikanItemAPI('anime'),
    'manga': api_utils.JikanItemAPI('manga'),
}


def _build_search_result_from_item(item_data):
    return {
        'item_id': item_data['item_id'],
        'title': item_data['title'],
        'image_url': item_data['image_url'],
        'year': item_data['year'],
    }

def health_check(request):
    """Health check endpoint for k8s probes. Returns 200 OK."""
    return HttpResponse("OK", status=200)


@csrf_exempt
def metrics_endpoint(request):
    if settings.METRICS_REQUIRE_AUTH and not (request.user.is_authenticated and request.user.is_staff):
        return HttpResponse('Forbidden', status=403)
    return metrics.metrics_http_response()

def view_reviews(request):
    return render(request, 'review/view_reviews.html', {'categories': CATEGORY_TO_API.keys()})

@login_required
def add_review(request):
    form = ReviewForm()
    return render(request, 'review/add_review.html', {'form': form})


@login_required
def profile_redirect(request):
    return redirect('review:profile', username=request.user.username)

def view_profile(request, username):
    return render(request, 'review/view_reviews.html', {'categories': CATEGORY_TO_API.keys(), 'username': username})


# ============================================================================
# API v2 Views - RFC-compliant response format
# ============================================================================

class ReviewListCreateV2(generics.ListCreateAPIView):
    """
    List all reviews or create a new review.

    GET: Returns paginated reviews with filtering/sorting. Public access.
    POST: Creates a new review. Requires authentication.
    Returns RFC-compliant v2 response format: {"data": ..., "meta": {...}}
    """
    queryset = Review.objects.select_related('user', 'review_item').all()
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    class OutputSerializer(serializers.ModelSerializer):
        user = serializers.ReadOnlyField(source='user.username')
        review_item = ReviewItemSerializer()
        class Meta:
            model = Review
            fields = '__all__'

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return self.OutputSerializer
        return ReviewSerializer

    @extend_schema(
        tags=['reviews'],
        summary='List reviews (v2)',
        parameters=[
            OpenApiParameter('query', str, OpenApiParameter.QUERY, required=False),
            OpenApiParameter('username', str, OpenApiParameter.QUERY, required=False),
            OpenApiParameter('item_id', str, OpenApiParameter.QUERY, required=False, description='Filter by review item ID'),
            OpenApiParameter('categories', str, OpenApiParameter.QUERY, required=False, description='Comma-separated include list'),
            OpenApiParameter('exclude_categories', str, OpenApiParameter.QUERY, required=False, description='Comma-separated exclude list'),
            OpenApiParameter('ordering', str, OpenApiParameter.QUERY, required=False),
            OpenApiParameter('limit', int, OpenApiParameter.QUERY, required=False),
            OpenApiParameter('offset', int, OpenApiParameter.QUERY, required=False),
        ],
        responses={200: dict},
    )
    def list(self, request, *args, **kwargs):
        query = request.GET.get('query', '')
        username = request.GET.get('username', '')
        item_id = request.GET.get('item_id', '')
        filter_categories = request.GET.getlist('filter_categories')
        categories = request.GET.getlist('categories')
        exclude_categories = request.GET.getlist('exclude_categories')
        ordering = request.GET.get('ordering', '')
        reviews = review_utils.get_filtered_review_objects(
            query,
            username,
            filter_categories,
            ordering,
            categories,
            exclude_categories,
            item_id,
        )

        paginator_class = api_settings.DEFAULT_PAGINATION_CLASS
        if paginator_class is None:
            return Response(
                error_response(
                    code='PAGINATION_REQUIRED',
                    message='Pagination is required for this endpoint and must be configured.',
                ),
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        paginator = paginator_class()
        page = paginator.paginate_queryset(reviews, request, view=self)
        if page is None:
            return Response(
                error_response(
                    code='PAGINATION_REQUIRED',
                    message='Pagination is required for this endpoint and must be configured.',
                ),
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        data = self.OutputSerializer(page, many=True).data
        meta = {
            'version': '2.0',
            'pagination': {
                'count': paginator.count,
                'limit': paginator.get_limit(request),
                'offset': paginator.get_offset(request),
            },
        }
        return Response(success_response(data, meta=meta))

    @extend_schema(
        tags=['reviews'],
        summary='Create review (v2)',
        request=ReviewSerializer,
        responses={201: dict, 400: dict, 403: dict},
    )
    def create(self, request, *args, **kwargs):
        try:
            response = super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response(
                error_response(
                    code="DUPLICATE_REVIEW",
                    message="You've already reviewed this item.",
                    details={"constraint": "unique(user, review_item)"},
                ),
                status=status.HTTP_400_BAD_REQUEST
            )

        if response.status_code == status.HTTP_201_CREATED:
            return Response(
                success_response(response.data, meta={"version": "2.0"}),
                status=status.HTTP_201_CREATED
            )

        return Response(
            error_response(
                code="INVALID_REQUEST",
                message="Failed to create review.",
                details={},
            ),
            status=status.HTTP_400_BAD_REQUEST
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ReviewDetailV2(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update, or delete a specific review.

    Returns RFC-compliant v2 response format.
    Only the review owner can modify.
    """
    queryset = Review.objects.select_related('user', 'review_item').all()
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]

    @extend_schema(tags=['reviews'], summary='Get review by id (v2)', responses={200: dict, 404: dict})
    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return Response(success_response(response.data, meta={"version": "2.0"}))

    @extend_schema(tags=['reviews'], summary='Update review by id (v2)', request=ReviewSerializer, responses={200: dict, 400: dict, 403: dict, 404: dict})
    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response(success_response(response.data, meta={"version": "2.0"}))

    @extend_schema(tags=['reviews'], summary='Delete review by id (v2)', responses={204: None, 403: dict, 404: dict})
    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response(
            success_response({"deleted": True}, meta={"version": "2.0"}),
            status=status.HTTP_204_NO_CONTENT
        )


# ============================================================================
# API v2 Lookup Views - External item search and details
# ============================================================================

class SearchItemV2(APIView):
    """Search external providers for review items (v2 format)."""
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        tags=['lookup'],
        summary='Search external review items (v2)',
        parameters=[
            OpenApiParameter(name='category', type=str, location=OpenApiParameter.PATH),
            OpenApiParameter(name='q', type=str, location=OpenApiParameter.QUERY),
        ],
        responses={200: dict, 400: dict, 403: dict},
    )
    def get(self, request, category):
        if category not in CATEGORY_TO_API:
            return Response(
                error_response(
                    code='INVALID_CATEGORY',
                    message='Invalid category.',
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        search_term = request.query_params.get('q', '')
        lookup_serializer = ExternalLookupSerializer(data={'search_term': search_term})
        if not lookup_serializer.is_valid():
            return Response(
                error_response(
                    code='VALIDATION_ERROR',
                    message='Invalid lookup request.',
                    details=lookup_serializer.errors,
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        api_obj = CATEGORY_TO_API[category]
        normalized_item_id = None
        if category == 'movie':
            normalized_item_id = api_utils.normalize_imdb_title_url_to_item_id(search_term)

        if normalized_item_id is not None:
            result = api_obj.get_details(normalized_item_id)
            if result.get('response') == 'False':
                return Response(
                    error_response(
                        code='UPSTREAM_ERROR',
                        message=result.get('error', 'Bad response from API.'),
                    ),
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                success_response([_build_search_result_from_item(result)], meta={'version': '2.0'}),
            )

        result = api_obj.search(search_term)
        if result.get('response') == 'False':
            return Response(
                error_response(
                    code='UPSTREAM_ERROR',
                    message=result.get('error', 'Bad response from API.'),
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            success_response(result.get('results', []), meta={'version': '2.0'}),
        )


class GetItemInfoV2(APIView):
    """Get review item details from DB cache or external provider (v2 format)."""
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        tags=['lookup'],
        summary='Get external review item details (v2)',
        parameters=[
            OpenApiParameter(name='category', type=str, location=OpenApiParameter.PATH),
            OpenApiParameter(name='item_id', type=str, location=OpenApiParameter.PATH),
        ],
        responses={200: dict, 400: dict, 403: dict},
    )
    def get(self, request, category, item_id):
        if category not in CATEGORY_TO_API:
            return Response(
                error_response(
                    code='INVALID_CATEGORY',
                    message='Invalid category.',
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        lookup_serializer = ExternalLookupSerializer(data={'item_id': item_id})
        if not lookup_serializer.is_valid():
            return Response(
                error_response(
                    code='VALIDATION_ERROR',
                    message='Invalid lookup request.',
                    details=lookup_serializer.errors,
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            review_item = ReviewItem.objects.get(item_id=item_id)
            return Response(
                success_response(ReviewItemSerializer(review_item).data, meta={'version': '2.0'}),
            )
        except ReviewItem.DoesNotExist:
            pass

        api_obj = CATEGORY_TO_API[category]
        item_data = api_obj.get_details(item_id)
        if item_data.get('response') == 'False':
            return Response(
                error_response(
                    code='UPSTREAM_ERROR',
                    message=item_data.get('error', 'Bad response from API.'),
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        item_data['category'] = category
        now = timezone.now()
        item_data['last_refreshed_at'] = now
        item_data['last_refresh_attempt_at'] = now
        item_data['refresh_error_count'] = 0
        serializer = ReviewItemSerializer(data=item_data)
        if serializer.is_valid():
            serializer.save()
            return Response(
                success_response(serializer.data, meta={'version': '2.0'}),
            )

        return Response(
            error_response(
                code='SERIALIZATION_ERROR',
                message='Failed to process item data.',
                details=serializer.errors,
            ),
            status=status.HTTP_400_BAD_REQUEST,
        )
