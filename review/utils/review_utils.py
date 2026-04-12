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


def get_filtered_review_objects(
    query: str='',
    username: str='',
    filter_categories: list=None,
    ordering: str='',
    categories: list=None,
    exclude_categories: list=None,
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
        if query_obj is None:
            query_obj = word_query_obj
        else:
            query_obj &= word_query_obj

    reviews = Review.objects.filter(query_obj) if query_obj else Review.objects.all()

    if username:
        reviews = reviews.filter(user__username=username)

    include_categories = _normalize_categories(categories)
    legacy_exclude_categories = _normalize_categories(filter_categories)
    explicit_exclude_categories = _normalize_categories(exclude_categories)

    if include_categories:
        reviews = reviews.filter(review_item__category__in=include_categories)

    if legacy_exclude_categories:
        reviews = reviews.exclude(review_item__category__in=legacy_exclude_categories)

    if explicit_exclude_categories:
        reviews = reviews.exclude(review_item__category__in=explicit_exclude_categories)

    ordering = ORDERING_DICT.get(ordering, '')
    if ordering in ('review_item__title', '-review_item__title'):
        reviews = list(reviews.select_related('review_item'))
        reviews.sort(key=lambda review: review.review_item.title, reverse=ordering.startswith('-'))
        return reviews
    if ordering:
        reviews = reviews.order_by(ordering)
    return reviews

def convert_reviews_to_json(reviews: list) -> dict:
    json_data = {'results': []}
    for review in reviews:
        json_data['results'].append(ReviewSerializer(review).data)
    return json_data
