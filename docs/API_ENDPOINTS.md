# API Endpoints

This document lists all current API routes and how to call them.

All endpoints are under `/api/v2/`. For migrating from v1, see [API_MIGRATION_GUIDE.md](API_MIGRATION_GUIDE.md).

## Review Endpoints

### List reviews
- Method: `GET`
- Path: `/api/v2/reviews/`
- Auth: optional (public)
- Query params:
  - `query` — free-text search across title, tags, description, attributes, year
  - `username` — filter by reviewer username
  - `item_id` — filter by review item ID (use with `username` to check if a user reviewed a specific item)
  - `categories` — comma-separated include list (`movie`, `game`, `anime`, `manga`)
  - `exclude_categories` — comma-separated exclude list
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
- Body example: `{ "review_item": "<item_id>", "review_rating": 8.5, "review_data": "...", "review_tags": "tag1,tag2" }`
- Response: `{ "data": { ... }, "meta": { "version": "2.0" } }` (201 Created)
- Errors: 400 `DUPLICATE_REVIEW` if user already reviewed this item, 400 `INVALID_REQUEST` on validation failure

### Review detail
- Method: `GET`, `PUT`, `PATCH`, `DELETE`
- Path: `/api/v2/reviews/<id>/`
- Auth: read is public; write requires ownership
- Response: `{ "data": { ... }, "meta": { "version": "2.0" } }`
- DELETE returns 204

## External Lookup Endpoints

### Search items from external provider
- Method: `GET`
- Path: `/api/v2/lookup/search/<category>/<search_term>/`
- Auth: required
- Categories: `movie`, `game`, `anime`, `manga`
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

## Schema and Interactive Docs

- OpenAPI schema JSON: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`

## Error format

All errors follow the same envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message.",
    "details": {}
  },
  "meta": { "version": "2.0" }
}
```

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
    "review_item": "omdb_tt3896198",
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
curl "http://localhost:8000/api/v2/lookup/search/movie/inception/"

# Get item details
curl "http://localhost:8000/api/v2/lookup/item/movie/omdb_tt1375666/"
```

## JavaScript Examples

```javascript
// List reviews
const listResp = await fetch('/api/v2/reviews/?limit=20&offset=0');
const { data: reviews, meta } = await listResp.json();

// Check if user reviewed an item
const checkResp = await fetch('/api/v2/reviews/?item_id=omdb_tt3896198&username=myuser');
const checkData = await checkResp.json();
const hasReviewed = checkData.data.length > 0;

// Create review
const createResp = await fetch('/api/v2/reviews/', {
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

// Search external items
const searchResp = await fetch('/api/v2/lookup/search/movie/inception/');
const { data: results } = await searchResp.json();

// Get item details
const itemResp = await fetch('/api/v2/lookup/item/movie/omdb_tt1375666/');
const { data: item } = await itemResp.json();
```
