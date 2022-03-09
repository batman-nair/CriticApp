from django.test import TestCase
from django.contrib.auth import get_user_model

from model_bakery import baker
from .models import Review, ReviewItem

_JUNK_DATA = 'alskdjflaskjdflkasjdflkasjdflkasglhasldgfkj'

class ReviewItemAPITest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='testuser', password='123test123')
        self.client.login(username='testuser', password='123test123')

    def tearDown(self):
        self.user.delete()

    def _check_invalid_response(self, json_data):
        self.assertEqual(json_data["Response"], "False")
        self.assertTrue("Error" in json_data)

    def test_search_review_item(self):
        endpoint = '/search_item'
        json_data = self.client.get(endpoint+'/invalid/test').json()
        self._check_invalid_response(json_data)

        self._test_search_review_for_category(endpoint, 'movie', 'Breaking Bad')
        self._test_search_review_for_category(endpoint, 'game', 'Ori and the Blind')

    def _test_search_review_for_category(self, endpoint, category, valid_query):
        json_response = self.client.get('{}/{}/{}'.format(endpoint, category, valid_query))
        self._check_valid_search_response(json_response.json())
        json_response = self.client.get('{}/{}/{}'.format(endpoint, category, _JUNK_DATA))
        self._check_invalid_response(json_response.json())

    def _check_valid_search_response(self, json_data):
        self.assertEqual(json_data["Response"], "True")
        self.assertTrue(len(json_data["Results"]) > 0)

    def test_get_item_info(self):
        endpoint = '/get_item_info'
        json_data = self.client.get(endpoint+'/invalid/test').json()
        self._check_invalid_response(json_data)

        self._test_item_info_for_category(endpoint, 'movie', 'omdb_tt3896198')
        self._test_item_info_for_category(endpoint, 'game', 'rawg_19590')

    def _test_item_info_for_category(self, endpoint, category, valid_id):
        json_response = self.client.get('{}/{}/{}'.format(endpoint, category, valid_id))
        self._check_valid_item_info_response(json_response.json())
        json_response = self.client.get('{}/{}/{}'.format(endpoint, category, _JUNK_DATA))
        self._check_invalid_response(json_response.json())

    def _check_valid_item_info_response(self, json_data):
        self.assertEqual(json_data["Response"], "True")
        self.assertTrue("Title" in json_data)
        # Detailed data test done in utils testing

SAMPLE_REVIEW_ITEM_JSON = {
    "Category": "movie",
    "ItemID": "test1",
    "Title": "Cool title",
    "ImageURL": "http://fakeurl.com",
    "Year": "2021",
    "Attr1": "Attr1",
    "Attr2": "Attr2",
    "Attr3": "Attr3",
    "Description": "Sample desc",
    "Rating": "10",
    "Response": "True",
}

class ReviewAPITest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='testuser', password='123test123')
        self.client.login(username='testuser', password='123test123')
        self.review_item1 = ReviewItem.from_review_json(**SAMPLE_REVIEW_ITEM_JSON)
        self.review_item1.save()

    def tearDown(self):
        self.user.delete()

    def test_get_reviews(self):
        self.review1 = Review(user=self.user, review_item=self.review_item1, review_rating=9.5)
        self.review1.save()
        for _ in range(10):
            baker.make(Review)

        json_response = self.client.get('/reviews')
        self._check_valid_reviews_response(json_response.json())
        json_response = self.client.get('/reviews', {'query': 'Cool', 'username': self.user.username})
        self._check_valid_reviews_response(json_response.json())

        json_response = self.client.get('/reviews', {'query': _JUNK_DATA})
        self.assertEqual(len(json_response.json()["Results"]), 0)

    def _check_valid_reviews_response(self, json_data):
        self.assertTrue("Results" in json_data)
        self.assertGreater(len(json_data["Results"]), 0)

    def test_add_review(self):
        self.client.post('/add', {
            'item_id': self.review_item1.item_id,
            'category': self.review_item1.category,
            'rating': 8.3,
            'review': 'test review'})
        self.assertGreater(Review.objects.count(), 0)
        review_query = Review.objects.filter(review_item__item_id=self.review_item1.item_id)
        self.assertGreater(len(review_query), 0)


class AuthTest(TestCase):
    def test_auth_block(self):
        json_response = self.client.get('/search_item/movie/hello')
        self._check_invalid_response(json_response.json())
        json_response = self.client.get('/get_item_info/movie/tt3896198')
        self._check_invalid_response(json_response.json())

    def _check_invalid_response(self, json_data):
        self.assertEqual(json_data["Response"], "False")
        self.assertTrue("Error" in json_data)
