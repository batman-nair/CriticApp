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
    json_data = {'Results': []}
    for review in reviews:
        json_data['Results'].append(_convert_review_to_json(review))
    return json_data

def _convert_review_to_json(review: Review) -> dict:
    review_item_json = review.review_item.to_review_json()
    review_json = {
        'ReviewData': review.review_data,
        'Rating': review.review_rating,
        'ModifiedDate': review.modified_date,
        'ReviewItem': review_item_json
    }
    return review_json
