from django.test import TestCase
from django.contrib.auth import get_user_model

from model_bakery import baker

from .models import Review, ReviewItem
from .utils import review_utils
from .utils import api_utils

_JUNK_DATA = 'alskdjflaskjdflkasjdflkasjdflkasglhasldgfkj'

class APITest(TestCase):
    def setUp(self):
        self.omdb_api = api_utils.OMDBItemAPI()
        self.rawg_api = api_utils.RAWGItemAPI()

    def test_search(self):
        self._test_search_api(self.omdb_api, 'Breaking Bad')
        self._test_search_api(self.rawg_api, 'Ori and the Blind Forest')

    def _test_search_api(self, api_obj: api_utils.ReviewItemAPIBase, success_query: str):
        search_json = api_obj.search(success_query)
        self._check_review_search_json(search_json)
        search_json = api_obj.search(_JUNK_DATA)
        self._check_invalid_response(search_json)

    def _check_review_search_json(self, search_json: str):
        self.assertTrue("Results" in search_json)
        self.assertEqual(search_json["Response"], "True")
        review_search_result = search_json["Results"][0]
        review_search_params = ["Title", "ItemID", "ImageURL", "Year"]
        self.assertTrue(all(param in review_search_result for param in review_search_params))

    def test_details(self):
        self._test_details_api(self.omdb_api, 'omdb_tt3896198')
        self._test_details_api(self.rawg_api, 'rawg_19590')

    def _test_details_api(self, api_obj: api_utils.ReviewItemAPIBase, success_id: str):
        details_json = api_obj.get_details(success_id)
        self._check_review_info_json(details_json)
        details_json = api_obj.get_details(_JUNK_DATA)
        self._check_invalid_response(details_json)

    def _check_review_info_json(self, info_json):
        self.assertTrue(info_json["Response"], "True")
        review_info_params = ["Title", "ItemID", "ImageURL", "Year", "Attr1", "Attr2", "Attr3", "Description", "Rating"]
        self.assertTrue(all(param in info_json for param in review_info_params))

    def _check_invalid_response(self, json_data: dict):
        self.assertTrue(json_data["Response"], "False")


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
class ReviewQueryTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='testuser', password='123test123')
        self.review_item1 = ReviewItem.from_review_json(**SAMPLE_REVIEW_ITEM_JSON)
        self.review_item1.save()
        self.review1 = Review(user=self.user, review_item=self.review_item1, review_rating=9.5)
        self.review1.save()
        self.fake_reviews = [baker.make(Review) for _ in range(10)]

    def tearDown(self):
        self.user.delete()

    def test_basic_review_query(self):
        reviews = review_utils.get_filtered_review_objects()
        self.assertGreaterEqual(len(reviews), 10)
        json_data = review_utils.convert_reviews_to_json(reviews)
        self.assertTrue("Results" in json_data)
        self.assertGreaterEqual(len(json_data["Results"]), 10)
        review_json = json_data["Results"][0]
        self.assertTrue(all(field in review_json for field in ["ReviewData", "Rating", "ModifiedDate", "ReviewItem"]))

    def test_query_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='Cool')
        self.assertTrue(len(reviews))
        reviews = review_utils.get_filtered_review_objects(query='This should not hopefull match any random string')
        self.assertFalse(len(reviews))

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
