import pytest

from review.utils import api_utils

import time

_JUNK_DATA = 'alskdjflaskjdflkasjdflkasjdflkasglhasldgfkj'


@pytest.mark.integration
class UtilAPITest:
    """Integration tests that hit real external APIs (OMDb, RAWG, Jikan).

    Skipped in CI by default. Run with: pytest -m integration
    """

    def setup_method(self):
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
        assert "results" in search_json, "Expected entry 'results' but got {}".format(search_json)
        assert search_json["response"] == "True"
        review_search_result = search_json["results"][0]
        review_search_params = ["title", "item_id", "image_url", "year"]
        assert all(param in review_search_result for param in review_search_params)

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
        assert info_json["response"] == "True"
        review_info_params = ["title", "item_id", "image_url", "year", "attr1", "attr2", "attr3", "description", "rating"]
        assert all(param in info_json for param in review_info_params)

    def _check_invalid_response(self, json_data: dict):
        assert json_data["response"] == "False"
