import os
import re
from typing import Optional
from urllib.parse import quote

from .base import (
    BAD_RESPONSE_MESSAGE, ItemDetails, ItemNotFound, ItemSummary, Provider, UpstreamError, WrongCategory, unique,
)

IMDB_TITLE_URL_RE = re.compile(
    r'^https?://(?:www\.|m\.)?imdb\.com/title/(?P<imdb_id>tt\d+)(?:/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$',
    re.IGNORECASE,
)


def normalize_imdb_title_url_to_item_id(value: str) -> Optional[str]:
    match = IMDB_TITLE_URL_RE.fullmatch(value.strip())
    if not match:
        return None
    return f"omdb_{match.group('imdb_id').lower()}"


def _value(text: Optional[str]) -> Optional[str]:
    # OMDb fills unknown fields with "N/A".
    return None if not text or text == "N/A" else text


def _split(text: Optional[str]) -> list[str]:
    parts = (part.strip() for part in (_value(text) or '').split(','))
    return [part for part in parts if part and part != "N/A"]


class OMDbProvider(Provider):
    source_name = 'OMDB API'
    # Movies and series share the prefix, so ids from before the split stay valid.
    prefix = 'omdb_'

    def __init__(self, category: Optional[str]='movie'):
        """category is 'movie' or 'series'. None is for looking up an item by id
        alone: the category then comes from the item's type, and search isn't
        available."""
        if category not in ['movie', 'series', None]:
            raise RuntimeError('OMDB API should be of type "movie" or "series".')
        self.category = category
        self._api_key = os.environ.get('OMDB_API_KEY', None)
        if not self._api_key:
            raise RuntimeError('OMDB_API_KEY required for accessing OMDB data.')
        self._base_url = 'https://www.omdbapi.com/?apikey={}'.format(self._api_key)

    def search(self, query: str) -> list[ItemSummary]:
        if self.category is None:
            raise RuntimeError('OMDb search needs a category.')
        search_url = '{base_url}&type={type}&s={movie_name}'.format(
            base_url=self._base_url, type=self.category, movie_name=quote(query))
        omdb_json = self._request_json(search_url)
        self._raise_for_error(omdb_json)
        return [self._summary(item, self.category) for item in omdb_json.get("Search", [])[:10]]

    def get_details(self, item_id: str) -> ItemDetails:
        imdb_id = self._strip_prefix(item_id)
        info_url = '{base_url}&i={imdb_id}'.format(base_url=self._base_url, imdb_id=imdb_id)
        omdb_json = self._request_json(info_url)
        self._raise_for_error(omdb_json)
        is_series = omdb_json.get("Type") == "series"
        if self.category is None:
            category = 'series' if is_series else 'movie'
        elif is_series != (self.category == 'series'):
            if self.category == 'series':
                raise WrongCategory("This title is not a series. Pick the Movie category.")
            raise WrongCategory("This title is a series. Pick the Series category.")
        else:
            category = self.category
        summary = self._summary(omdb_json, category)
        creators = []
        for role in ["Director", "Writer", "Actors"]:
            creators += _split(omdb_json[role])
        return ItemDetails(
            **vars(summary),
            genres=_split(omdb_json["Genre"]),
            creators=unique(creators),
            languages=_split(omdb_json.get("Language")),
            description=_value(omdb_json["Plot"]),
            provider_rating=self._rating(omdb_json.get("imdbRating")),
            media_type=omdb_json["Type"],
        )

    def _raise_for_error(self, omdb_json: dict):
        if omdb_json.get("Response") != "False":
            return
        error = omdb_json.get("Error") or BAD_RESPONSE_MESSAGE
        # OMDb's own messages: "Movie not found!", "Series not found!",
        # "Incorrect IMDb ID.", "Request limit reached!", "Too many results.", ...
        if error.endswith("not found!") or error == "Incorrect IMDb ID.":
            raise ItemNotFound(error)
        raise UpstreamError(error, source=self.source_name)

    def _summary(self, omdb_json: dict, category: str) -> ItemSummary:
        return ItemSummary(
            item_id=self.prefix + omdb_json["imdbID"],
            category=category,
            title=omdb_json["Title"],
            image_url=_value(omdb_json["Poster"]),
            year=_value(omdb_json["Year"]),
        )

    @staticmethod
    def _rating(text: Optional[str]) -> Optional[float]:
        try:
            return float(text)
        except (TypeError, ValueError):
            return None

