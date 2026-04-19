# API v2 Contracts (Current - Production Ready)

**Status**: Current (v2.0)
**Release Date**: March 28, 2026
**Backwards Compatibility**: v1 endpoints remain available indefinitely; see [API_CONTRACTS_V1.md](API_CONTRACTS_V1.md)

## Overview

v2 API endpoints return RFC-compliant responses with a `data` + `meta` structure. All responses are JSON and use proper boolean values (not strings).

**Versioning**: Clients can request v2 responses via:
1. **Header**: `Accept: application/vnd.criticapp.v2+json`
2. **URL Path**: `/api/v2/reviews/` (recommended for simplicity)
3. Default: If no version specified, v1 format is returned for backwards compatibility

---

## Response Format (v2)

### Success Response
All successful v2 responses follow this structure:

```json
{
  "data": {...},           // Single object or array
  "meta": {
    "version": "2.0"       // API version
    // Optional pagination, timestamps, etc.
  }
}
```

**Example - Single Object**:
```json
{
  "data": {
    "id": 1,
    "user": "john_doe",
    "review_item": {...},
    "review_rating": 9.5,
    "review_data": "Great movie!",
    "review_tags": "tag1,tag2",
    "modified_date": "2026-03-28"
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Example - Array**:
```json
{
  "data": [
    {...},
    {...}
  ],
  "meta": {
    "version": "2.0"
  }
}
```

### Error Response
All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",           // Machine-readable code
    "message": "Human readable",    // Human-readable message
    "details": {...}                // Optional error details (e.g., validation errors)
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Example - Validation Error**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid review data.",
    "details": {
      "review_rating": ["Ensure this value is less than or equal to 10."],
      "review_data": ["This field may not be blank."]
    }
  },
  "meta": {
    "version": "2.0"
  }
}
```

---

## Error Codes (v2)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request |
| `VALIDATION_ERROR` | 400 | Input validation failed; see `details` for field-level errors |
| `DUPLICATE_REVIEW` | 400 | User has already reviewed this item |
| `INVALID_CATEGORY` | 400 | Unsupported item category |
| `NOT_FOUND` | 404 | Resource not found |
| `PERMISSION_DENIED` | 403 | Authenticated but not owner or insufficient permissions |
| `UNAUTHENTICATED` | 403 | Authentication required but not provided |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Endpoints

### Review Management

#### `GET /api/v2/reviews/`
List all reviews with filtering and sorting.

**Query Parameters**:
- `query` (string, optional): Search term across title, tags, description
- `username` (string, optional): Filter by username
- `categories` (list, optional): **FIXED**: Include only these categories (comma-separated)
- `exclude_categories` (list, optional): Exclude these categories (comma-separated)
- `ordering` (string, optional): Sort by `alpha`, `-alpha`, `rating`, `-rating`, `date`, `-date`
- `limit` (integer, optional): Number of results to return (default 20)
- `offset` (integer, optional): Starting index for paginated results

**Response** (200):
```json
{
  "data": [
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
        "rating": 8.5
      },
      "review_rating": 9.5,
      "review_data": "Great movie!",
      "review_tags": "tag1,tag2",
      "modified_date": "2026-03-28"
    }
  ],
  "meta": {
    "version": "2.0",
    "pagination": {
      "count": 120,
      "limit": 20,
      "offset": 0
    }
  }
}
```

**Status Codes**: `200 OK`

---

#### `POST /api/v2/reviews/`
Create a new review.

**Authentication**: Required (login)

**Request Body**:
```json
{
  "review_item": "omdb_tt1234567",
  "review_rating": 9.5,
  "review_data": "Great movie!",
  "review_tags": "tag1,tag2"
}
```

**Response** (201):
```json
{
  "data": {
    "id": 1,
    "user": "john_doe",
    "review_item": {...},
    "review_rating": 9.5,
    "review_data": "Great movie!",
    "review_tags": "tag1,tag2",
    "modified_date": "2026-03-28"
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Error (400 - Duplicate)**:
```json
{
  "error": {
    "code": "DUPLICATE_REVIEW",
    "message": "You've already reviewed this item.",
    "details": {
      "constraint": "unique(user, review_item)"
    }
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Error (400 - Validation)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid review data.",
    "details": {
      "review_rating": ["Ensure this value is less than or equal to 10."]
    }
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Status Codes**:
- `201 Created` - Review created
- `400 Bad Request` - Validation error or duplicate
- `403 Forbidden` - Not authenticated

---

#### `GET /api/v2/reviews/<id>/`
Get a single review.

**Authentication**: Public read

**Response** (200):
```json
{
  "data": {
    "id": 1,
    "user": "john_doe",
    "review_item": {...},
    "review_rating": 9.5,
    "review_data": "Great movie!",
    "review_tags": "tag1,tag2",
    "modified_date": "2026-03-28"
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Status Codes**: `200 OK`

---

#### `PUT /api/v2/reviews/<id>/`
Update a review (full replacement).

**Authentication**: Required, owner only

**Request Body**: Same as POST create

**Response** (200):
```json
{
  "data": {...},  // Updated review
  "meta": {
    "version": "2.0"
  }
}
```

**Status Codes**:
- `200 OK` - Updated
- `403 Forbidden` - Not owner
- `404 Not Found` - Review doesn't exist

---

#### `PATCH /api/v2/reviews/<id>/`
Partial update a review.

**Authentication**: Required, owner only

**Request Body** (any subset):
```json
{
  "review_rating": 8.5,
  "review_data": "Updated comment"
}
```

**Response** (200): Updated review with new values

---

#### `DELETE /api/v2/reviews/<id>/`
Delete a review.

**Authentication**: Required, owner only

**Response** (204): No content

---

#### `GET /api/v2/reviews/get_user_review/<item_id>/`
Get the authenticated user's review for a specific item.

**Authentication**: Required

**Response** (200):
```json
{
  "data": {
    "id": 1,
    "user": "john_doe",
    "review_item": {...},
    "review_rating": 9.5,
    "review_data": "Great movie!",
    "review_tags": "tag1,tag2",
    "category": "movie"
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Error** (404):
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Review not found for this item.",
    "details": {}
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Status Codes**:
- `200 OK` - Review found
- `404 Not Found` - No review by user for this item
- `403 Forbidden` - Not authenticated

---

#### `POST /api/v2/reviews/post_review/`
Create or update a review via form submission (v2 format).

**Authentication**: Required

**Request Body** (JSON):
```json
{
  "id": null,  // null for new, integer for update
  "review_item": "omdb_tt1234567",
  "review_rating": 9.5,
  "review_data": "Great movie!",
  "review_tags": "tag1,tag2"
}
```

**Response** (201 for new, 200 for update):
```json
{
  "data": {
    "message": "Review created successfully",
    "review": {...}
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Error (400 - Validation)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid review data.",
    "details": {
      "review_data": ["This field may not be blank."]
    }
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Error (403 - Permission)**:
```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You do not have permission to edit this review."
  },
  "meta": {
    "version": "2.0"
  }
}
```

**Status Codes**:
- `201 Created` - New review created
- `200 OK` - Review updated
- `400 Bad Request` - Validation or duplicate error
- `403 Forbidden` - Not authenticated or not owner
- `404 Not Found` - Review ID doesn't exist

---

### External Item Lookup

#### `GET /search_item/<category>/<search_term>`
Search for items in external APIs. (Legacy response shape retained for compatibility.)

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

**Status Codes**:
- `200 OK` - Search results
- `400 Bad Request` - Invalid category
- `403 Forbidden` - Not authenticated
- `429 Too Many Requests` - External lookup request rejected

---

#### `GET /get_item_info/<category>/<item_id>`
Get detailed information for an item. (Legacy response shape retained for compatibility.)

**Authentication**: Required

**Response**:
```json
{
  "response": "True",
  "item_id": "omdb_tt1234567",
  "title": "Movie Title",
  ...
}
```

**Status Codes**:
- `200 OK` - Item details
- `400 Bad Request` - Error from upstream
- `403 Forbidden` - Not authenticated
- `429 Too Many Requests` - External lookup request rejected

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

**Authentication**: Optional (controlled by `METRICS_REQUIRE_AUTH`)

**Response**: Prometheus format

**Status Code**: `200 OK` or `403 Forbidden`

---

## Versioning

### Header-Based Versioning
Request v2 responses explicitly via HTTP header:

```bash
curl -H "Accept: application/vnd.criticapp.v2+json" http://api.example.com/api/reviews/
```

### URL-Path Versioning (Recommended)
Use explicit URL paths (simpler, no header needed):

```bash
# Returns v2 format
curl http://api.example.com/api/v2/reviews/

# Returns v1 format (for backwards compatibility)
curl http://api.example.com/api/reviews/
```

### Default Behavior
If no version is specified, default is v1 for backwards compatibility.

---

## Response Headers (v2)

All v2 responses include:
- `Content-Type: application/json`
- `X-API-Version: 2.0` (indicates v2 response)

v1 endpoints may also include:
- `Deprecation: true` (signals end-of-life)
- `Sunset: <date>` (when endpoint will be removed)

---

## Improvements Over v1

| Aspect | v1 | v2 |
|--------|----|----|
| **Response structure** | Inconsistent | Consistent `{data, meta}` |
| **Boolean values** | Strings `"True"` | Proper JSON booleans `true` |
| **Error format** | Ad-hoc | Consistent with error codes |
| **Categorization** | Bug: `filter_categories` inverted | Fixed: `categories` includes |
| **Field metadata** | None | `attr1`, `attr2`, `attr3` renamed in future |
| **Pagination** | None | Limit/offset on v2 review list |
| **Validation** | Basic | Enhanced review/tag/lookup validation |
| **Rate limiting** | None | Not implemented |
| **Deprecation signals** | None | Headers included |

---

## Migration from v1

See [API_MIGRATION_GUIDE.md](API_MIGRATION_GUIDE.md) for detailed upgrade instructions.

---

## Support & Feedback

Questions or issues? Please report via:
- GitHub Issues: [link]
- Email: api-support@example.com
- Slack: #api-support

---

## Changelog

### v2.0 (March 28, 2026)
- Initial release
- RFC-compliant response format
- Proper boolean values (not strings)
- Improved error codes and messaging
- Versioning headers support
- v1 endpoints deprecated (6-12 month sunset)
