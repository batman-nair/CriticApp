"""The v3 reviews endpoints: /api/v3/reviews and /api/v3/reviews/{id}."""

from decimal import Decimal

from django.core.validators import RegexValidator
from django.db import IntegrityError, transaction
from django.urls import reverse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_field
from rest_framework import serializers
from rest_framework.permissions import SAFE_METHODS, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from critic.api.errors import PROBLEM_CONTENT_TYPE, ApiError, ProblemSerializer, status_title
from critic.api.pagination import V3LimitOffsetPagination
from critic.api.responses import api_response
from critic.api.schema import problem_responses, wrapped
from critic.api.views import V3GenericAPIView
from review.models import Review
from review.permissions import IsOwnerOrReadOnly
from review.providers import ProviderError

from .filters import ReviewListParamsSerializer, filter_reviews, sort_reviews
from .items import ItemSerializer
from .services import get_or_fetch_item, provider_api_error

_TAGS_MAX_LENGTH = Review._meta.get_field('review_tags').max_length


class ReviewUserSerializer(serializers.Serializer):
    username = serializers.CharField()


class ReviewSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    user = ReviewUserSerializer()
    item = ItemSerializer(source='review_item')
    rating = serializers.DecimalField(source='review_rating', max_digits=4, decimal_places=2, coerce_to_string=False)
    text = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(allow_null=True, help_text='Null for reviews older than this field')
    updated_at = serializers.DateTimeField(allow_null=True)

    # Not items._text: that also turns a user's literal "N/A" into null.
    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_text(self, review):
        return (review.review_data or '').strip() or None

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_tags(self, review):
        parts = (part.strip() for part in (review.review_tags or '').split(','))
        return [part for part in parts if part]


class ReviewWriteSerializer(serializers.ModelSerializer):
    # coerce_to_string=False, or the request schema types it as a string.
    rating = serializers.DecimalField(
        source='review_rating', max_digits=4, decimal_places=2,
        min_value=Decimal('0'), max_value=Decimal('10'), coerce_to_string=False,
    )
    text = serializers.CharField(
        source='review_data', required=False, allow_null=True, allow_blank=True, max_length=5000,
    )
    tags = serializers.ListField(
        source='review_tags', required=False, max_length=10,
        child=serializers.CharField(max_length=50, validators=[RegexValidator(r'^[A-Za-z0-9-]+\Z')]),
    )

    class Meta:
        model = Review
        fields = ('rating', 'text', 'tags')

    def validate_text(self, value):
        return value or None

    def validate_tags(self, value):
        tags = {}
        for tag in value:
            # Case-insensitive duplicates keep the first spelling.
            tags.setdefault(tag.casefold(), tag)
        joined = ','.join(tags.values())
        if len(joined) > _TAGS_MAX_LENGTH:
            raise serializers.ValidationError(
                f'The tags can have at most {_TAGS_MAX_LENGTH} characters when joined with commas.',
                code='max_length',
            )
        return joined or None


class ReviewCreateSerializer(ReviewWriteSerializer):
    item_id = serializers.CharField()

    class Meta(ReviewWriteSerializer.Meta):
        fields = (*ReviewWriteSerializer.Meta.fields, 'item_id')

    def create(self, validated_data):
        validated_data.pop('item_id')
        return super().create(validated_data)


class ReviewUpdateSerializer(ReviewWriteSerializer):
    def validate(self, attrs):
        if 'item_id' in self.initial_data:
            raise serializers.ValidationError({'item_id': ["A review's item can't be changed."]}, code='read_only')
        return attrs


# Schema only: the 409 body of POST /reviews.
class DuplicateReviewProblemSerializer(ProblemSerializer):
    existing_review_id = serializers.IntegerField()


def _existing_review_id(user, item_id):
    return Review.objects.filter(user=user, review_item_id=item_id).values_list('id', flat=True).first()


def _duplicate_review(review_id):
    return ApiError(409, 'DUPLICATE_REVIEW', "You've already reviewed this item.", extra={'existing_review_id': review_id})


class PublicReadMixin:
    """No authentication on safe methods, so a stale token can't turn a public
    read into a 401. `authentication_classes = []` can't be used because the
    same classes take writes.
    """

    def get_authenticators(self):
        # request is None while spectacular builds its mock request.
        if self.request is not None and self.request.method in SAFE_METHODS:
            return []
        return super().get_authenticators()


class ReviewListCreateView(PublicReadMixin, V3GenericAPIView):
    permission_classes = [IsAuthenticatedOrReadOnly]
    serializer_class = ReviewCreateSerializer

    @extend_schema(
        tags=['reviews'],
        operation_id='reviews_list',
        summary='List reviews',
        description='Reviews matching the filters. List params can be repeated or separated with commas.',
        parameters=[
            ReviewListParamsSerializer,
            OpenApiParameter(
                'limit', OpenApiTypes.INT, OpenApiParameter.QUERY, required=False,
                description=(
                    f'Page size. Default {V3LimitOffsetPagination.default_limit}; values above '
                    f'{V3LimitOffsetPagination.max_limit} are cut down to {V3LimitOffsetPagination.max_limit}, '
                    'and invalid values fall back to the default.'
                ),
            ),
            OpenApiParameter(
                'offset', OpenApiTypes.INT, OpenApiParameter.QUERY, required=False,
                description='How many reviews to skip.',
            ),
        ],
        responses={200: wrapped(ReviewSerializer, paginated=True), **problem_responses(400)},
    )
    def get(self, request):
        params = ReviewListParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        reviews = filter_reviews(params.validated_data).select_related('user', 'review_item')
        page = self.paginate_queryset(sort_reviews(reviews, params.validated_data['sort']))
        return self.get_paginated_response(ReviewSerializer(page, many=True).data)

    @extend_schema(
        tags=['reviews'],
        operation_id='reviews_create',
        summary='Create a review',
        description=(
            "Review an item by its id. An item that isn't stored yet is fetched from its provider "
            '(picked by the id prefix) and stored. 404 when the prefix is unknown or the provider has '
            'no such item; 502 when the provider fails; 409 DUPLICATE_REVIEW with `existing_review_id` '
            'when the user already reviewed the item.'
        ),
        request=ReviewCreateSerializer,
        responses={
            201: wrapped(ReviewSerializer),
            **problem_responses(400, 401, 404, 502),
            (409, PROBLEM_CONTENT_TYPE): OpenApiResponse(DuplicateReviewProblemSerializer, description=status_title(409)),
        },
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item_id = serializer.validated_data['item_id']

        # Before the item lookup, so a duplicate never spends upstream quota.
        existing_id = _existing_review_id(request.user, item_id)
        if existing_id is not None:
            raise _duplicate_review(existing_id)

        try:
            item = get_or_fetch_item(item_id)
        except ProviderError as ex:
            raise provider_api_error(ex) from ex

        try:
            with transaction.atomic():
                review = serializer.save(user=request.user, review_item=item)
        except IntegrityError:
            # A concurrent request created the same review, or item_id is an
            # alias of a stored item: providers build the stored id themselves.
            existing_id = _existing_review_id(request.user, item.pk)
            if existing_id is None:
                raise
            raise _duplicate_review(existing_id) from None

        return api_response(
            ReviewSerializer(review).data, status=201, headers={'Location': reverse('v3-review', args=[review.pk])},
        )


class ReviewDetailView(PublicReadMixin, V3GenericAPIView):
    permission_classes = [IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]
    queryset = Review.objects.select_related('user', 'review_item')

    @extend_schema(
        tags=['reviews'],
        operation_id='reviews_retrieve',
        summary='Get a review',
        responses={200: wrapped(ReviewSerializer), **problem_responses(404)},
    )
    def get(self, request, pk):
        return api_response(ReviewSerializer(self.get_object()).data)

    @extend_schema(
        tags=['reviews'],
        operation_id='reviews_partial_update',
        summary='Update a review',
        description='Only the fields sent change. The item can\'t be changed. `text: null` and `tags: []` clear them.',
        request=ReviewUpdateSerializer,
        responses={200: wrapped(ReviewSerializer), **problem_responses(400, 401, 403, 404)},
    )
    def patch(self, request, pk):
        # First, so 403 and 404 come before 400.
        review = self.get_object()
        serializer = ReviewUpdateSerializer(review, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return api_response(ReviewSerializer(serializer.save()).data)

    @extend_schema(
        tags=['reviews'],
        operation_id='reviews_destroy',
        summary='Delete a review',
        responses={204: None, **problem_responses(401, 403, 404)},
    )
    def delete(self, request, pk):
        self.get_object().delete()
        return Response(status=204)
