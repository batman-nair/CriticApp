import os
from datetime import datetime
from urllib.parse import quote

from .base import ItemDetails, ItemNotFound, ItemSummary, Provider, UpstreamError, unique


class RAWGProvider(Provider):
    source_name = 'RAWG API'
    prefix = 'rawg_'
    category = 'game'

    def __init__(self):
        self._api_key = os.environ.get('RAWG_API_KEY', None)
        if not self._api_key:
            raise RuntimeError('RAWG_API_KEY required for accessing RAWG data.')
        self._base_url = 'https://api.rawg.io/api'

    def search(self, query: str) -> list[ItemSummary]:
        search_url = '{base_url}/games?key={api_key}&search={game_name}'.format(
            base_url=self._base_url, api_key=self._api_key, game_name=quote(query))
        rawg_json = self._request_json(search_url)
        results = rawg_json.get("results") or []
        if len(results) == 0:
            raise ItemNotFound("Game not found!")
        return [self._summary(item) for item in results[:10]]

    def get_details(self, item_id: str) -> ItemDetails:
        game_id = self._strip_prefix(item_id)
        info_url = '{base_url}/games/{game_id}?key={api_key}'.format(
            base_url=self._base_url, api_key=self._api_key, game_id=game_id)
        try:
            rawg_json = self._request_json(info_url)
        except UpstreamError as ex:
            # RAWG answers an unknown id with 404. The message stays as before.
            if ex.status_code == 404:
                raise ItemNotFound(ex.message) from ex
            raise
        return ItemDetails.from_summary(
            self._summary(rawg_json),
            genres=unique(entry["name"] for entry in rawg_json.get("genres") or []),
            creators=unique(entry["name"] for entry in (rawg_json.get("developers") or []) + (rawg_json.get("publishers") or [])),
            platforms=unique(entry["platform"]["name"] for entry in rawg_json.get("platforms") or []),
            description=rawg_json.get("description") or None,
            provider_rating=rawg_json["rating"] * 2,
        )

    def _summary(self, rawg_json: dict) -> ItemSummary:
        image_url = rawg_json["background_image"]
        if not image_url or image_url == "null":
            image_url = None
        year = rawg_json["released"] or None
        if year and '-' in year:
            year = str(datetime.strptime(year, '%Y-%m-%d').year)
        return ItemSummary(
            item_id=self.prefix + str(rawg_json["id"]),
            category=self.category,
            title=rawg_json["name"],
            image_url=image_url,
            year=year,
        )
