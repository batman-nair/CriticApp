"""Query params of the v3 review endpoints, and the filtering and sorting behind them.

Filtering goes through v2's get_filtered_review_objects(), so `q`, `category`
and `language` can't drift from v2.
"""

from django.db.models import F
from django.db.models.functions import Lower
from rest_framework import serializers

from review.utils.review_utils import get_filtered_review_objects

from .categories import CATEGORIES

CATEGORY_FILTER_CHOICES = tuple(
    choice
    for category in CATEGORIES
    for choice in (category.id, *(subcategory.id for subcategory in category.subcategories))
)

# updated_at can be NULL: old pods keep serving between the migrate job and
# the rollout, and Postgres sorts a NULL first on a plain DESC.
_SORT_EXPRESSIONS = {
    'updated': F('updated_at').asc(nulls_first=True),
    '-updated': F('updated_at').desc(nulls_last=True),
    'title': Lower('review_item__title').asc(),
    '-title': Lower('review_item__title').desc(),
    'rating': F('review_rating').asc(),
    '-rating': F('review_rating').desc(),
}

REVIEW_SORTS = tuple(_SORT_EXPRESSIONS)


class CommaSeparatedListField(serializers.ListField):
    """A list query param, as `?a=1,2`, `?a=1&a=2` or a mix of both."""

    def to_internal_value(self, data):
        if isinstance(data, list):
            data = [part.strip() for value in data for part in str(value).split(',') if part.strip()]
        return super().to_internal_value(data)


class ReviewFilterParamsSerializer(serializers.Serializer):
    username = serializers.CharField(required=False, allow_blank=True, default='', help_text="Only this user's reviews")
    q = serializers.CharField(
        required=False, allow_blank=True, default='', help_text='Search text. Every word has to match',
    )
    category = CommaSeparatedListField(
        child=serializers.ChoiceField(choices=CATEGORY_FILTER_CHOICES), required=False, default=list,
        help_text='Only these categories. Repeat the param or separate values with commas',
    )
    exclude_category = CommaSeparatedListField(
        child=serializers.ChoiceField(choices=CATEGORY_FILTER_CHOICES), required=False, default=list,
        help_text='Leave out these categories. Repeat the param or separate values with commas',
    )
    language = CommaSeparatedListField(
        child=serializers.CharField(), required=False, default=list,
        help_text='Only items in these languages. Repeat the param or separate values with commas',
    )


# Separate from the filters because #63 validates them but ignores `sort`.
class ReviewListParamsSerializer(ReviewFilterParamsSerializer):
    sort = serializers.ChoiceField(choices=REVIEW_SORTS, default='-updated')


def filter_reviews(params):
    """The reviews matching validated filter params, as an unordered queryset."""
    # No `ordering`: its 'alpha' path returns a Python list.
    return get_filtered_review_objects(
        query=params['q'],
        username=params['username'],
        categories=params['category'],
        exclude_categories=params['exclude_category'],
        languages=params['language'],
    )


def sort_reviews(reviews, sort):
    return reviews.order_by(_SORT_EXPRESSIONS[sort], '-id')
