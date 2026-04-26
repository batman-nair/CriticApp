# API Endpoints

This document is the canonical reference for the current CriticApp API surface and behavior.

Application API endpoints are under `/api/v2/`. Operational and documentation endpoints remain at `/health/`, `/metrics/`, `/api/schema/`, and `/api/docs/`.

## Overview

Successful API responses use a JSON envelope with `data` and `meta` fields.

```json
{
  "data": {},
  "meta": {
    "version": "2.0"
  }
}
```

Application-level validation and domain errors use this envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message.",
    "details": {}
  },
  "meta": {
    "version": "2.0"
  }
}
```

Versioning options:
- Header: `Accept: application/vnd.criticapp.v2+json`
- URL path: `/api/v2/...`
- Default behavior: requests without an explicit version are served as v2

## Error codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `INVALID_REQUEST` | 400 | Request payload could not be processed |
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `DUPLICATE_REVIEW` | 400 | User already reviewed the item |
| `INVALID_CATEGORY` | 400 | Unsupported category |
| `UPSTREAM_ERROR` | 400 | External lookup provider returned an error |
| `SERIALIZATION_ERROR` | 400 | External item data could not be persisted |
| `NOT_FOUND` | 404 | Resource was not found |
| `PERMISSION_DENIED` | 403 | Authenticated user does not own the resource |
| `UNAUTHENTICATED` | 403 | Authentication is required |
| `PAGINATION_REQUIRED` | 500 | Pagination configuration is missing |

## Review Endpoints

### List reviews
- Method: `GET`
- Path: `/api/v2/reviews/`
- Auth: optional (public)
- Query params:
  - `query` — free-text search across title, tags, description, attributes, year
  - `username` — filter by reviewer username
  - `item_id` — filter by review item ID (use with `username` to check if a user reviewed a specific item)
  - `categories` — include list of `movie`, `game`, `anime`, `manga`; accepts comma-separated values or repeated params
  - `exclude_categories` — exclude list; accepts comma-separated values or repeated params
  - `ordering` — `alpha`, `-alpha`, `rating`, `-rating`, `date`, `-date`
  - `limit` — page size (default 20)
  - `offset` — pagination offset
- Response: `{ "data": [...], "meta": { "version": "2.0", "pagination": { "count", "limit", "offset" } } }`

### Create review
- Method: `POST`
- Path: `/api/v2/reviews/`
- Auth: required
- Required body fields: `review_item`, `review_rating`
- Optional body fields: `review_data`, `review_tags`
- Notes:
  - `review_item` is the `ReviewItem` primary key, not the external `item_id` string
  - `review_tags` is a comma-separated string with up to 10 tags
- Body example: `{ "review_item": 42, "review_rating": 8.5, "review_data": "...", "review_tags": "tag1,tag2" }`
- Response: `{ "data": { ... }, "meta": { "version": "2.0" } }` (201 Created)
- Errors: 400 `DUPLICATE_REVIEW` if user already reviewed this item; other invalid payloads also return `400 Bad Request`

### Review detail
- Method: `GET`, `PUT`, `PATCH`, `DELETE`
- Path: `/api/v2/reviews/<id>/`
- Auth: read is public; write requires ownership
- `GET` response: `{ "data": { ... }, "meta": { "version": "2.0" } }`
- `PUT` request body: same fields as create; use for full replacement
- `PATCH` request body: any writable subset of create fields
- `DELETE` returns `204 No Content`
- Common errors: `403 Forbidden` for non-owners, `404 Not Found` for missing reviews

## External Lookup Endpoints

### Search items from external provider
- Method: `GET`
- Path: `/api/v2/lookup/search/<category>/?q=<search_term>`
- Auth: required
- Categories: `movie`, `game`, `anime`, `manga`
- Notes:
  - `q` accepts normal title search text for all categories.
  - For `movie`, `q` can also be a full IMDb title URL such as `https://www.imdb.com/title/tt0111161/`.
  - IMDb title URLs are normalized to the existing `omdb_tt...` item ID and returned as a single exact-match result.
- Response: `{ "data": [{ "item_id": "...", "title": "...", ... }], "meta": { "version": "2.0" } }`
- Errors: 400 `INVALID_CATEGORY`, 400 `UPSTREAM_ERROR`

### Get item details from external provider
- Method: `GET`
- Path: `/api/v2/lookup/item/<category>/<item_id>/`
- Auth: required
- Categories: `movie`, `game`, `anime`, `manga`
- Response: `{ "data": { "item_id": "...", "title": "...", ... }, "meta": { "version": "2.0" } }`
- Behavior: returns cached item from DB if available, otherwise fetches from external provider and persists
- Errors: 400 `INVALID_CATEGORY`, 400 `UPSTREAM_ERROR`, 400 `SERIALIZATION_ERROR`

## Public Endpoints

- `GET /health/` — health check, returns plain text `OK`
- `GET /metrics/` — Prometheus metrics; auth depends on `METRICS_REQUIRE_AUTH`

## Schema and Interactive Docs

- OpenAPI schema JSON: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`

## Curl Examples

```bash
# List with pagination
curl "http://localhost:8000/api/v2/reviews/?limit=10&offset=0"

# Check if a user reviewed an item
curl "http://localhost:8000/api/v2/reviews/?item_id=omdb_tt3896198&username=myuser"

# Create review
curl -X POST "http://localhost:8000/api/v2/reviews/" \
  -H "Content-Type: application/json" \
  -d '{
    "review_item": 42,
    "review_rating": 8.7,
    "review_data": "Great pacing and cast.",
    "review_tags": "sci-fi,action"
  }'

# Partial update
curl -X PATCH "http://localhost:8000/api/v2/reviews/1/" \
  -H "Content-Type: application/json" \
  -d '{"review_rating": 9.1}'

# Delete
curl -X DELETE "http://localhost:8000/api/v2/reviews/1/"

# Search items
curl "http://localhost:8000/api/v2/lookup/search/movie/?q=inception"

# Search movie by full IMDb title URL
curl "http://localhost:8000/api/v2/lookup/search/movie/?q=https%3A%2F%2Fwww.imdb.com%2Ftitle%2Ftt0111161%2F"

# Get item details
curl "http://localhost:8000/api/v2/lookup/item/movie/omdb_tt1375666/"
```

## JavaScript Examples

```javascript
// Request v2 explicitly with an Accept header if needed
const acceptHeader = { Accept: 'application/vnd.criticapp.v2+json' };

// List reviews
const listResp = await fetch('/api/v2/reviews/?limit=20&offset=0', { headers: acceptHeader });
const { data: reviews, meta } = await listResp.json();

// Check if user reviewed an item
const checkResp = await fetch('/api/v2/reviews/?item_id=omdb_tt3896198&username=myuser');
const checkData = await checkResp.json();
const hasReviewed = checkData.data.length > 0;

// Create review
const createResp = await fetch('/api/v2/reviews/', {
  method: 'POST',
  headers: { ...acceptHeader, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    review_item: 42,
    review_rating: 8.4,
    review_data: 'Responsive controls and good level design.',
    review_tags: 'platformer,indie'
  })
});
const createData = await createResp.json();

// Search external items
const searchResp = await fetch('/api/v2/lookup/search/movie/?q=inception');
const { data: results } = await searchResp.json();

// Search a movie by full IMDb title URL
const imdbResp = await fetch('/api/v2/lookup/search/movie/?q=' + encodeURIComponent('https://www.imdb.com/title/tt0111161/'));
const { data: imdbResults } = await imdbResp.json();

// Get item details
const itemResp = await fetch('/api/v2/lookup/item/movie/omdb_tt1375666/');
const { data: item } = await itemResp.json();
```
