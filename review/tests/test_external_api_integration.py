import pytest

from review.providers import InvalidItemId, ItemDetails, ItemNotFound, ItemSummary, Provider
from review.providers.igdb import IGDBProvider
from review.providers.mal import MALProvider
from review.providers.omdb import OMDbProvider
from review.providers.openlibrary import OpenLibraryProvider

import time

_JUNK_DATA = 'alskdjflaskjdflkasjdflkasjdflkasglhasldgfkj'
_REVIEW_ITEM_COLUMNS = ["item_id", "category", "title", "image_url", "year", "attr1", "attr2", "attr3", "description", "rating"]


@pytest.mark.integration
class TestUtilAPI:
    """Integration tests that hit real external APIs (OMDb, IGDB, MyAnimeList, Open Library).

    Skipped in CI by default. Run with: pytest -m integration
    """

    def setup_method(self):
        self.omdb_api = OMDbProvider()
        self.igdb_api = IGDBProvider()
        self.mal_anime_api = MALProvider('anime')
        self.mal_manga_api = MALProvider('manga')
        self.open_library_api = OpenLibraryProvider()

    def test_search(self):
        self._test_search_api(self.omdb_api, 'Breaking Bad')
        self._test_search_api(self.igdb_api, 'Ori and the Blind Forest')
        self._test_search_api(self.mal_anime_api, 'Kimetsu no Yaiba')
        # Sleep to avoid rate limiting
        time.sleep(1)
        self._test_search_api(self.mal_manga_api, 'Berserk')
        self._test_search_api(self.open_library_api, 'The Hobbit')

    def _test_search_api(self, api_obj: Provider, success_query: str):
        results = api_obj.search(success_query)
        assert len(results) > 0, "Expected search results for {!r}".format(success_query)
        assert all(isinstance(result, ItemSummary) for result in results)
        assert set(results[0].to_search_result()) == {"title", "item_id", "image_url", "year"}
        with pytest.raises(ItemNotFound):
            api_obj.search(_JUNK_DATA)

    def test_igdb_search_leaves_out_expansions(self):
        # Catches a wrong game_type id in the search filter.
        titles = [result.title for result in self.igdb_api.search('The Witcher 3')]
        assert 'The Witcher 3: Wild Hunt' in titles, titles
        assert not any('Hearts of Stone' in title or 'Blood and Wine' in title for title in titles), titles

    def test_details(self):
        self._test_details_api(self.omdb_api, 'omdb_tt3896198')
        # No hard-coded IGDB id: take one from a search.
        self._test_details_api(self.igdb_api, self.igdb_api.search('Ori and the Blind Forest')[0].item_id)
        self._test_details_api(self.mal_anime_api, 'jikan_anime_38000')
        self._test_details_api(self.mal_manga_api, 'jikan_manga_2')
        self._test_details_api(self.open_library_api, 'olib_OL27482W')

    def _test_details_api(self, api_obj: Provider, success_id: str):
        details = api_obj.get_details(success_id)
        assert isinstance(details, ItemDetails)
        fields = details.to_review_item_fields()
        assert all(column in fields for column in _REVIEW_ITEM_COLUMNS), "Missing columns in {}".format(fields)
        with pytest.raises(InvalidItemId):
            api_obj.get_details(_JUNK_DATA)
