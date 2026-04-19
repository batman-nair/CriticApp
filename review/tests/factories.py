"""Shared test constants and factory helpers."""

from review.serializers import ReviewItemSerializer


SAMPLE_REVIEW_ITEM_DATA = {
    "category": "movie",
    "item_id": "test1",
    "title": "Cool title",
    "image_url": "http://fakeurl.com",
    "year": "2021",
    "attr1": "Attr1",
    "attr2": "Attr2",
    "attr3": "Attr3",
    "description": "Sample desc",
    "rating": "10",
}

JUNK_DATA = 'alskdjflaskjdflkasjdflkasjdflkasglhasldgfkj'


def create_review_item(**overrides):
    """Create and return a ReviewItem via serializer. Accepts field overrides."""
    data = {**SAMPLE_REVIEW_ITEM_DATA, "response": "True", **overrides}
    serializer = ReviewItemSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.save()
