# API v3

API v3 is the API the new frontend is built against. It lives under `/api/v3/`.
v2 (`docs/API_ENDPOINTS.md`) is frozen for the current Django pages and will be
removed after the cutover.

The shared base is in `critic/api/`, and the review-domain endpoints are in
`review/api_v3/`. New v3 views subclass `V3APIView` or `V3GenericAPIView`
(`critic/api/views.py`) and follow the conventions below.

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v3/categories` | public | Categories, with filter subcategories, data source and rating label |
| GET | `/api/v3/tags` | public; defaults to the logged-in user | A user's most-used tags |
| GET | `/api/v3/search` | logged in; throttle `search` | Search a category's data source |
| GET | `/api/v3/items/{item_id}` | logged in | An item, stored or fetched from its data source |
| GET | `/api/v3/reviews` | public | Reviews, filtered, sorted and paginated |
| POST | `/api/v3/reviews` | logged in | Review an item |
| GET | `/api/v3/reviews/{id}` | public | One review |
| PATCH | `/api/v3/reviews/{id}` | owner | Change a review's rating, text or tags |
| DELETE | `/api/v3/reviews/{id}` | owner | Delete a review |
| GET | `/api/v3/schema` | public | OpenAPI schema for v3 (YAML; `?format=json` for JSON) |
| GET | `/api/v3/docs` | public | Swagger UI for v3 |

### `GET /api/v3/categories`

```json
{
  "data": [
    {"id": "movie", "label": "Movies", "subcategories": [], "source": "OMDb", "rating_label": "IMDb"},
    {
      "id": "anime",
      "label": "Anime",
      "subcategories": [
        {"id": "anime:series", "label": "Anime series"},
        {"id": "anime:movie", "label": "Anime movies"}
      ],
      "source": "MyAnimeList",
      "rating_label": "MyAnimeList"
    }
  ],
  "meta": {}
}
```

The categories are, in order: `movie`, `series`, `game`, `anime`, `manga`, `book`.

### `GET /api/v3/tags`

A user's most-used tags, for tag suggestions. `GET /api/v3/tags?username=alice&limit=2`:

```json
{
  "data": [
    {"name": "favourite", "count": 14},
    {"name": "rewatch", "count": 6}
  ],
  "meta": {}
}
```

- `username`: whose tags to count. If it's omitted or blank, it defaults to the
  logged-in user. If there's neither, the response is 400 `VALIDATION_ERROR`
  with an error for the `username` field. An unknown username gets `data: []`.
- `limit`: default 10. Values above 50 are cut down to 50, and invalid values
  fall back to 10, like pagination limits.
- Sorted by count (most used first), then by name, ignoring case. Tags are
  grouped case-insensitively and returned in their most frequent spelling.
  Empty entries and surrounding whitespace are ignored.
- The view keeps the default authentication classes, because the result can
  depend on who is logged in. Unlike `/categories`, an invalid or expired
  `Authorization` token gets 401 `UNAUTHENTICATED`.

### Items

An item is a title (a movie, game, book, ...). `/items` returns this shape;
search results are a shorter form of it (see `/search`):

```json
{
  "id": "mal_anime_52991",
  "category": "anime",
  "title": "Sousou no Frieren",
  "image_url": "https://...",
  "start_year": 2023,
  "end_year": 2024,
  "genres": ["Adventure", "Drama", "Fantasy"],
  "creators": ["Madhouse"],
  "languages": [],
  "description": "...",
  "provider_rating": 9.3,
  "details": {"media_type": "tv"}
}
```

- The id's prefix names the data source: `omdb_` (movies and series),
  `igdb_` (games), `mal_anime_` / `mal_manga_`, and `olib_` (books). Stored
  `rawg_` games from before IGDB are still served, but can't be fetched.
- `details` holds the category's own fields. In the schema, `Item` is a
  union discriminated by `category`:

  | Category | `details` |
  |---|---|
  | movie, series | `{"media_type": "movie"}` (OMDb type) |
  | anime, manga | `{"media_type": "tv"}` (MyAnimeList media type) |
  | game | `{"platforms": ["PC (Microsoft Windows)", "PlayStation 5"]}` |
  | book | `{"pages": 412}` |

- `start_year` / `end_year` come from the stored year text. `end_year` is
  `null` both for a single year and for a title that's still running.
- `provider_rating` is the data source's rating on a 0-10 scale.
- Items are stored in the old `ReviewItem` columns (`attr1` = genres,
  `attr2` = creators, `attr3` = details, comma-separated text); the
  serializer in `review/api_v3/items.py` maps them.

### `GET /api/v3/search`

`GET /api/v3/search?category=movie&q=detective pikachu`:

```json
{
  "data": [
    {
      "id": "omdb_tt5884052", "category": "movie", "title": "Pokémon Detective Pikachu",
      "image_url": "https://...", "start_year": 2019, "end_year": null,
      "genres": null, "provider_rating": null,
      "my_review": {"id": 42, "rating": 7.5}
    }
  ],
  "meta": {}
}
```

- `category` (one of the categories above) and `q` (at most 100 characters)
  are required; otherwise 400 `VALIDATION_ERROR`.
- For `movie` and `series`, `q` may be a full IMDb title URL; the result is
  that one title, with `genres` and `provider_rating` filled (OMDb's lookup
  by id gives them in the same request). The URL of a series in a movie
  search (or the other way round) is 400 `VALIDATION_ERROR` on `q`.
- `genres` and `provider_rating` are filled only when the data source's
  search gives them, with no extra requests. `null` means unknown, `[]`
  means the source reported no genres:

  | Source | `genres` | `provider_rating` |
  |---|---|---|
  | IGDB | yes | yes |
  | MyAnimeList | yes | yes |
  | Open Library | `null` | yes |
  | OMDb | `null` | `null` |

- `my_review` is the logged-in user's review of the item, or `null`.
- Nothing found is `200` with `data: []`. A failing data source is 502
  `UPSTREAM_ERROR`. Search spends the sources' quotas, so it needs a login
  and uses the `search` rate limit.

### `GET /api/v3/items/{item_id}`

Returns the item in the shape above. A stored item is returned as it is;
otherwise it's fetched from the data source its prefix names, stored, and
returned.

| Case | Response |
|---|---|
| Unknown prefix (or an unstored `rawg_` id) | 404 `NOT_FOUND` |
| The data source has no such item | 404 `NOT_FOUND` |
| The data source fails | 502 `UPSTREAM_ERROR` |

### Reviews

A review, as every reviews endpoint returns it (`item` is the shape under
Items):

```json
{
  "id": 42,
  "user": {"username": "alice"},
  "item": { ... },
  "rating": 7.5,
  "text": "Great ending.",
  "tags": ["favourite", "rewatch"],
  "created_at": "2026-11-08T10:15:00Z",
  "updated_at": "2026-11-08T10:15:00Z"
}
```

- `text` is `null` when empty. `tags` is always a list.
- `created_at` is `null` for reviews older than this field.
- GETs ignore credentials, so a stale token or session can't turn a public
  read into a 401. POST, PATCH and DELETE use the default authentication
  classes on the same views, so an invalid token there gets 401
  `UNAUTHENTICATED`.

### `GET /api/v3/reviews`

Paginated, with the usual `limit` and `offset`. All params are optional:

- `username`: only this user's reviews.
- `q`: search text. Every word has to match the item's details or the
  review's tags.
- `category`, `exclude_category`: the ids from `/categories`, including
  subcategories like `anime:series`. Anything else is 400 `VALIDATION_ERROR`.
- `language`: whole language names, ignoring case.
- `category`, `exclude_category` and `language` are lists. Repeat the param,
  separate values with commas, or both: `?category=movie,series&category=game`.
- `sort`: `updated`, `-updated` (the default), `title`, `-title`, `rating` or
  `-rating`. A leading `-` means descending. `title` ignores case. Ties are
  broken by newest id first. Anything else is 400 `VALIDATION_ERROR`.

### Writing reviews

`POST /api/v3/reviews` takes `item_id` and `rating`, with optional `text` and
`tags`. `PATCH /api/v3/reviews/{id}` takes the same fields except `item_id`,
and changes only the fields sent.

- `rating`: a number from 0 to 10, with at most 2 decimal places.
- `text`: at most 5000 characters. Blank text is stored as `null`.
- `tags`: at most 10 tags, 100 characters joined with commas. Each is at most
  50 characters of letters, digits and hyphens. Case-insensitive duplicates
  keep the first spelling.
- On PATCH, `text: null` and `tags: []` clear them. Sending `item_id` is 400
  `VALIDATION_ERROR`: a review's item can't be changed.
- A user has one review per item.

`POST /api/v3/reviews` fetches and stores the item if it isn't stored yet, as
`/items/{item_id}` does:

| Case | Response |
|---|---|
| Created | 201 with the review and a `Location` header |
| Invalid fields | 400 `VALIDATION_ERROR` |
| Not logged in | 401 `UNAUTHENTICATED` |
| Unknown prefix, or the data source has no such item | 404 `NOT_FOUND` |
| The user already reviewed the item | 409 `DUPLICATE_REVIEW` |
| The data source fails | 502 `UPSTREAM_ERROR` |

The 409 body has the id of the existing review:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "code": "DUPLICATE_REVIEW",
  "detail": "You've already reviewed this item.",
  "existing_review_id": 42
}
```

`PATCH` returns 200 with the review, and `DELETE` returns 204 with no body.
Both are 401 when not logged in, 403 for another user's review, and 404 for
a missing id. There is no `PUT` (405 when logged in, 401 otherwise).

## Successful responses

```json
{ "data": { ... }, "meta": {} }
{ "data": [ ... ], "meta": { "pagination": { "count": 57, "limit": 20, "offset": 40 } } }
```

Use `api_response()` from `critic/api/responses.py`, or
`self.get_paginated_response()` in generic views.

## Errors

Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details,
sent with `Content-Type: application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "detail": "Some fields are invalid.",
  "errors": [{ "field": "rating", "code": "max_value", "message": "Ensure this value is less than or equal to 10." }]
}
```

- `type` is always `about:blank`, and `title` is the HTTP status phrase.
  Clients branch on `code`, which is stable and machine-readable.
- `errors` is present only for `VALIDATION_ERROR`. Nested fields use dotted
  paths (`items.0.name`). Errors that aren't about one field have
  `"field": null`.
- Every exception a v3 view raises is mapped to this shape: DRF's own,
  Django's `Http404`/`PermissionDenied`, and unhandled ones (logged with the
  traceback; the response never contains internals).
- Unhandled exceptions also send Django's `got_request_exception`, as Django
  does for its own 500s, so the test client re-raises them. To assert on the
  500 body in a test, use `Client(raise_request_exception=False)` or
  `APIRequestFactory`.
- Endpoints raise `ApiError(status, code, detail)` (`critic/api/errors.py`)
  for their own errors. **Add each new code to the table below.**

### Error codes

| Code | Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid fields; see `errors` |
| `PARSE_ERROR` | 400 | Malformed request body |
| `UNAUTHENTICATED` | 401 | Not logged in, or invalid credentials. Sent with a `WWW-Authenticate` header |
| `PERMISSION_DENIED` | 403 | Logged in but not allowed (including a missing CSRF token) |
| `NOT_FOUND` | 404 | No such object, or an unknown `/api/v3/...` path |
| `METHOD_NOT_ALLOWED` | 405 | Wrong method. Sent with an `Allow` header |
| `NOT_ACCEPTABLE` | 406 | `Accept` doesn't allow JSON |
| `DUPLICATE_REVIEW` | 409 | The user already reviewed the item. The body has `existing_review_id` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Body isn't `application/json` |
| `RATE_LIMITED` | 429 | Throttled. Sent with a `Retry-After` header (seconds) |
| `UPSTREAM_ERROR` | 502 | An external data source (OMDb, IGDB, MyAnimeList, Open Library) failed |
| `INTERNAL_ERROR` | 500 | Unhandled exception |

Any other DRF exception gets its own status and `code` = its `default_code`
in upper case (that's where `NOT_ACCEPTABLE` comes from).

## Other rules

- The version lives in the URL only (`/api/v3/...`). There is no `Accept`
  header versioning.
- **No trailing slashes**: `/api/v3/reviews/12`. A path with a trailing slash
  is an unknown path (404).
- Field names are snake_case, with no redundant prefixes.
- Missing values are `null`, never `"N/A"` or `""`. Lists are JSON arrays,
  never comma-separated strings.
- Numbers are JSON numbers, not strings. Set `coerce_to_string=False` on each
  decimal field in v3 serializers. It isn't set globally, so v2 doesn't change.
- Timestamps are ISO 8601 with a timezone.
- JSON only: no browsable API on v3. Request bodies must be
  `application/json`.
- Endpoints whose response is the same for everyone (like `/categories`) set
  `authentication_classes = []`, so a stale token or session can't turn a
  public read into a 401. Other views keep the default authentication
  classes: JWT must stay first for 401s to carry `WWW-Authenticate`.
- Limit/offset pagination (`?limit=&offset=`): the default limit is 20, and the
  maximum is 100. Larger limits are cut down to 100. Invalid values fall back
  to the defaults.

## Rate limits

v3 views use DRF's `ScopedRateThrottle`. A view opts in with `throttle_scope`.
The rates are in `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`:

| Scope | Rate |
|---|---|
| `search` | 30/min |
| `login` | 5/min |

- Rates apply per user when the request is logged in, otherwise per client
  IP.
- The client IP is the last `X-Forwarded-For` entry (`NUM_PROXIES = 1`:
  Traefik is the one proxy in prod), so a forged header prefix doesn't give a
  fresh bucket.
- Counts are kept in Django's default in-memory cache. That's correct with
  today's 1 pod and 1 gunicorn worker. **More worker processes or pods need a
  shared cache** (e.g. Redis), or each one counts separately.
- v2 has no throttling.

## Schema

- The v3 schema is served at `/api/v3/schema`, with Swagger at
  `/api/v3/docs`. It covers `/api/v3/...` only (later also the session auth
  endpoints). The v2 schema at `/api/schema/` leaves out `/api/v3/`.
- It's generated from `critic/api/schema_urls.py` with
  `V3_SCHEMA_SETTINGS` (`critic/api/schema.py`).
- Every v3 endpoint documents its real response types, never `dict`. Use
  `wrapped(Serializer, many=..., paginated=...)` for the 2xx response and
  `problem_responses(...)` for the errors (500 is always included):

  ```python
  @extend_schema(responses={200: wrapped(ThingSerializer, paginated=True), **problem_responses(400, 404)})
  ```

- `openapi/v3.yaml` is committed, and the frontend generates its types from
  it. **Regenerate it with `make schema`; never edit it by hand.** The
  command runs in the Docker image, so the output matches CI. A test fails
  when the committed file is stale, including after dependency bumps of
  drf-spectacular.
