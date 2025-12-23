from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase, APITransactionTestCase
from rest_framework import status

from model_bakery import baker
from review.models import Review
from review.serializers import ReviewItemSerializer

_JUNK_DATA = 'alskdjflaskjdflkasjdflkasjdflkasglhasldgfkj'

SAMPLE_REVIEW_ITEM_JSON = {
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
    "response": "True",
}

GET_ENDPOINT = '/api/reviews/'
POST_ENDPOINT = '/api/reviews/create/'
DETAIL_ENDPOINT = '/api/reviews/{id}/'
ADD_OR_EDIT_ENDPOINT = '/api/reviews/post_review/'

class ReviewAPITest(APITransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='testuser', password='123test123')
        self.client.login(username='testuser', password='123test123')
        item_serializer = ReviewItemSerializer(data=SAMPLE_REVIEW_ITEM_JSON)
        item_serializer.is_valid(raise_exception=True)
        self.review_item1 = item_serializer.save()

    def tearDown(self):
        self.user.delete()

    def test_get_reviews(self):
        self.review1 = Review(user=self.user, review_item=self.review_item1, review_rating=9.5)
        self.review1.save()
        self._populate_review_data(num_items=10)

        json_response = self.client.get(GET_ENDPOINT)
        self._check_valid_reviews_response(json_response.json())
        json_response = self.client.get(GET_ENDPOINT, {'query': 'Cool', 'username': self.user.username})
        self._check_valid_reviews_response(json_response.json())

        json_response = self.client.get(GET_ENDPOINT, {'query': _JUNK_DATA})
        self.assertEqual(len(json_response.json()), 0)

    def _populate_review_data(self, num_items):
        for _ in range(num_items):
            baker.make(Review)

    def _check_valid_reviews_response(self, json_data):
        self.assertGreater(len(json_data), 0)

    def test_post_review(self):
        response = self.client.post(POST_ENDPOINT, {
            'review_item': self.review_item1.item_id,
            'category': self.review_item1.category,
            'review_rating': 8.3,
            'review_tags': 'test',
            'review_data': 'test review'})
        self.assertGreater(Review.objects.count(), 0, msg="Error creating review "+str(response))
        review_query = Review.objects.filter(review_item__item_id=self.review_item1.item_id)
        self.assertGreater(len(review_query), 0)

    def test_review_detail(self):
        review = Review.objects.create(
            user = self.user,
            review_item = self.review_item1,
            review_data = 'test_data',
            review_rating = 8.1
        )

        response = self.client.get(DETAIL_ENDPOINT.format(id=review.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertEqual(json_data['review_data'], 'test_data')
        self.assertTrue(all(field in json_data for field in ['review_item', 'review_data', 'review_rating', 'review_tags', 'user']))

        response = self.client.put(DETAIL_ENDPOINT.format(id=review.id), {
            'review_item': self.review_item1.item_id,
            'review_data': 'new_data',
            'review_rating': 4.1
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_review = Review.objects.get(id=review.id)
        self.assertEqual(new_review.review_data, 'new_data')
        self.assertEqual(new_review.review_rating, Decimal('4.1'))

        response = self.client.delete(DETAIL_ENDPOINT.format(id=review.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(len(Review.objects.all()), 0)

    def test_add_or_edit_review(self):
        response = self.client.post(ADD_OR_EDIT_ENDPOINT, {
            'id': '',
            'review_item': self.review_item1.item_id,
            'category': self.review_item1.category,
            'review_rating': 8.3,
            'review_tags': 'test',
            'review_data': 'test review'})
        self.assertRedirects(response, reverse('review:add_review'), fetch_redirect_response=False)
        self.assertGreater(Review.objects.count(), 0, msg="Error creating review "+str(response))
        review_query = Review.objects.filter(review_item__item_id=self.review_item1.item_id)
        self.assertGreater(len(review_query), 0)

        self._populate_review_data(num_items=10)
        num_reviews = len(Review.objects.all())
        review_id = Review.objects.get(review_item=self.review_item1.item_id).id
        response = self.client.post(ADD_OR_EDIT_ENDPOINT, {
            'id': review_id,
            'review_item': self.review_item1.item_id,
            'category': self.review_item1.category,
            'review_rating': 8.3,
            'review_tags': 'test',
            'review_data': 'test review changed'})
        self.assertRedirects(response, reverse('review:add_review'), fetch_redirect_response=False)
        self.assertEqual(len(Review.objects.all()), num_reviews, msg="Review got created, not editted")
        self.assertEqual(Review.objects.get(pk=review_id).review_data, 'test review changed')

    def test_add_or_edit_review_errors(self):
        invalid_id_response = self.client.post(ADD_OR_EDIT_ENDPOINT, {
            'id': 101,
            'review_item': self.review_item1.item_id,
            'category': self.review_item1.category,
            'review_rating': 8.3,
            'review_tags': 'test',
            'review_data': 'test review changed'})
        self.assertRedirects(invalid_id_response, reverse('review:add_review'), fetch_redirect_response=False)
        self.assertEqual(len(Review.objects.all()), 0)
        invalid_review_response = self.client.post(ADD_OR_EDIT_ENDPOINT, {
            'id': '',
            'review_item': _JUNK_DATA,
            'category': self.review_item1.category,
            'review_rating': 8.3,
            'review_tags': 'test',
            'review_data': 'test review changed'})
        self.assertRedirects(invalid_review_response, reverse('review:add_review'), fetch_redirect_response=False)
        self.assertEqual(len(Review.objects.all()), 0)

        review = Review.objects.create(
            user = self.user,
            review_item = self.review_item1,
            review_data = 'test_data',
            review_rating = 8.1
        )
        duplicate_review_response = self.client.post(ADD_OR_EDIT_ENDPOINT, {
            'id': '',
            'review_item': review.review_item.item_id,
            'category': self.review_item1.category,
            'review_rating': 8.3,
            'review_tags': 'test',
            'review_data': 'test review changed'})
        self.assertRedirects(duplicate_review_response, reverse('review:add_review'), fetch_redirect_response=False)
        self.assertEqual(len(Review.objects.all()), 1)




class ReviewAPIAuthTest(APITestCase):
    def setUp(self):
        item_serializer = ReviewItemSerializer(data=SAMPLE_REVIEW_ITEM_JSON)
        item_serializer.is_valid(raise_exception=True)
        self.review_item1 = item_serializer.save()

    def test_auth_block(self):
        response = self.client.post(POST_ENDPOINT, {
            'review_item': self.review_item1.item_id,
            'category': self.review_item1.category,
            'review_rating': 8.3,
            'review_tags': 'test',
            'review_data': 'test review'})
        self._check_forbidden_response(response)

    def test_review_edit_permissions(self):
        user1 = get_user_model().objects.create_user(username='testuser', password='123test123')
        user2 = get_user_model().objects.create_user(username='wronguser', password='123test123')
        review = Review.objects.create(
            user=user1,
            review_item=self.review_item1,
            review_rating=8.3,
            review_data='test data'
        )
        self.client.login(username=user2.username, password='123test123')
        response = self.client.delete(DETAIL_ENDPOINT.format(id=review.id))
        self._check_forbidden_response(response)
        response = self.client.put(DETAIL_ENDPOINT.format(id=review.id), {
            'review_item': self.review_item1,
            'review_data': 'test2',
            'review_rating': 7.1
        })
        self._check_forbidden_response(response)



    def _check_forbidden_response(self, response):
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


