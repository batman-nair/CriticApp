"""The v3 watchlist endpoints: /api/v3/watchlist, /watchlist/facets and /watchlist/{item_id}.

A user's watchlist is private: every endpoint needs a login and only sees
the requesting user's entries.
"""

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from critic.api.errors import ApiError
from critic.api.pagination import V3LimitOffsetPagination
from critic.api.responses import api_response
from critic.api.schema import problem_responses, wrapped
from critic.api.views import V3APIView, V3GenericAPIView
from review.models import Review, WatchlistEntry
from review.providers import ProviderError
from review.utils.review_utils import categories_to_q, count_reviews_by_category

from .facets import CATEGORY_CHIP_IDS, CategoryFacetSerializer
from .filters import CATEGORY_FILTER_CHOICES, CommaSeparatedListField
from .items import ItemSerializer
from .services import get_or_fetch_item, provider_api_error


class WatchlistEntrySerializer(serializers.Serializer):
    item = ItemSerializer(source='review_item')
    added_at = serializers.DateTimeField()


class WatchlistListParamsSerializer(serializers.Serializer):
    category = CommaSeparatedListField(
        child=serializers.ChoiceField(choices=CATEGORY_FILTER_CHOICES), required=False, default=list,
        help_text='Only these categories. Repeat the param or separate values with commas',
    )


class WatchlistFacetsSerializer(serializers.Serializer):
    total = serializers.IntegerField(help_text='Entries on the watchlist')
    categories = CategoryFacetSerializer(many=True, help_text='Every chip, in /categories order, zero counts included')


class WatchlistEntryCreateSerializer(serializers.Serializer):
    item_id = serializers.CharField()
    added_at = serializers.DateTimeField(
        required=False,
        help_text="When the entry was added. Defaults to now; undoing a removal sends the entry's original value",
    )

    def validate_added_at(self, value):
        if value > timezone.now():
            raise serializers.ValidationError("added_at can't be in the future.", code='future')
        return value


def _already_reviewed():
    return ApiError(409, 'ALREADY_REVIEWED', "You've already reviewed this item.")


class WatchlistView(V3GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = WatchlistEntryCreateSerializer

    @extend_schema(
        tags=['watchlist'],
        operation_id='watchlist_list',
        summary="List the user's watchlist",
        description=(
            'The logged-in user\'s entries, newest `added_at` first. `category` can be repeated or '
            'separated with commas.'
        ),
        parameters=[
            WatchlistListParamsSerializer,
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
                description='How many entries to skip.',
            ),
        ],
        responses={200: wrapped(WatchlistEntrySerializer, paginated=True), **problem_responses(400, 401)},
    )
    def get(self, request):
        params = WatchlistListParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        entries = WatchlistEntry.objects.filter(user=request.user).select_related('review_item')
        if params.validated_data['category']:
            entries = entries.filter(categories_to_q(params.validated_data['category']))
        page = self.paginate_queryset(entries.order_by('-added_at', '-id'))
        return self.get_paginated_response(WatchlistEntrySerializer(page, many=True).data)

    @extend_schema(
        tags=['watchlist'],
        operation_id='watchlist_create',
        summary='Add an item to the watchlist',
        description=(
            "Add an item by its id. An item that isn't stored yet is fetched from its provider "
            '(picked by the id prefix) and stored. 201 with the new entry; 200 with the existing entry, '
            'unchanged, when the item is already on the watchlist (a sent `added_at` is ignored then). '
            '400 for a future `added_at`; 404 when the prefix is unknown or the provider has no such item; '
            '502 when the provider fails; 409 ALREADY_REVIEWED when the user already reviewed the item.'
        ),
        request=WatchlistEntryCreateSerializer,
        responses={
            200: wrapped(WatchlistEntrySerializer),
            201: wrapped(WatchlistEntrySerializer),
            **problem_responses(400, 401, 404, 409, 502),
        },
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        # One check, after the lookup. A reviewed item is always stored, and
        # the lookup returns a stored id without an upstream request, so a
        # check before it would save no quota. An alias id costs a request
        # either way; checking by the stored item catches it too.
        try:
            item = get_or_fetch_item(validated['item_id'])
        except ProviderError as ex:
            raise provider_api_error(ex) from ex

        if Review.objects.filter(user=request.user, review_item=item).exists():
            raise _already_reviewed()

        defaults = {'added_at': validated['added_at']} if 'added_at' in validated else {}
        # get_or_create re-reads on an IntegrityError, so a concurrent add of
        # the same item returns the other request's entry.
        entry, created = WatchlistEntry.objects.get_or_create(user=request.user, review_item=item, defaults=defaults)
        return api_response(WatchlistEntrySerializer(entry).data, status=201 if created else 200)


class WatchlistFacetsView(V3APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['watchlist'],
        operation_id='watchlist_facets',
        summary='Count watchlist entries by category',
        description="Counts for the logged-in user's watchlist, for the watchlist page's category chips.",
        responses={200: wrapped(WatchlistFacetsSerializer), **problem_responses(401)},
    )
    def get(self, request):
        total, category_counts = count_reviews_by_category(
            WatchlistEntry.objects.filter(user=request.user), CATEGORY_CHIP_IDS,
        )
        return api_response(WatchlistFacetsSerializer({
            'total': total,
            'categories': [{'id': chip_id, 'count': category_counts[chip_id]} for chip_id in CATEGORY_CHIP_IDS],
        }).data)


class WatchlistEntryView(V3APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['watchlist'],
        operation_id='watchlist_destroy',
        summary='Remove an item from the watchlist',
        description='By the stored item id (`item.id` of a listed entry). 404 when the item isn\'t on the watchlist.',
        responses={204: None, **problem_responses(401, 404)},
    )
    def delete(self, request, item_id):
        deleted, _ = WatchlistEntry.objects.filter(user=request.user, review_item_id=item_id).delete()
        if not deleted:
            raise NotFound()
        return Response(status=204)
