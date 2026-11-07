"""GET /api/v3/search: search a category's provider, for the add-review sheet."""

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated

from critic.api.errors import ApiError
from critic.api.responses import api_response
from critic.api.schema import problem_responses, wrapped
from critic.api.views import V3APIView
from review.models import Review
from review.providers import CATEGORIES, ItemNotFound, ProviderError, WrongCategory, get_provider
from review.providers.omdb import normalize_imdb_title_url_to_item_id

from .items import parse_years


class SearchParamsSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=CATEGORIES)
    q = serializers.CharField(max_length=100, help_text='Search text. For movie and series, also a full IMDb title URL')


class MyReviewSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    rating = serializers.DecimalField(max_digits=4, decimal_places=2, coerce_to_string=False)


class SearchResultSerializer(serializers.Serializer):
    id = serializers.CharField()
    category = serializers.ChoiceField(choices=CATEGORIES)
    title = serializers.CharField()
    image_url = serializers.URLField(allow_null=True)
    start_year = serializers.IntegerField(allow_null=True)
    end_year = serializers.IntegerField(allow_null=True)
    genres = serializers.ListField(
        child=serializers.CharField(), allow_null=True,
        help_text="Null when the provider's search doesn't give genres; [] when it gave none",
    )
    provider_rating = serializers.FloatField(
        allow_null=True, help_text="The source's rating, 0-10. Null when the provider's search doesn't give it",
    )
    my_review = MyReviewSerializer(allow_null=True, help_text="The logged-in user's review of this item, if any")


def _search_result(summary, my_reviews):
    start_year, end_year = parse_years(summary.year)
    return {
        'id': summary.item_id,
        'category': summary.category,
        'title': summary.title,
        'image_url': summary.image_url,
        'start_year': start_year,
        'end_year': end_year,
        'genres': summary.genres,
        'provider_rating': summary.provider_rating,
        'my_review': my_reviews.get(summary.item_id),
    }


class SearchView(V3APIView):
    # Search spends upstream quota, so it needs a login and is rate limited.
    permission_classes = [IsAuthenticated]
    throttle_scope = 'search'

    @extend_schema(
        tags=['search'],
        operation_id='search_list',
        summary='Search items',
        description=(
            "Search the category's provider. `genres` and `provider_rating` are filled only when the "
            'provider returns them with its search. Nothing found is an empty list; a failing '
            'provider is 502 UPSTREAM_ERROR.'
        ),
        parameters=[SearchParamsSerializer],
        responses={200: wrapped(SearchResultSerializer, many=True), **problem_responses(400, 401, 429, 502)},
    )
    def get(self, request):
        params = SearchParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        category = params.validated_data['category']
        query = params.validated_data['q']

        provider = get_provider(category)
        imdb_item_id = normalize_imdb_title_url_to_item_id(query) if category in ('movie', 'series') else None
        try:
            if imdb_item_id is not None:
                # The details come in one request too, with genres and rating.
                summaries = [provider.get_details(imdb_item_id)]
            else:
                summaries = provider.search(query)
        except ItemNotFound:
            summaries = []
        except WrongCategory as ex:
            # An IMDb URL of a series in a movie search, or the other way round.
            raise serializers.ValidationError({'q': [ex.message]}, code='wrong_category') from ex
        except ProviderError as ex:
            raise ApiError(502, 'UPSTREAM_ERROR', ex.message) from ex

        my_reviews = {}
        if summaries:
            rows = Review.objects.filter(
                user=request.user, review_item_id__in=[summary.item_id for summary in summaries],
            ).values_list('review_item_id', 'id', 'review_rating')
            my_reviews = {item_id: {'id': review_id, 'rating': rating} for item_id, review_id, rating in rows}

        results = [_search_result(summary, my_reviews) for summary in summaries]
        return api_response(SearchResultSerializer(results, many=True).data)
