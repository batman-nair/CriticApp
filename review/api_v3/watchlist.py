"""The v3 watchlist endpoints: /api/v3/watchlist, /watchlist/facets and /watchlist/{item_id}.

A user's watchlist is private: every endpoint needs a login and only sees
the requesting user's entries.
"""

from django.db import transaction
from django.db.models import Case, FloatField, IntegerField, When
from django.db.models.functions import Cast, Lower, Substr
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
from review.utils.review_utils import (
    categories_to_q,
    count_review_languages,
    count_reviews_by_category,
    item_word_q,
    languages_to_q,
)

from .facets import CATEGORY_CHIP_IDS, CategoryFacetSerializer, LanguageFacetSerializer
from .filters import CATEGORY_FILTER_CHOICES, CommaSeparatedListField
from .items import ItemSerializer
from .services import get_or_fetch_item, lock_item, provider_api_error


class WatchlistEntrySerializer(serializers.Serializer):
    item = ItemSerializer(source='review_item')
    added_at = serializers.DateTimeField()


# ReviewItem.rating and .year are text: a rating can be "N/A" or blank, and a
# year "2019", "2018–2021" or RAWG's "2019-05-01". The CAST is only reached
# for values that pass the regex, so Postgres never casts "N/A". Missing
# values sort last in both directions.
_RATING = Case(
    When(review_item__rating__regex=r'^\s*\d+(\.\d+)?\s*$', then=Cast('review_item__rating', FloatField())),
    default=None,
)
_START_YEAR = Case(
    When(review_item__year__regex=r'^\d{4}', then=Cast(Substr('review_item__year', 1, 4), IntegerField())),
    default=None,
)
# Ties go to the newest added.
_TIE_BREAK = ('-added_at', '-id')

WATCHLIST_SORTS = {
    '-added': _TIE_BREAK,
    'title': (Lower('review_item__title'), *_TIE_BREAK),
    '-rating': (_RATING.desc(nulls_last=True), *_TIE_BREAK),
    'rating': (_RATING.asc(nulls_last=True), *_TIE_BREAK),
    '-year': (_START_YEAR.desc(nulls_last=True), *_TIE_BREAK),
}


class WatchlistFilterParamsSerializer(serializers.Serializer):
    q = serializers.CharField(
        required=False, allow_blank=True, default='', help_text='Search text. Every word has to match',
    )
    category = CommaSeparatedListField(
        child=serializers.ChoiceField(choices=CATEGORY_FILTER_CHOICES), required=False, default=list,
        help_text='Only these categories. Repeat the param or separate values with commas',
    )
    language = CommaSeparatedListField(
        child=serializers.CharField(), required=False, default=list,
        help_text='Only items in these languages. Repeat the param or separate values with commas',
    )


class WatchlistListParamsSerializer(WatchlistFilterParamsSerializer):
    sort = serializers.ChoiceField(choices=tuple(WATCHLIST_SORTS), default='-added')


def filter_watchlist(user, params):
    """The user's entries matching validated filter params, as an unordered queryset."""
    entries = WatchlistEntry.objects.filter(user=user)
    for word in params['q'].split():
        entries = entries.filter(item_word_q(word))
    if params['category']:
        entries = entries.filter(categories_to_q(params['category']))
    if params['language']:
        entries = entries.filter(languages_to_q(params['language']))
    return entries


class WatchlistFacetsSerializer(serializers.Serializer):
    total = serializers.IntegerField(help_text='Entries matching every filter except the category one')
    categories = CategoryFacetSerializer(many=True, help_text='Every chip, in /categories order, zero counts included')
    languages = LanguageFacetSerializer(many=True, help_text='Most common first, then by name')


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
            'The logged-in user\'s entries. `q` searches the items\' titles (other titles too, such as an '
            'anime\'s English and Japanese ones), descriptions, people, genres, years and languages; every '
            'word has to match. `category` and `language` can be repeated or '
            'separated with commas. `sort`: `-added` (newest `added_at` first, the default), `title`, '
            '`-rating` and `rating` (the provider rating), `-year` (newest release first). Missing or '
            'unparseable ratings and years go last in both directions; ties go to the newest `added_at`.'
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
        entries = filter_watchlist(request.user, params.validated_data).select_related('review_item')
        page = self.paginate_queryset(entries.order_by(*WATCHLIST_SORTS[params.validated_data['sort']]))
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

        defaults = {'added_at': validated['added_at']} if 'added_at' in validated else {}
        with transaction.atomic():
            # So a review of the item created meanwhile can't be missed here
            # and miss this entry in turn.
            lock_item(item)
            if Review.objects.filter(user=request.user, review_item=item).exists():
                raise _already_reviewed()
            # get_or_create re-reads on an IntegrityError, so a concurrent add
            # of the same item returns the other request's entry.
            entry, created = WatchlistEntry.objects.get_or_create(
                user=request.user, review_item=item, defaults=defaults,
            )
        return api_response(WatchlistEntrySerializer(entry).data, status=201 if created else 200)


class WatchlistFacetsView(V3APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['watchlist'],
        operation_id='watchlist_facets',
        summary='Count watchlist entries by category and language',
        description=(
            "Counts for the logged-in user's watchlist, for the watchlist page's category chips and language "
            'menu. Takes the filters of `GET /api/v3/watchlist`. `category` has no effect on `total` and the '
            "category counts, and `language` has no effect on the language counts, so a chip shows what you'd "
            'get by switching to it.'
        ),
        parameters=[WatchlistFilterParamsSerializer],
        responses={200: wrapped(WatchlistFacetsSerializer), **problem_responses(400, 401)},
    )
    def get(self, request):
        params = WatchlistFilterParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        filters = params.validated_data
        total, category_counts = count_reviews_by_category(
            filter_watchlist(request.user, {**filters, 'category': []}), CATEGORY_CHIP_IDS,
        )
        languages = count_review_languages(filter_watchlist(request.user, {**filters, 'language': []}))
        return api_response(WatchlistFacetsSerializer({
            'total': total,
            'categories': [{'id': chip_id, 'count': category_counts[chip_id]} for chip_id in CATEGORY_CHIP_IDS],
            'languages': [{'name': name, 'count': count} for name, count in languages],
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
