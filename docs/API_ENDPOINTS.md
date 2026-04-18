# API Endpoints

This document lists the primary API routes and how to call them.

## Versioning

- v1 (legacy): `/api/reviews/...`
- v2 (current): `/api/v2/reviews/...`
- Header-based versioning is also supported through DRF versioning configuration.

## v1 vs v2 Comparison

| Capability | v1 | v2 |
| --- | --- | --- |
| Base path | `/api/reviews/` | `/api/v2/reviews/` |
| Response envelope | raw objects / legacy lookup format | `{ data, meta }` / `{ error, meta }` |
| Pagination | No | Yes (`limit`, `offset`) |
| Category include filter | No | Yes (`categories`) |
| Category exclude filter | Legacy behavior via `filter_categories` | Yes (`exclude_categories`) |
| Create/update/delete | Yes | Yes |
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
  - v2 only: `categories`, `exclude_categories`, `limit`, `offset`

### Create review
- Method: `POST`
- v1: `/api/reviews/create/`
- v2: `/api/v2/reviews/create/`

### Review detail
- Method: `GET`, `PUT`, `PATCH`, `DELETE`
- v1: `/api/reviews/<id>/`
- v2: `/api/v2/reviews/<id>/`

### Get current user review for item
- Method: `GET`
- v1: `/api/reviews/get_user_review/<item_id>/`
- v2: `/api/v2/reviews/get_user_review/<item_id>/`

### Create/update via form-style endpoint
- Method: `POST`
- v1: `/api/reviews/post_review/`
- v2: `/api/v2/reviews/post_review/`

## External Lookup Endpoints

### Search items from external provider
- Method: `GET`
- Path: `/search_item/<category>/<search_term>`
- Auth: required
- Categories: `movie`, `game`, `anime`, `manga`

### Get item details from external provider
- Method: `GET`
- Path: `/get_item_info/<category>/<item_id>`
- Auth: required
- Categories: `movie`, `game`, `anime`, `manga`

## Schema and Interactive Docs

- OpenAPI schema JSON: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`

## Curl Examples

```bash
# v2 list with pagination
curl "http://localhost:8000/api/v2/reviews/?limit=10&offset=0"

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
```

## JavaScript Examples

```javascript
// v2 list
const listResp = await fetch('/api/v2/reviews/?limit=20&offset=0');
const listData = await listResp.json();

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
```
