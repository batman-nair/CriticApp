import re
from urllib.parse import quote

from .base import InvalidItemId, ItemDetails, ItemNotFound, ItemSummary, Provider, fit_joined, unique


class OpenLibraryProvider(Provider):
    source_name = 'Open Library API'
    UNEXPECTED_RESPONSE_MESSAGE = 'Unexpected response from Open Library.'
    prefix = 'olib_'
    category = 'book'
    # Open Library allows a higher request rate to clients that identify themselves.
    USER_AGENT = 'CriticApp/1.0 (+https://github.com/batman-nair/CriticApp)'
    _SEARCH_FIELDS = 'key,title,author_name,first_publish_year,cover_i,ratings_average'
    _DETAIL_FIELDS = _SEARCH_FIELDS + ',number_of_pages_median'
    _WORK_ID_RE = re.compile(r'OL\d+W')
    _COVER_URL = 'https://covers.openlibrary.org/b/id/{cover_id}-{size}.jpg'
    # Without a cover this URL 404s instead of returning a blank image, so the
    # page shows its placeholder.
    _MISSING_COVER_URL = 'https://covers.openlibrary.org/w/olid/{work_id}-L.jpg?default=false'
    # Catalogue tags that Open Library mixes into a work's subjects.
    _IGNORED_SUBJECTS = {'open library staff picks', 'accessible book', 'protected daisy', 'in library', 'lending library'}
    _MAX_GENRES = 5
    # Column sizes of ReviewItem.
    _MAX_TITLE_LENGTH = 100
    _MAX_ATTR_LENGTH = 300

    def __init__(self):
        self._headers = {'User-Agent': self.USER_AGENT}
        self._base_url = 'https://openlibrary.org'

    def search(self, query: str) -> list[ItemSummary]:
        search_url = '{base_url}/search.json?q={search_term}&limit=10&fields={fields}'.format(
            base_url=self._base_url, search_term=quote(query), fields=self._SEARCH_FIELDS)
        ol_json = self._request_json(search_url, headers=self._headers)
        with self._parsing():
            results = [self._summary(doc) for doc in self._docs(ol_json) if self._work_id(doc)]
        if len(results) == 0:
            raise ItemNotFound("Book not found!")
        return results[:10]

    def get_details(self, item_id: str) -> ItemDetails:
        work_id = self._strip_prefix(item_id)
        # The id goes into a search query, so only accept real work ids.
        if not self._WORK_ID_RE.fullmatch(work_id):
            raise InvalidItemId("Invalid book id.")
        search_url = '{base_url}/search.json?q=key:/works/{work_id}&fields={fields}'.format(
            base_url=self._base_url, work_id=work_id, fields=self._DETAIL_FIELDS)
        search_json = self._request_json(search_url, headers=self._headers)
        with self._parsing():
            docs = self._docs(search_json)
        if len(docs) == 0:
            raise ItemNotFound("Book not found!")
        # The search index has author names, ratings and page counts; only the
        # work itself has the description and the full subject list.
        work_url = '{base_url}/works/{work_id}.json'.format(base_url=self._base_url, work_id=work_id)
        work_json = self._request_json(work_url, headers=self._headers)
        with self._parsing():
            return self._details(work_id, docs[0], work_json)

    def _details(self, work_id: str, doc: dict, work_json: dict) -> ItemDetails:
        summary = self._summary(doc, detailed=True)
        summary.item_id = self.prefix + work_id
        if not doc.get("cover_i"):
            summary.image_url = self._MISSING_COVER_URL.format(work_id=work_id)
        # Keyed by lower case to drop repeats like "Fiction"/"fiction". Subjects
        # with commas would read as several genres in the comma-separated list.
        genres = {}
        for subject in (self._text(entry) for entry in self._optional(work_json.get("subjects"), list) or []):
            if subject and ':' not in subject and ',' not in subject and subject.lower() not in self._IGNORED_SUBJECTS:
                genres.setdefault(subject.lower(), subject)
        authors = unique(self._text(entry) for entry in self._optional(doc.get("author_name"), list) or [])
        return ItemDetails.from_summary(
            summary,
            genres=fit_joined(list(genres.values())[:self._MAX_GENRES], self._MAX_ATTR_LENGTH),
            creators=fit_joined(authors, self._MAX_ATTR_LENGTH),
            description=self._text(work_json.get("description")) or None,
            pages=self._optional(doc.get("number_of_pages_median"), int) or None,
        )

    def _docs(self, search_json: dict) -> list:
        return self._optional(search_json.get("docs"), list) or []

    def _work_id(self, doc: dict) -> str:
        work_id = (self._optional(doc.get("key"), str) or "").rsplit('/', 1)[-1]
        return work_id if self._WORK_ID_RE.fullmatch(work_id) else ""

    @staticmethod
    def _text(value) -> str:
        # Text is either a plain string or {"type": "/type/text", "value": "..."}.
        if isinstance(value, dict):
            value = value.get("value")
        return value.strip() if isinstance(value, str) else ""

    @staticmethod
    def _truncate(value: str, max_length: int) -> str:
        return value[:max_length] if value else "N/A"

    def _summary(self, doc: dict, detailed: bool=False) -> ItemSummary:
        cover_id = self._optional(doc.get("cover_i"), int)
        year = self._optional(doc.get("first_publish_year"), int)
        rating = self._optional_rating(doc.get("ratings_average"))
        return ItemSummary(
            item_id=self.prefix + self._work_id(doc),
            category=self.category,
            title=self._truncate(self._text(doc.get("title")), self._MAX_TITLE_LENGTH),
            image_url=self._COVER_URL.format(cover_id=cover_id, size='L' if detailed else 'M') if cover_id else None,
            year=str(year) if year else None,
            # Genres need the work itself, a second request, so search leaves them unknown.
            provider_rating=round(rating * 2, 1) if rating else None,
        )
