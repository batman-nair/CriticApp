from django.test import TestCase
from django.contrib.auth import get_user_model

from model_bakery import baker

from review.models import Review
from review.serializers import ReviewItemSerializer
from review.utils import review_utils
from review.utils import api_utils

import time

_JUNK_DATA = 'alskdjflaskjdflkasjdflkasjdflkasglhasldgfkj'

class UtilAPITest(TestCase):
    def setUp(self):
        self.omdb_api = api_utils.OMDBItemAPI()
        self.rawg_api = api_utils.RAWGItemAPI()
        self.jikan_anime_api = api_utils.JikanItemAPI('anime')
        self.jikan_manga_api = api_utils.JikanItemAPI('manga')

    def test_search(self):
        self._test_search_api(self.omdb_api, 'Breaking Bad')
        self._test_search_api(self.rawg_api, 'Ori and the Blind Forest')
        self._test_search_api(self.jikan_anime_api, 'Kimetsu no Yaiba')
        # Sleep to avoid rate limiting
        time.sleep(1)
        self._test_search_api(self.jikan_manga_api, 'Berserk')

    def _test_search_api(self, api_obj: api_utils.ReviewItemAPIBase, success_query: str):
        search_json = api_obj.search(success_query)
        self._check_review_search_json(search_json)
        search_json = api_obj.search(_JUNK_DATA)
        self._check_invalid_response(search_json)

    def _check_review_search_json(self, search_json: str):
        self.assertTrue("results" in search_json, "Expected entry 'results' but got {}".format(search_json))
        self.assertEqual(search_json["response"], "True")
        review_search_result = search_json["results"][0]
        review_search_params = ["title", "item_id", "image_url", "year"]
        self.assertTrue(all(param in review_search_result for param in review_search_params))

    def test_details(self):
        self._test_details_api(self.omdb_api, 'omdb_tt3896198')
        self._test_details_api(self.rawg_api, 'rawg_19590')
        self._test_details_api(self.jikan_anime_api, 'jikan_anime_38000')
        self._test_details_api(self.jikan_manga_api, 'jikan_manga_2')

    def _test_details_api(self, api_obj: api_utils.ReviewItemAPIBase, success_id: str):
        details_json = api_obj.get_details(success_id)
        self._check_review_info_json(details_json)
        details_json = api_obj.get_details(_JUNK_DATA)
        self._check_invalid_response(details_json)

    def _check_review_info_json(self, info_json):
        self.assertTrue(info_json["response"], "True")
        review_info_params = ["title", "item_id", "image_url", "year", "attr1", "attr2", "attr3", "description", "rating"]
        self.assertTrue(all(param in info_json for param in review_info_params))

    def _check_invalid_response(self, json_data: dict):
        self.assertTrue(json_data["response"], "False")


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
class ReviewQueryTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='testuser', password='123test123')
        item_serializer = ReviewItemSerializer(data=SAMPLE_REVIEW_ITEM_JSON)
        item_serializer.is_valid()
        self.review_item1 = item_serializer.save()
        self.review1 = Review(user=self.user, review_item=self.review_item1, review_rating=9.5)
        self.review1.save()
        self.fake_reviews = [baker.make(Review) for _ in range(10)]

    def tearDown(self):
        self.user.delete()

    def test_basic_review_query(self):
        reviews = review_utils.get_filtered_review_objects()
        self.assertGreaterEqual(len(reviews), 10)
        json_data = review_utils.convert_reviews_to_json(reviews)
        self.assertTrue("results" in json_data)
        self.assertGreaterEqual(len(json_data["results"]), 10)
        review_json = json_data["results"][0]
        self.assertTrue(all(field in review_json for field in ["review_data", "review_rating", "modified_date", "review_item"]))

    def test_query_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='Cool')
        self.assertTrue(len(reviews))
        reviews = review_utils.get_filtered_review_objects(query='This should not hopefull match any random string')
        self.assertFalse(len(reviews))

    def test_advanced_query_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='title cool attr1 attr2')
        self.assertTrue(len(reviews), 'Multiple field matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='attr1')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='attr2')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='desc')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='Cool but not title')
        self.assertFalse(len(reviews), 'Partial match shouldnt show up')

    def test_username_filter(self):
        reviews = review_utils.get_filtered_review_objects(username='testuser')
        self.assertTrue(len(reviews))
        reviews = review_utils.get_filtered_review_objects(username='Please dont match a random string')
        self.assertFalse(len(reviews))

    def test_category_filter(self):
        reviews = review_utils.get_filtered_review_objects(filter_categories=['movie'])
        self.assertTrue(all([review.review_item.category != 'movie' for review in reviews]))

    def test_ordering_filter(self):
        reviews = review_utils.get_filtered_review_objects(ordering='alpha')
        reviews = list(reviews)
        self.assertTrue(all(val[0].review_item.title <= val[1].review_item.title for val in zip(reviews[:-1], reviews[1:])))

    def test_multi_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='Cool', username='testuser', filter_categories=['random'])
        self.assertEqual(len(reviews), 1)
        self.assertEqual(reviews[0].review_rating, 9.5)
