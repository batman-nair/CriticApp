import math
import os
import re
from datetime import datetime, timezone

from django.core.cache import cache

from .base import InvalidItemId, ItemDetails, ItemNotFound, ItemSummary, Provider, UpstreamError, fit_joined, unique


class IGDBProvider(Provider):
    """Games from IGDB, through a Twitch client-credentials token.

    Nothing here logs, and no exception message carries the client secret or
    the token.
    """
    source_name = 'IGDB API'
    prefix = 'igdb_'
    category = 'game'
    TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
    GAMES_URL = 'https://api.igdb.com/v4/games'
    TOKEN_CACHE_KEY = 'igdb:access_token'
    UNEXPECTED_RESPONSE_MESSAGE = 'Unexpected response from IGDB.'
    # Main games, standalone expansions, remakes, remasters and expanded games,
    # without editions. DLC, expansions, bundles, mods, ports etc. are left out.
    SEARCH_FILTER = 'where version_parent = null & game_type = (0,4,8,9,10);'
    _SEARCH_FIELDS = 'name,first_release_date,cover.image_id,genres.name,total_rating,platforms.name'
    _DETAIL_FIELDS = _SEARCH_FIELDS + ',summary,involved_companies.company.name,involved_companies.developer'
    _COVER_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg'
    # No leading zeros: the stored item id is rebuilt from IGDB's number.
    _GAME_ID_RE = re.compile(r'[1-9][0-9]*')
    # Column sizes of ReviewItem.
    _MAX_TITLE_LENGTH = 100
    _MAX_ATTR_LENGTH = 300

    def __init__(self):
        self._client_id = os.environ.get('IGDB_CLIENT_ID', None)
        self._client_secret = os.environ.get('IGDB_CLIENT_SECRET', None)
        if not self._client_id or not self._client_secret:
            raise RuntimeError('IGDB_CLIENT_ID and IGDB_CLIENT_SECRET required for accessing IGDB data.')

    def search(self, query: str, all_types: bool=False) -> list[ItemSummary]:
        """Search games. `all_types` drops the game type and edition filter."""
        escaped = query.replace('\\', '\\\\').replace('"', '\\"')
        body = 'search "{query}"; fields {fields}; {where}limit 10;'.format(
            query=escaped, fields=self._SEARCH_FIELDS, where='' if all_types else self.SEARCH_FILTER + ' ')
        games = self._query(body)
        with self._parsing():
            results = [self._summary(game) for game in self._game_list(games)]
        if len(results) == 0:
            raise ItemNotFound("Game not found!")
        return results

    def get_details(self, item_id: str) -> ItemDetails:
        game_id = self._strip_prefix(item_id)
        # The id goes into the query, so only accept numbers.
        if not self._GAME_ID_RE.fullmatch(game_id):
            raise InvalidItemId("Invalid game id.")
        # No type filter, so any game IGDB has (a DLC too) can be stored.
        body = 'fields {fields}; where id = {game_id};'.format(fields=self._DETAIL_FIELDS, game_id=game_id)
        games = self._query(body)
        with self._parsing():
            games = self._game_list(games)
            if len(games) == 0:
                raise ItemNotFound("Game not found!")
            return self._details(games[0])

    def _access_token(self) -> str:
        token = cache.get(self.TOKEN_CACHE_KEY)
        if token:
            return token
        # The secret goes in the form body: a URL ends up in exception messages.
        token_json = self._request_json(self.TOKEN_URL, method='POST', data={
            'client_id': self._client_id,
            'client_secret': self._client_secret,
            'grant_type': 'client_credentials',
        })
        with self._parsing():
            token = token_json.get("access_token")
            expires_in = token_json.get("expires_in")
            if not isinstance(token, str) or not token:
                raise ValueError('No access token.')
            if not self._is_number(expires_in, int):
                raise ValueError('No token expiry.')
        # Expire it an hour early, so a cached token is never stale.
        cache.set(self.TOKEN_CACHE_KEY, token, timeout=max(expires_in - 3600, 60))
        return token

    def _query(self, body: str):
        token = cache.get(self.TOKEN_CACHE_KEY)
        if not token:
            # A token fetched just now that IGDB refuses won't do better on a second try.
            return self._post_query(body, self._access_token())
        try:
            return self._post_query(body, token)
        except UpstreamError as ex:
            if ex.status_code != 401:
                raise
        # The cached token was revoked or expired early: get a new one and try once more.
        cache.delete(self.TOKEN_CACHE_KEY)
        return self._post_query(body, self._access_token())

    def _post_query(self, body: str, token: str):
        headers = {'Client-ID': self._client_id, 'Authorization': 'Bearer {}'.format(token)}
        return self._request_json(self.GAMES_URL, headers=headers, method='POST', data=body)

    @staticmethod
    def _game_list(games) -> list:
        if not isinstance(games, list):
            raise TypeError('Expected a list of games.')
        return games

    def _summary(self, game: dict) -> ItemSummary:
        game_id = game["id"]
        name = game["name"]
        if not self._is_number(game_id, int):
            raise TypeError('Unexpected game id.')
        if not isinstance(name, str) or not name:
            raise ValueError('Missing game name.')
        release_date = game.get("first_release_date")
        year = None
        if release_date is not None:
            if not self._is_number(release_date):
                raise TypeError('Unexpected release date.')
            year = str(datetime.fromtimestamp(release_date, tz=timezone.utc).year)
        image_id = self._optional((self._optional(game.get("cover"), dict) or {}).get("image_id"), str)
        rating = game.get("total_rating")
        if rating is not None and (not self._is_number(rating) or not math.isfinite(rating)):
            raise ValueError('Unexpected rating.')
        return ItemSummary(
            item_id=self.prefix + str(game_id),
            category=self.category,
            title=name[:self._MAX_TITLE_LENGTH],
            image_url=self._COVER_URL.format(image_id=image_id) if image_id else None,
            year=year,
            genres=fit_joined(self._names(game.get("genres")), self._MAX_ATTR_LENGTH),
            provider_rating=round(rating / 10, 1) if rating is not None else None,
        )

    def _details(self, game: dict) -> ItemDetails:
        developers = []
        for entry in self._optional(game.get("involved_companies"), list) or []:
            company = self._optional(entry.get("company"), dict)
            if company and entry.get("developer") is True:
                developers.append(self._optional(company.get("name"), str))
        return ItemDetails.from_summary(
            self._summary(game),
            creators=fit_joined(unique(developers), self._MAX_ATTR_LENGTH),
            platforms=fit_joined(self._names(game.get("platforms")), self._MAX_ATTR_LENGTH),
            description=self._optional(game.get("summary"), str) or None,
            languages=[],
        )
