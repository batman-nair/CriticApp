"""GET /api/v3/reviews/facets: review counts for the list page's category chips and language menu."""

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny

from critic.api.responses import api_response
from critic.api.schema import problem_responses, wrapped
from critic.api.views import V3APIView
from review.utils.review_utils import count_review_languages, count_reviews_by_category

from .categories import CATEGORIES
from .filters import ReviewFilterParamsSerializer, filter_reviews

# A category with subcategories is shown as those, so "anime" has no chip of its own.
CATEGORY_CHIP_IDS = tuple(
    chip_id
    for category in CATEGORIES
    for chip_id in ([subcategory.id for subcategory in category.subcategories] or [category.id])
)


class CategoryFacetSerializer(serializers.Serializer):
    id = serializers.CharField()
    count = serializers.IntegerField()


class LanguageFacetSerializer(serializers.Serializer):
    name = serializers.CharField()
    count = serializers.IntegerField()


class ReviewFacetsSerializer(serializers.Serializer):
    total = serializers.IntegerField(help_text='Reviews matching every filter except the category ones')
    categories = CategoryFacetSerializer(many=True, help_text='Every chip, in /categories order, zero counts included')
    languages = LanguageFacetSerializer(many=True, help_text='Most common first, then by name')


class ReviewFacetsView(V3APIView):
    # Public and the same for everyone: no authentication, so a stale token
    # can't turn this read into a 401.
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['reviews'],
        operation_id='reviews_facets',
        summary='Count reviews by category and language',
        description=(
            'Takes the filters of `GET /api/v3/reviews`. `category` and `exclude_category` have no effect on '
            '`total` and the category counts, and `language` has no effect on the language counts, so a chip '
            "shows what you'd get by switching to it."
        ),
        parameters=[ReviewFilterParamsSerializer],
        responses={200: wrapped(ReviewFacetsSerializer), **problem_responses(400)},
    )
    def get(self, request):
        params = ReviewFilterParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        filters = params.validated_data
        total, category_counts = count_reviews_by_category(
            filter_reviews({**filters, 'category': [], 'exclude_category': []}), CATEGORY_CHIP_IDS,
        )
        languages = count_review_languages(filter_reviews({**filters, 'language': []}))
        return api_response(ReviewFacetsSerializer({
            'total': total,
            'categories': [{'id': chip_id, 'count': category_counts[chip_id]} for chip_id in CATEGORY_CHIP_IDS],
            'languages': [{'name': name, 'count': count} for name, count in languages],
        }).data)
