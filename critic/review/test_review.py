from django.test import TestCase
from django.contrib.auth import get_user_model

_JUNK_DATA = 'alskdjflaskjdflkasjdflkasjdflkasglhasldgfkj'

class ReviewAPITest(TestCase):
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

        self._test_item_info_for_category(endpoint, 'movie', 'tt3896198')
        self._test_item_info_for_category(endpoint, 'game', '19590')

    def _test_item_info_for_category(self, endpoint, category, valid_id):
        json_response = self.client.get('{}/{}/{}'.format(endpoint, category, valid_id))
        self._check_valid_item_info_response(json_response.json())
        json_response = self.client.get('{}/{}/{}'.format(endpoint, category, _JUNK_DATA))
        self._check_invalid_response(json_response.json())

    def _check_valid_item_info_response(self, json_data):
        self.assertEqual(json_data["Response"], "True")
        self.assertTrue("Title" in json_data)
        # Detailed data test done in utils testing
