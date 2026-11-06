import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

import requests
from dotenv import load_dotenv, find_dotenv

from review.utils import api_usage, metrics

load_dotenv(find_dotenv())
REQUEST_TIMEOUT_SECONDS = 10
DEFAULT_MAX_RETRIES = 3
RETRY_STATUS_CODES = (429, 500, 502, 503, 504)
DEFAULT_REQUEST_HEADERS = {
    "User-Agent": "CriticApp/1.0",
    "Accept": "application/json",
}
MISSING_PREFIX_MESSAGE = "Missing prefix in item id."
BAD_RESPONSE_MESSAGE = "Bad response from API."


class ProviderError(Exception):
    """Base class for every failure of an external item provider.

    `message` is user-facing, like the old "error" strings.
    """

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidItemId(ProviderError):
    """The item id is missing its prefix or isn't a valid id for the provider."""


class ItemNotFound(ProviderError):
    """The provider found nothing for the search or the item id."""


class WrongCategory(ProviderError):
    """The item exists but belongs to another category (OMDb movie vs series)."""


class UpstreamError(ProviderError):
    """Network failure, HTTP error, invalid JSON or an error payload from the provider."""

    def __init__(self, message: str, source: Optional[str]=None, status_code: Optional[int]=None,
                 upstream_reason: Optional[str]=None, exception_type: Optional[str]=None):
        super().__init__(message)
        self.source = source
        self.status_code = status_code
        self.upstream_reason = upstream_reason
        self.exception_type = exception_type


def request_json_with_retry(url: str, source_name: str='Upstream API', retries: int=DEFAULT_MAX_RETRIES, headers: Optional[dict]=None,
                            method: str='GET', data=None) -> dict:
    """Return the JSON body of a GET or POST request, retrying transient failures.

    `data` is the POST body: a str is sent as is, a dict form-encoded.
    Raises UpstreamError when the request fails for good.
    """
    request_headers = {**DEFAULT_REQUEST_HEADERS, **(headers or {})}
    for attempt in range(retries):
        api_usage.record_upstream_request(source_name)
        try:
            if method == 'POST':
                response_obj = requests.post(
                    url,
                    data=data,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                    headers=request_headers,
                )
            else:
                response_obj = requests.get(
                    url,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                    headers=request_headers,
                )
        except requests.RequestException as ex:
            if attempt < retries - 1:
                time.sleep(attempt + 1)
                continue
            metrics.record_upstream_api_call(source_name, 'exception')
            raise UpstreamError(
                "Request failure to upstream API.",
                source=source_name,
                exception_type=ex.__class__.__name__,
            ) from ex

        if response_obj.status_code == 200:
            try:
                data = response_obj.json()
            except ValueError as ex:
                metrics.record_upstream_api_call(source_name, 'invalid_json')
                raise UpstreamError("Invalid JSON from upstream API.", source=source_name) from ex
            metrics.record_upstream_api_call(source_name, 'success')
            return data

        if response_obj.status_code in RETRY_STATUS_CODES and attempt < retries - 1:
            retry_after = response_obj.headers.get('Retry-After')
            try:
                sleep_time = int(retry_after) if retry_after else (attempt + 1) * 2
            except ValueError:
                sleep_time = (attempt + 1) * 2
            time.sleep(max(sleep_time, 1))
            continue

        metrics.record_upstream_api_call(source_name, 'http_error')
        raise UpstreamError(
            BAD_RESPONSE_MESSAGE,
            source=source_name,
            status_code=response_obj.status_code,
            upstream_reason=response_obj.reason,
        )

    metrics.record_upstream_api_call(source_name, 'exhausted_retries')
    raise UpstreamError("Exhausted retries calling upstream API.", source=source_name)


def unique(values) -> list:
    """Drop repeats and empty values, keeping the first occurrence's position."""
    return list(dict.fromkeys(value for value in values if value))


def fit_joined(values: list, max_length: int) -> list:
    # Keep whole entries while their comma-separated join fits the column,
    # so no name is cut in half. A first entry that alone is too long is cut.
    fitted = []
    length = 0
    for value in values:
        length += len(value) + (2 if fitted else 0)
        if length > max_length:
            return fitted or [value[:max_length]]
        fitted.append(value)
    return fitted


# What each ReviewItem column has always held when the provider gave nothing,
# per category. The language column is only written for the categories listed
# under 'language'; the others never had a language from their provider.
_EMPTY_VALUES = {
    'movie': {'attr1': 'N/A', 'attr2': '', 'attr3': 'N/A', 'description': 'N/A', 'language': ''},
    'series': {'attr1': 'N/A', 'attr2': '', 'attr3': 'N/A', 'description': 'N/A', 'language': ''},
    'game': {'attr1': '', 'attr2': '', 'attr3': '', 'description': ''},
    'anime': {'attr1': '', 'attr2': '', 'attr3': 'N/A', 'description': ''},
    'manga': {'attr1': '', 'attr2': '', 'attr3': 'N/A', 'description': ''},
    'book': {'attr1': 'N/A', 'attr2': 'N/A', 'attr3': 'N/A', 'description': 'N/A', 'language': ''},
}


@dataclass(kw_only=True)
class ItemSummary:
    """One search result."""
    item_id: str
    category: str
    title: str
    image_url: Optional[str] = None
    # Display text as stored, e.g. "2019", "2008–2013" or "2019-2020".
    year: Optional[str] = None
    # None when the provider's search doesn't give them; [] when it gave no genres.
    genres: Optional[list[str]] = None
    # 0-10 scale.
    provider_rating: Optional[float] = None

    def to_search_result(self) -> dict:
        """The v2 search result dict."""
        return {
            'item_id': self.item_id,
            'title': self.title,
            'image_url': self.image_url or 'N/A',
            'year': self.year or 'N/A',
        }


@dataclass(kw_only=True)
class ItemDetails(ItemSummary):
    """The full item, as fetched for storing."""
    genres: list[str] = field(default_factory=list)
    # Crew, authors or studios.
    creators: list[str] = field(default_factory=list)
    languages: list[str] = field(default_factory=list)
    description: Optional[str] = None
    # 0-10 scale. Kept as the provider's number, so str() gives the stored text.
    provider_rating: Optional[float] = None
    media_type: Optional[str] = None
    platforms: list[str] = field(default_factory=list)
    pages: Optional[int] = None

    @classmethod
    def from_summary(cls, summary: ItemSummary, **fields) -> 'ItemDetails':
        """The details built on a search summary; `fields` override its values.

        Summary values that are None fall back to the details defaults, so
        unknown genres become [].
        """
        values = {key: value for key, value in vars(summary).items() if value is not None}
        values.update(fields)
        return cls(**values)

    def to_review_item_fields(self) -> dict:
        """The ReviewItem column values, exactly as the old dict-based wrappers stored them."""
        empty = _EMPTY_VALUES[self.category]
        if self.category == 'game':
            attr3 = ', '.join(self.platforms)
        elif self.category == 'book':
            attr3 = '{} pages'.format(self.pages) if self.pages else ''
        else:
            attr3 = self.media_type or ''
        fields = {
            'item_id': self.item_id,
            'category': self.category,
            'title': self.title,
            'image_url': self.image_url or 'N/A',
            'year': self.year or 'N/A',
            'attr1': ', '.join(self.genres) or empty['attr1'],
            'attr2': ', '.join(self.creators) or empty['attr2'],
            'attr3': attr3 or empty['attr3'],
            'description': self.description or empty['description'],
            'rating': 'N/A' if self.provider_rating is None else str(self.provider_rating),
        }
        if 'language' in empty:
            fields['language'] = ', '.join(self.languages) or empty['language']
        return fields


class Provider(ABC):
    prefix: str
    category: Optional[str]
    source_name: str

    @abstractmethod
    def search(self, query: str) -> list[ItemSummary]:
        """Return up to 10 results. Raises ItemNotFound when nothing is found."""
        raise NotImplementedError('Should be implemented by subclass')

    @abstractmethod
    def get_details(self, item_id: str) -> ItemDetails:
        raise NotImplementedError('Should be implemented by subclass')

    def _strip_prefix(self, item_id: str) -> str:
        if not item_id.startswith(self.prefix):
            raise InvalidItemId(MISSING_PREFIX_MESSAGE)
        return item_id[len(self.prefix):]

    def _request_json(self, url: str, headers: Optional[dict]=None, method: str='GET', data=None) -> dict:
        return request_json_with_retry(url, source_name=self.source_name, headers=headers, method=method, data=data)
