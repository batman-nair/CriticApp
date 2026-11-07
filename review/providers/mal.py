import os
from urllib.parse import quote

from .base import ItemDetails, ItemNotFound, ItemSummary, Provider, UpstreamError, unique


class MALProvider(Provider):
    source_name = 'MAL API'
    UNEXPECTED_RESPONSE_MESSAGE = 'Unexpected response from MAL.'
    _COMMON_FIELDS = 'id,title,main_picture,start_date,end_date,mean'
    # Genres come with search results at no extra cost; details ask for them below.
    _SEARCH_FIELDS = _COMMON_FIELDS + ',genres'
    _DETAIL_FIELDS = {
        'anime': 'genres,studios,media_type,synopsis',
        'manga': 'genres,authors{first_name,last_name},media_type,synopsis',
    }

    def __init__(self, category: str):
        if category not in ['anime', 'manga']:
            raise RuntimeError('MAL API should be of type "anime" or "manga".')
        self.category = category
        self.prefix = 'mal_{}_'.format(category)
        self._client_id = os.environ.get('MAL_CLIENT_ID', None)
        if not self._client_id:
            raise RuntimeError('MAL_CLIENT_ID required for accessing MAL data.')
        self._headers = {'X-MAL-CLIENT-ID': self._client_id}
        self._base_url = 'https://api.myanimelist.net/v2/{type}'.format(type=category)

    def search(self, query: str) -> list[ItemSummary]:
        search_url = '{base_url}?q={search_term}&limit=20&fields={fields}'.format(
            base_url=self._base_url, search_term=quote(query), fields=self._SEARCH_FIELDS)
        mal_json = self._request_json(search_url, headers=self._headers)
        results = []
        with self._parsing():
            for entry in self._optional(mal_json.get("data"), list) or []:
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
        with self._parsing():
            return self._details(mal_json)

    def _details(self, mal_json: dict) -> ItemDetails:
        if self.category == 'manga':
            creators = []
            for entry in self._optional(mal_json.get("authors"), list) or []:
                node = entry["node"]
                names = [self._optional(node.get(key), str) for key in ("first_name", "last_name")]
                # An author without a name is dropped by unique() below.
                creators.append(' '.join(name for name in names if name))
        else:
            creators = self._names(mal_json.get("studios"))
        return ItemDetails.from_summary(
            self._summary(mal_json),
            genres=self._names(mal_json.get("genres")),
            creators=unique(creators),
            media_type=self._optional(mal_json.get("media_type"), str),
            description=self._optional(mal_json.get("synopsis"), str) or None,
            provider_rating=self._optional(mal_json.get("mean"), (int, float)),
        )

    def _summary(self, mal_json: dict) -> ItemSummary:
        mal_id = mal_json["id"]
        title = mal_json["title"]
        if not self._is_number(mal_id, int):
            raise TypeError('Unexpected MAL id.')
        if not isinstance(title, str) or not title:
            raise ValueError('Missing title.')
        picture = self._optional(mal_json.get("main_picture"), dict) or {}
        start_date = self._optional(mal_json.get("start_date"), str)
        end_date = self._optional(mal_json.get("end_date"), str)
        year = None
        if start_date:
            year = start_date[:4]
            if end_date:
                year += '-{}'.format(end_date[:4])
        return ItemSummary(
            item_id=self.prefix + str(mal_id),
            category=self.category,
            title=title,
            image_url=self._optional(picture.get("large"), str) or self._optional(picture.get("medium"), str) or None,
            year=year,
            # MAL leaves out empty fields: no genres key means no genres.
            genres=self._names(mal_json.get("genres")),
            provider_rating=self._optional(mal_json.get("mean"), (int, float)),
        )
