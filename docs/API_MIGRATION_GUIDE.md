# API Migration Guide: v1 to v2

This guide helps client applications migrate from v1 endpoints to v2 endpoints.

For the full v2 reference, see [API_ENDPOINTS.md](API_ENDPOINTS.md).

## Why migrate

- Consistent response envelope (`{ data, meta }` / `{ error, meta }`)
- Built-in pagination on review list endpoint
- Cleaner include/exclude category filtering
- External lookup endpoints versioned under `/api/v2/lookup/`
- Removed redundant endpoints (`get_user_review`, `post_review`, separate `create/`)
- Better long-term compatibility with generated OpenAPI docs

## Endpoint mapping

| v1 | v2 | Notes |
| --- | --- | --- |
| `GET /api/reviews/` | `GET /api/v2/reviews/` | Response wrapped in `{ data, meta }` with pagination |
| `POST /api/reviews/create/` | `POST /api/v2/reviews/` | Create is now POST on the list endpoint |
| `GET/PUT/PATCH/DELETE /api/reviews/<id>/` | `GET/PUT/PATCH/DELETE /api/v2/reviews/<id>/` | Response wrapped in `{ data, meta }` |
| `GET /api/reviews/get_user_review/<item_id>/` | **Removed** | Use `GET /api/v2/reviews/?item_id=<item_id>&username=<username>` |
| `POST /api/reviews/post_review/` | **Removed** | Use `POST /api/v2/reviews/` to create, `PATCH /api/v2/reviews/<id>/` to update |
| `GET /search_item/<category>/<term>` | `GET /api/v2/lookup/search/<category>/?q=<term>` | Response wrapped in `{ data, meta }` |
| `GET /get_item_info/<category>/<id>` | `GET /api/v2/lookup/item/<category>/<id>/` | Response wrapped in `{ data, meta }` |

## Step 1: Update base paths

Switch all request URLs:

| Before | After |
| --- | --- |
| `/api/reviews/` | `/api/v2/reviews/` |
| `/api/reviews/<id>/` | `/api/v2/reviews/<id>/` |
| `/search_item/...` | `/api/v2/lookup/search/<category>/?q=...` |
| `/get_item_info/...` | `/api/v2/lookup/item/.../` |

## Step 2: Update response parsing

All v2 responses use a consistent envelope.

### Success

```json
{
  "data": { ... },
  "meta": { "version": "2.0" }
}
```

List endpoints include pagination in `meta`:

```json
{
  "data": [ ... ],
  "meta": {
    "version": "2.0",
    "pagination": {
      "count": 100,
      "limit": 20,
      "offset": 0
    }
  }
}
```

### Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid review data.",
    "details": {}
  },
  "meta": { "version": "2.0" }
}
```

Update clients to read payload from `data`, pagination from `meta.pagination`, and errors from `error.code` / `error.message`.

## Step 3: Update create review calls

v1 used a separate path. v2 uses POST on the list endpoint:

```
# v1
POST /api/reviews/create/

# v2
POST /api/v2/reviews/
```

Request body is unchanged. Response is now wrapped in the v2 envelope (201 Created).

## Step 4: Migrate get_user_review

v1 had a dedicated endpoint to check if the current user reviewed an item:

```
# v1
GET /api/reviews/get_user_review/<item_id>/
```

In v2, use the list endpoint with `item_id` and `username` filters instead:

```
# v2
GET /api/v2/reviews/?item_id=<item_id>&username=<username>
```

The response is a paginated list. If `data` is non-empty, the user has reviewed the item. The review object is in `data[0]` and includes nested `review_item` details.

```javascript
// v1
const resp = await fetch(`/api/reviews/get_user_review/${itemId}/`);
if (resp.ok) {
  const review = await resp.json();
  // review exists
}

// v2
const resp = await fetch(`/api/v2/reviews/?item_id=${itemId}&username=${username}`);
const { data } = await resp.json();
if (data.length > 0) {
  const review = data[0];
  // review exists, includes review_item details
}
```

## Step 5: Migrate post_review (form-style upsert)

v1 had a single endpoint that created or updated based on whether `id` was present:

```
# v1
POST /api/reviews/post_review/
```

In v2, use separate endpoints:

```
# Create
POST /api/v2/reviews/

# Update
PATCH /api/v2/reviews/<id>/
```

```javascript
// v1
const resp = await fetch('/api/reviews/post_review/', {
  method: 'POST',
  body: formData  // included id field for updates
});

// v2 — create
const createResp = await fetch('/api/v2/reviews/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ review_item: itemId, review_rating: 8.5, review_data: '...' })
});

// v2 — update
const updateResp = await fetch(`/api/v2/reviews/${reviewId}/`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ review_rating: 9.0 })
});
```

## Step 6: Migrate lookup endpoints

v1 used unversioned paths. v2 puts them under `/api/v2/lookup/` with the standard response envelope.

### Search

```
# v1
GET /search_item/<category>/<search_term>
# Response: { "response": "True", "results": [...] }

# v2
GET /api/v2/lookup/search/<category>/?q=<search_term>
# Response: { "data": [...], "meta": { "version": "2.0" } }
```

### Item details

```
# v1
GET /get_item_info/<category>/<item_id>
# Response: { "response": "True", "title": "...", ... }

# v2
GET /api/v2/lookup/item/<category>/<item_id>/
# Response: { "data": { "item_id": "...", "title": "...", ... }, "meta": { "version": "2.0" } }
```

In v2, check for errors using the standard `error.code` field instead of `response == "False"`.

## Step 7: Update pagination

v1 returned full lists. v2 uses `limit` and `offset`:

- First page: `/api/v2/reviews/?limit=20&offset=0`
- Second page: `/api/v2/reviews/?limit=20&offset=20`
- Total count is in `meta.pagination.count`

## Step 8: Update category filtering

| v1 | v2 |
| --- | --- |
| `filter_categories` (excludes) | `exclude_categories` |
| _(not available)_ | `categories` (includes) |

Examples:
- Include movies only: `/api/v2/reviews/?categories=movie`
- Exclude anime and manga: `/api/v2/reviews/?exclude_categories=anime,manga`

## Verification checklist

- [ ] All review calls use `/api/v2/reviews/...`
- [ ] All lookup calls use `/api/v2/lookup/...`
- [ ] No calls to removed endpoints (`get_user_review`, `post_review`, `create/`)
- [ ] Create review uses `POST /api/v2/reviews/` (not `/create/`)
- [ ] Item-existence check uses list endpoint with `?item_id=...&username=...`
- [ ] Client parses `data` instead of root array/object
- [ ] Pagination reads `meta.pagination`
- [ ] Category filtering uses `categories` / `exclude_categories`
- [ ] Error handling reads `error.code` and `error.message`
- [ ] Lookup error handling checks `error` field instead of `response == "False"`
