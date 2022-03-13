from review.serializers import ReviewSerializer
from review.models import Review

ORDERING_DICT = {
    'alpha': 'review_item__title',
    '-alpha': '-review_item__title',
    'rating': 'review_rating',
    '-rating': '-review_rating',
    'date': 'modified_date',
    'relevance': '',
}
def get_filtered_review_objects(query: str='', username: str='', filter_categories: list=None, ordering: str='') -> list[Review]:
    reviews = Review.objects.filter(review_item__title__icontains=query)
    if username:
        reviews = reviews.filter(user__username=username)
    if filter_categories:
        reviews = reviews.exclude(review_item__category__in=filter_categories)
    ordering = ORDERING_DICT.get(ordering, '')
    if ordering:
        reviews = reviews.order_by(ordering)
    return reviews

def convert_reviews_to_json(reviews: list) -> dict:
    json_data = {'results': []}
    for review in reviews:
        json_data['results'].append(ReviewSerializer(review).data)
    return json_data
