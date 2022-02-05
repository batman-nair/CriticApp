from django.test import TestCase
from django.contrib.auth.models import User

from . import utils

class APITestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='123test123')
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
        self.assertTrue("Search" in search_json)
        self.assertEqual(search_json["Response"], "True")
        review_search_result = search_json["Search"][0]
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
