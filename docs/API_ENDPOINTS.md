# API Endpoints

This document covers what Django serves outside API v3. The app's API, the one the frontend uses, is v3 under `/api/v3/`, documented in [API_V3.md](API_V3.md).

API v2 and the old Django pages were removed in #114.

## JWT Auth Endpoints

For scripts and other clients that use bearer tokens. The frontend uses the session endpoints in v3 instead. Access tokens last 15 minutes, refresh tokens 7 days; refreshing rotates the refresh token and blacklists the old one.

- `POST /api/auth/token/` — body `{ "username", "password" }`, returns `{ "access", "refresh" }`
- `POST /api/auth/token/refresh/` — body `{ "refresh" }`, returns a new `{ "access", "refresh" }`
- `POST /api/auth/token/blacklist/` — body `{ "refresh" }`, blacklists that refresh token (logout)
- `GET /api/auth/me/` — the current user, `{ "id", "username" }`; requires auth
- `POST /api/auth/register/` — body `{ "username", "password", "email" }` (email optional), returns `{ "access", "refresh" }` (201). Returns 403 unless `REGISTRATION_ENABLED=true`

Send the access token as `Authorization: Bearer <access>`.

```bash
curl -X POST "http://localhost:8000/api/auth/token/" \
  -H "Content-Type: application/json" \
  -d '{"username": "myuser", "password": "..."}'

curl "http://localhost:8000/api/auth/me/" -H "Authorization: Bearer <access>"
```

## Schema and Interactive Docs

The schema at these two URLs covers the JWT endpoints above. v3 has its own at `/api/v3/schema` and `/api/v3/docs`.

- OpenAPI schema: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`

## Staff Pages

- `/api/admin/` — Django admin
- `GET /api/usage/` — external API usage (today, this month, last 30 days) against quotas, in the admin's layout; non-staff users are redirected to the admin login

## Operational Endpoints (pod-internal)

Not reachable from outside the cluster: the ingress sends `/` to the frontend and blocks `/metrics`.

- `GET /health/` — health check, returns plain text `OK`
- `GET /metrics/` — Prometheus metrics; auth depends on `METRICS_REQUIRE_AUTH`
