import os
from urllib.parse import quote

from .base import ItemDetails, ItemNotFound, ItemSummary, Provider, UpstreamError, unique


class MALProvider(Provider):
    source_name = 'MAL API'
    _COMMON_FIELDS = 'id,title,main_picture,start_date,end_date,mean'
    _DETAIL_FIELDS = {
        'anime': 'genres,studios,media_type,synopsis',
        'manga': 'genres,authors{first_name,last_name},media_type,synopsis',
    }

    def __init__(self, category: str):
        if category not in ['anime', 'manga']:
            raise RuntimeError('MAL API should be of type "anime" or "manga".')
        self.category = category
        # Items were first fetched from Jikan, which uses the same MAL ids, so the
        # old prefix is kept to keep existing item ids valid.
        self.prefix = 'jikan_{}_'.format(category)
        self._client_id = os.environ.get('MAL_CLIENT_ID', None)
        if not self._client_id:
            raise RuntimeError('MAL_CLIENT_ID required for accessing MAL data.')
        self._headers = {'X-MAL-CLIENT-ID': self._client_id}
        self._base_url = 'https://api.myanimelist.net/v2/{type}'.format(type=category)

    def search(self, query: str) -> list[ItemSummary]:
        search_url = '{base_url}?q={search_term}&limit=20&fields={fields}'.format(
            base_url=self._base_url, search_term=quote(query), fields=self._COMMON_FIELDS)
        mal_json = self._request_json(search_url, headers=self._headers)
        results = []
        for entry in mal_json.get("data", []):
            item = entry["node"]
            if not item.get("mean"):
                continue
            results.append(self._summary(item))
            if len(results) >= 10:
                break
        if len(results) == 0:
            raise ItemNotFound("{} not found!".format(self.category.capitalize()))
        return results

    def get_details(self, item_id: str) -> ItemDetails:
        mal_id = self._strip_prefix(item_id)
        info_url = '{base_url}/{item_id}?fields={fields}'.format(
            base_url=self._base_url, item_id=mal_id,
            fields='{},{}'.format(self._COMMON_FIELDS, self._DETAIL_FIELDS[self.category]))
        try:
            mal_json = self._request_json(info_url, headers=self._headers)
        except UpstreamError as ex:
            # MAL answers an unknown id with 404. The message stays as before.
            if ex.status_code == 404:
                raise ItemNotFound(ex.message) from ex
            raise
        if self.category == 'manga':
            creators = []
            for entry in mal_json.get("authors", []):
                node = entry["node"]
                creators.append(' '.join(part for part in [node.get("first_name"), node.get("last_name")] if part))
        else:
            creators = [entry["name"] for entry in mal_json.get("studios", [])]
        return ItemDetails.from_summary(
            self._summary(mal_json),
            genres=unique(entry["name"] for entry in mal_json.get("genres", [])),
            creators=unique(creators),
            media_type=mal_json.get("media_type"),
            description=mal_json.get("synopsis") or None,
            provider_rating=mal_json.get("mean"),
        )

    def _summary(self, mal_json: dict) -> ItemSummary:
        picture = mal_json.get("main_picture") or {}
        start_date = mal_json.get("start_date")
        end_date = mal_json.get("end_date")
        year = None
        if start_date:
            year = start_date[:4]
            if end_date:
                year += '-{}'.format(end_date[:4])
        return ItemSummary(
            item_id=self.prefix + str(mal_json["id"]),
            category=self.category,
            title=mal_json["title"],
            image_url=picture.get("large") or picture.get("medium") or None,
            year=year,
        )
