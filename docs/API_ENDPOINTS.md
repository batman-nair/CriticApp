# API Endpoints

This document lists the primary API routes and how to call them.

## Versioning

- v1 (legacy): `/api/reviews/...`
- v2 (current): `/api/v2/reviews/...`
- Header-based versioning is also supported through DRF versioning configuration.

## v1 vs v2 Comparison

| Capability | v1 | v2 |
| --- | --- | --- |
| Base path | `/api/reviews/` | `/api/v2/reviews/`, `/api/v2/lookup/` |
| Response envelope | raw objects / legacy lookup format | `{ data, meta }` / `{ error, meta }` |
| Pagination | No | Yes (`limit`, `offset`) |
| Category include filter | No | Yes (`categories`) |
| Category exclude filter | Legacy behavior via `filter_categories` | Yes (`exclude_categories`) |
| Item ID filter | No | Yes (`item_id`) |
| Create/update/delete | Yes | Yes |
| External lookup | Unversioned `/search_item/`, `/get_item_info/` | `/api/v2/lookup/search/`, `/api/v2/lookup/item/` |
| Backward compatibility mode | Primary | Compatible side-by-side |

## Review Endpoints

### List reviews
- Method: `GET`
- v1: `/api/reviews/`
- v2: `/api/v2/reviews/`
- Query params:
  - `query`
  - `username`
  - `ordering`: `alpha`, `-alpha`, `rating`, `-rating`, `date`, `-date`
  - v2 only: `categories`, `exclude_categories`, `item_id`, `limit`, `offset`
- Note: Use `item_id` + `username` to check if a user already reviewed an item (replaces the legacy `get_user_review` endpoint).

### Create review
- Method: `POST`
- v1: `/api/reviews/create/`
- v2: `/api/v2/reviews/create/`

### Review detail
- Method: `GET`, `PUT`, `PATCH`, `DELETE`
- v1: `/api/reviews/<id>/`
- v2: `/api/v2/reviews/<id>/`

### Get current user review for item (v1 only)
- Method: `GET`
- v1: `/api/reviews/get_user_review/<item_id>/`
- Note: Removed in v2. Use the list endpoint with `?item_id=<id>&username=<username>` instead.

### Create/update via form-style endpoint (v1 only)
- Method: `POST`
- v1: `/api/reviews/post_review/`
- Note: Removed in v2. Use `POST /api/v2/reviews/create/` and `PATCH /api/v2/reviews/<id>/` instead.

## External Lookup Endpoints

### Search items from external provider
- Method: `GET`
- v1 (unversioned): `/search_item/<category>/<search_term>`
- v2: `/api/v2/lookup/search/<category>/<search_term>/`
- Auth: required
- Categories: `movie`, `game`, `anime`, `manga`
- v2 response: `{ "data": [...], "meta": { "version": "2.0" } }`

### Get item details from external provider
- Method: `GET`
- v1 (unversioned): `/get_item_info/<category>/<item_id>`
- v2: `/api/v2/lookup/item/<category>/<item_id>/`
- Auth: required
- Categories: `movie`, `game`, `anime`, `manga`
- v2 response: `{ "data": { ... }, "meta": { "version": "2.0" } }`
- Note: Persists the item to the database if not already cached.

## Schema and Interactive Docs

- OpenAPI schema JSON: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`

## Curl Examples

```bash
# v2 list with pagination
curl "http://localhost:8000/api/v2/reviews/?limit=10&offset=0"

# v2 list filtered by item_id (replaces get_user_review)
curl "http://localhost:8000/api/v2/reviews/?item_id=omdb_tt3896198&username=myuser"

# v2 create review
curl -X POST "http://localhost:8000/api/v2/reviews/create/" \
  -H "Content-Type: application/json" \
  -d '{
    "review_item": "omdb_tt3896198",
    "review_rating": 8.7,
    "review_data": "Great pacing and cast.",
    "review_tags": "sci-fi,action"
  }'

# v2 partial update
curl -X PATCH "http://localhost:8000/api/v2/reviews/1/" \
  -H "Content-Type: application/json" \
  -d '{"review_rating": 9.1}'

# v2 search items
curl "http://localhost:8000/api/v2/lookup/search/movie/inception/"

# v2 get item details
curl "http://localhost:8000/api/v2/lookup/item/movie/omdb_tt1375666/"
```

## JavaScript Examples

```javascript
// v2 list
const listResp = await fetch('/api/v2/reviews/?limit=20&offset=0');
const listData = await listResp.json();

// v2 check if user reviewed an item (replaces get_user_review)
const checkResp = await fetch('/api/v2/reviews/?item_id=omdb_tt3896198&username=myuser');
const checkData = await checkResp.json();
// checkData.data is an array; length > 0 means user has reviewed

// v2 create
const createResp = await fetch('/api/v2/reviews/create/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    review_item: 'rawg_3498',
    review_rating: 8.4,
    review_data: 'Responsive controls and good level design.',
    review_tags: 'platformer,indie'
  })
});
const createData = await createResp.json();

// v2 search external items
const searchResp = await fetch('/api/v2/lookup/search/movie/inception/');
const searchData = await searchResp.json();
// searchData.data is an array of matching items

// v2 get item details
const itemResp = await fetch('/api/v2/lookup/item/movie/omdb_tt1375666/');
const itemData = await itemResp.json();
// itemData.data contains the item details
```
