# API v1 Contracts (Legacy - Deprecated)

**Status**: Deprecated
**Sunset Date**: January 1, 2027
**Migration**: See [API_MIGRATION_GUIDE.md](API_MIGRATION_GUIDE.md)

## Overview

v1 API endpoints return responses in a legacy format for backwards compatibility with existing clients. This documentation is provided for reference and to help plan migrations to v2.

**Deprecation Notice**: These endpoints include a `Deprecation` header and `Sunset` header in responses. Clients should begin planning migration to v2 endpoints immediately.

---

## Response Format (v1)

All v1 endpoints return success responses as:
```json
{
  "response": "True",
  "results": [...]  // optional, for list endpoints
  // or other fields as needed
}
```

Error responses return:
```json
{
  "response": "False",
  "error": "Human-readable error message",
  "source": "Optional upstream API name"  // for external API errors
}
```

**Key quirk**: The `response` field contains a **string** `"True"` or `"False"`, not boolean values. This is maintained for compatibility with upstream API contracts (OMDb, RAWG, Jikan).

---

## Endpoints

### Review Management

#### `GET /api/reviews/`
List all reviews with filtering and sorting.

**Query Parameters**:
- `query` (string, optional): Search term across title, tags, description. AND logic for multiple words.
- `username` (string, optional): Filter by username
- `filter_categories` (list, optional): **Note**: This parameter EXCLUDES categories (inverted semantics). To exclude movie/game reviews: `?filter_categories=movie,game`
- `ordering` (string, optional): Sort by `alpha`, `-alpha`, `rating`, `-rating`, `date`, `-date`

**Response**:
```json
[
  {
    "id": 1,
    "user": "john_doe",
    "review_item": {
      "id": 1,
      "item_id": "omdb_tt1234567",
      "category": "movie",
      "title": "Movie Title",
      "image_url": "...",
      "year": "2021",
      "attr1": "Action, Sci-Fi",
      "attr2": "Directors, Actors",
      "attr3": "movie",
      "description": "...",
      "rating": "8.5"
    },
    "review_rating": "9.5",
    "review_data": "Great movie!",
    "review_tags": "tag1,tag2",
    "modified_date": "2026-03-28"
  }
]
```

**Status Codes**: `200 OK`

---

#### `POST /api/reviews/create/`
Create a new review.

**Authentication**: Required (login)

**Request Body**:
```json
{
  "review_item": "omdb_tt1234567",
  "review_rating": "9.5",
  "review_data": "Great movie!",
  "review_tags": "tag1,tag2"
}
```

**Response** (201):
```json
{
  "id": 1,
  "user": "john_doe",
  "review_item": {...},
  "review_rating": "9.5",
  "review_data": "Great movie!",
  "review_tags": "tag1,tag2",
  "modified_date": "2026-03-28"
}
```

**Error** (400):
```json
{
  "error": "Possible duplicate review"
}
```

**Status Codes**:
- `201 Created` - Review created
- `400 Bad Request` - Validation error or duplicate
- `403 Forbidden` - Not authenticated

---

#### `GET /api/reviews/<id>/`
Get a single review.

**Authentication**: Public read

**Response** (200):
```json
{
  "id": 1,
  "user": "john_doe",
  "review_item": {...},
  "review_rating": "9.5",
  "review_data": "Great movie!",
  "review_tags": "tag1,tag2",
  "modified_date": "2026-03-28"
}
```

---

#### `PUT /api/reviews/<id>/`
Update a review (full replacement).

**Authentication**: Required, owner only

**Request Body**: Same as POST create

**Response** (200): Updated review object

**Status Codes**:
- `200 OK` - Updated
- `403 Forbidden` - Not owner
- `404 Not Found` - Review doesn't exist

---

#### `DELETE /api/reviews/<id>/`
Delete a review.

**Authentication**: Required, owner only

**Response**: HTTP 204 (No Content)

---

#### `GET /api/reviews/get_user_review/<item_id>/`
Get the authenticated user's review for a specific item.

**Authentication**: Required

**Response** (200):
```json
{
  "id": 1,
  "user": "john_doe",
  "review_item": {...},
  "review_rating": "9.5",
  "review_data": "Great movie!",
  "review_tags": "tag1,tag2",
  "category": "movie"
}
```

**Error** (404):
```json
{
  "error": "Not found"
}
```

---

#### `POST /api/reviews/post_review/`
Create or update a review via form submission.

**Authentication**: Required

**Request Body** (form-encoded):
- `id` (optional): For update, provide review ID
- `review_item` (string): Item ID
- `review_rating` (float): 0.0-10.0
- `review_data` (string): Review text
- `review_tags` (string): Comma-separated tags

**Response**: Redirect to add_review page with Django message

**Status Codes**:
- `302 Found` - Redirect (success or error)
- `403 Forbidden` - Not authenticated

---

### External Item Lookup

#### `GET /search_item/<category>/<search_term>`
Search for items in external APIs.

**Authentication**: Required

**Supported Categories**: `movie`, `game`, `anime`, `manga`

**Response**:
```json
{
  "response": "True",
  "results": [
    {
      "item_id": "omdb_tt1234567",
      "title": "Movie Title",
      "image_url": "...",
      "year": "2021"
    }
  ]
}
```

**Error**:
```json
{
  "response": "False",
  "error": "Invalid category.",
  "source": "OMDB API"
}
```

**Status Codes**:
- `200 OK` - Search results
- `400 Bad Request` - Invalid category
- `403 Forbidden` - Not authenticated

**Limits**: Up to 10 results per search

---

#### `GET /get_item_info/<category>/<item_id>`
Get detailed information for an item (with caching).

**Authentication**: Required

**Supported Categories**: `movie`, `game`, `anime`, `manga`

**Response**:
```json
{
  "response": "True",
  "item_id": "omdb_tt1234567",
  "title": "Movie Title",
  "image_url": "...",
  "year": "2021",
  "attr1": "Action, Sci-Fi",
  "attr2": "Directors, Cast",
  "attr3": "movie",
  "description": "Plot summary",
  "rating": "8.5",
  "category": "movie",
  "last_refreshed_at": "2026-03-28T10:30:00Z",
  "last_refresh_attempt_at": "2026-03-28T10:30:00Z",
  "refresh_error_count": 0
}
```

**Error**:
```json
{
  "response": "False",
  "error": "Item not found or API error"
}
```

**Status Codes**:
- `200 OK` - Item details
- `400 Bad Request` - Missing prefix, invalid category, or upstream API error
- `403 Forbidden` - Not authenticated

**Caching**: Local DB caching with refresh tracking

---

### Public Endpoints

#### `GET /health/`
Health check for Kubernetes probes.

**Authentication**: Public

**Response**: Plain text `OK`

**Status Code**: `200 OK`

---

#### `GET /metrics/`
Prometheus metrics.

**Authentication**: Optional (controlled by `METRICS_REQUIRE_AUTH` env var)

**Response**: Prometheus format metrics

**Status Code**: `200 OK` or `403 Forbidden`

---

## HTTP Status Codes (v1 Summary)

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200  | Success | Normal GET/PUT/PATCH |
| 201  | Created | POST new review |
| 204  | No Content | DELETE successful |
| 400  | Bad Request | Invalid input, duplicate review, API error |
| 403  | Forbidden | Not authenticated or not owner |
| 404  | Not Found | Resource doesn't exist |

---

## Authentication

All endpoints requiring authentication use Django session-based auth. Include session cookie in requests or provide DRF token authentication.

---

## Notes

- **String booleans**: v1 uses `"True"` and `"False"` as strings, not JSON booleans. This is intentional for upstream API compatibility.
- **Filtering bug**: `filter_categories` excludes rather than includes. This is a known issue fixed in v2.
- **No versioning headers**: v1 doesn't use versioning headers; clients automatically get v1 format.
- **Deprecation timeline**: Clients should begin migration to v2 now. v1 support ends January 1, 2027.

---

## Migration to v2

See [API_MIGRATION_GUIDE.md](API_MIGRATION_GUIDE.md) for step-by-step instructions on upgrading from v1 to v2.
