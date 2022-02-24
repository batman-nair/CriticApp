from django.test import TestCase
from django.contrib.auth import get_user_model

from model_bakery import baker

from .models import Review, ReviewItem

from . import utils

class APITest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='testuser', password='123test123')
        self.client.login(username='testuser', password='123test123')

    def tearDown(self):
        self.user.delete()

    def test_omdb_api_search(self):
        search_json = utils.get_omdb_search('Breaking Bad')
        self.assertEqual(search_json["Response"], "True")
        self.assertTrue(len(search_json["Search"]) > 0)
        search_result = search_json["Search"][0]
        self.assertTrue(all(param in search_result for param in ["Title", "Poster", "imdbID", "Year"]))

        search_json = utils.get_omdb_search('alskdjflaskjdflaksjdflkasjdlkfsajdlfksdjalfk')
        self.assertEqual(search_json["Response"], "False")

    def test_rawg_api_search(self):
        search_json = utils.get_rawg_search('Ori and the Blind Forest')
        self.assertEqual(search_json["Response"], "True")
        self.assertTrue(len(search_json["results"]) > 0)
        result = search_json["results"][0]
        self.assertTrue(all(param in result for param in ["name", "id", "background_image", "released"]))

        search_json = utils.get_rawg_search('alskdjflaskjdflaksjdflkasjdlkfsajdlfksdjalfk')
        self.assertEqual(search_json["Response"], "False")

    def check_review_search_json(self, search_json):
        self.assertTrue("Results" in search_json)
        self.assertEqual(search_json["Response"], "True")
        review_search_result = search_json["Results"][0]
        review_search_params = ["Title", "ItemID", "ImageURL", "Year"]
        self.assertTrue(all(param in review_search_result for param in review_search_params))

    def test_converted_searches(self):
        search_json = utils.get_omdb_search('Breaking Bad')
        review_json = utils.convert_omdb_to_review(search_json)
        self.check_review_search_json(review_json)

        invalid_search_json = utils.get_omdb_search('asdfaslkdfjlaksdjfalskdjfl')
        review_json = utils.convert_omdb_to_review(invalid_search_json)
        self.assertEqual(review_json["Response"], "False")

        search_json = utils.get_rawg_search('Ori and the Blind Forest')
        review_json = utils.convert_rawg_to_review(search_json)
        self.check_review_search_json(review_json)

        invalid_search_json = utils.get_rawg_search('asdfaslkdfjlaksdjfalskdjfl')
        review_json = utils.convert_rawg_to_review(invalid_search_json)
        self.assertEqual(review_json["Response"], "False")

    def check_review_info_json(self, info_json):
        self.assertTrue(info_json["Response"], "True")
        review_info_params = ["Title", "ItemID", "ImageURL", "Year", "Attr1", "Attr2", "Attr3", "Description", "Rating"]
        self.assertTrue(all(param in info_json for param in review_info_params))

    def test_converted_infos(self):
        info_json = utils.get_omdb_info('tt3896198')
        review_json = utils.convert_omdb_to_review(info_json)
        self.check_review_info_json(review_json)

        invalid_info_json = utils.get_omdb_info('laksjdflkasjdflkasjdalskdjfl')
        review_json = utils.convert_omdb_to_review(invalid_info_json)
        self.assertEqual(review_json["Response"], "False")

        info_json = utils.get_rawg_info('19590')
        review_json = utils.convert_rawg_to_review(info_json)
        self.check_review_info_json(review_json)

        invalid_info_json = utils.get_rawg_info('laksjdflkasjdflkasjdalskdjfl')
        review_json = utils.convert_rawg_to_review(invalid_info_json)
        self.assertEqual(review_json["Response"], "False")

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
        reviews = utils.get_filtered_review_objects()
        self.assertGreaterEqual(len(reviews), 10)
        json_data = utils.convert_reviews_to_json(reviews)
        self.assertTrue("Results" in json_data)
        self.assertGreaterEqual(len(json_data["Results"]), 10)
        review_json = json_data["Results"][0]
        self.assertTrue(all(field in review_json for field in ["ReviewData", "Rating", "ModifiedDate", "ReviewItem"]))

    def test_query_filter(self):
        reviews = utils.get_filtered_review_objects(query='Cool')
        self.assertTrue(len(reviews))
        reviews = utils.get_filtered_review_objects(query='This should not hopefull match any random string')
        self.assertFalse(len(reviews))

    def test_username_filter(self):
        reviews = utils.get_filtered_review_objects(username='testuser')
        self.assertTrue(len(reviews))
        reviews = utils.get_filtered_review_objects(username='Please dont match a random string')
        self.assertFalse(len(reviews))

    def test_category_filter(self):
        reviews = utils.get_filtered_review_objects(filter_categories=['movie'])
        self.assertTrue(all([review.review_item.category != 'movie' for review in reviews]))

    def test_ordering_filter(self):
        reviews = utils.get_filtered_review_objects(ordering='alpha')
        reviews = list(reviews)
        self.assertTrue(all(val[0].review_item.title <= val[1].review_item.title for val in zip(reviews[:-1], reviews[1:])))

    def test_multi_filter(self):
        reviews = utils.get_filtered_review_objects(query='Cool', username='testuser', filter_categories=['random'])
        self.assertEqual(len(reviews), 1)
        self.assertEqual(reviews[0].review_rating, 9.5)
