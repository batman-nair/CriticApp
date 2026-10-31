import re
from collections import Counter

from django.db.models import Q
from typing import Optional
from review.serializers import ReviewSerializer
from review.models import Review

ORDERING_DICT = {
    'alpha': 'review_item__title',
    '-alpha': '-review_item__title',
    'rating': 'review_rating',
    '-rating': '-review_rating',
    'date': 'modified_date',
    '-date': '-modified_date',
}

# Filters narrower than a category, used as "<category>:<subcategory>" in the
# category filters. Anime keeps the MAL (earlier Jikan) media type in attr3.
_ANIME_MOVIE = Q(review_item__category='anime', review_item__attr3__iexact='movie')
SUBCATEGORY_FILTERS = {
    'anime:series': Q(review_item__category='anime') & ~Q(review_item__attr3__iexact='movie'),
    'anime:movie': _ANIME_MOVIE,
}


def _normalize_categories(values: Optional[list]) -> list:
    if not values:
        return []
    normalized = []
    for value in values:
        if value is None:
            continue
        parts = [part.strip() for part in str(value).split(',') if part.strip()]
        normalized.extend(parts)
    return normalized


def _categories_to_q(categories: list) -> Optional[Q]:
    plain_categories = [category for category in categories if ':' not in category]
    query_obj = Q(review_item__category__in=plain_categories) if plain_categories else None
    for category in categories:
        if ':' not in category:
            continue
        # Unknown subcategories match nothing, like unknown categories do.
        sub_query_obj = SUBCATEGORY_FILTERS.get(category, Q(pk__in=[]))
        query_obj = sub_query_obj if query_obj is None else query_obj | sub_query_obj
    return query_obj


def _languages_to_q(languages: list) -> Q:
    # language holds a comma-separated list ("Korean, English"). Match whole
    # entries in any position, so "English" doesn't match "Old English".
    query_obj = None
    for language in languages:
        pattern = r'(^|,)\s*' + re.escape(language) + r'\s*(,|$)'
        language_query_obj = Q(review_item__language__iregex=pattern)
        query_obj = language_query_obj if query_obj is None else query_obj | language_query_obj
    return query_obj


def get_filtered_review_objects(
    query: str='',
    username: str='',
    filter_categories: list=None,
    ordering: str='',
    categories: list=None,
    exclude_categories: list=None,
    item_id: str='',
    languages: list=None,
) -> list[Review]:
    query_obj = None
    for word in query.split():
        word_query_obj = Q(review_item__title__icontains=word)
        word_query_obj |= Q(review_tags__icontains=word)
        word_query_obj |= Q(review_item__description__icontains=word)
        word_query_obj |= Q(review_item__attr1__icontains=word)
        word_query_obj |= Q(review_item__attr2__icontains=word)
        word_query_obj |= Q(review_item__year__icontains=word)
        word_query_obj |= Q(review_item__attr3__icontains=word)
        word_query_obj |= Q(review_item__language__icontains=word)
        if query_obj is None:
            query_obj = word_query_obj
        else:
            query_obj &= word_query_obj

    reviews = Review.objects.filter(query_obj) if query_obj else Review.objects.all()

    if username:
        reviews = reviews.filter(user__username=username)

    if item_id:
        reviews = reviews.filter(review_item__item_id=item_id)

    include_categories = _normalize_categories(categories)
    legacy_exclude_categories = _normalize_categories(filter_categories)
    explicit_exclude_categories = _normalize_categories(exclude_categories)

    if include_categories:
        reviews = reviews.filter(_categories_to_q(include_categories))

    if legacy_exclude_categories:
        reviews = reviews.exclude(_categories_to_q(legacy_exclude_categories))

    if explicit_exclude_categories:
        reviews = reviews.exclude(_categories_to_q(explicit_exclude_categories))

    include_languages = _normalize_categories(languages)
    if include_languages:
        reviews = reviews.filter(_languages_to_q(include_languages))

    ordering = ORDERING_DICT.get(ordering, '')
    if ordering in ('review_item__title', '-review_item__title'):
        reviews = list(reviews.select_related('review_item'))
        reviews.sort(key=lambda review: review.review_item.title, reverse=ordering.startswith('-'))
        return reviews
    if ordering:
        reviews = reviews.order_by(ordering)
    return reviews


def get_review_languages(username: str='') -> list[str]:
    """Languages of the reviewed items, most common first, then by name."""
    reviews = Review.objects.all()
    if username:
        reviews = reviews.filter(user__username=username)
    counts = Counter()
    for language_list in reviews.values_list('review_item__language', flat=True):
        counts.update(part.strip() for part in language_list.split(',') if part.strip())
    return sorted(counts, key=lambda language: (-counts[language], language))

def convert_reviews_to_json(reviews: list) -> dict:
    json_data = {'results': []}
    for review in reviews:
        json_data['results'].append(ReviewSerializer(review).data)
    return json_data
