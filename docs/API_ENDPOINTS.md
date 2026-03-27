# Public Endpoints

This document lists endpoints that are always accessible without authentication.

## Criteria

- Public means no login is required in all environments.
- Endpoints that are conditional by settings (for example metrics auth toggle) are excluded.
- Authenticated, owner-only, and admin-only endpoints are excluded.

Generated from current URL and view behavior on 2026-03-28.

## Public Endpoint Reference

| Method(s) | Path | Handler | Response | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/` | `review.views.view_reviews` | HTML | Main review feed page. |
| GET | `/health/` | `review.views.health_check` | Plain text (`OK`) | Health probe endpoint for runtime checks. |
| GET | `/u/<username>` | `review.views.view_profile` | HTML | Public profile page filtered to a username context. |
| GET | `/api/reviews/` | `review.views.ReviewList.get` | JSON | List reviews with optional query/filter params. |
| GET | `/api/reviews/<pk>/` | `review.views.ReviewDetail.retrieve` | JSON | Retrieve one review by primary key. |
| GET, POST | `/profile/login` | `django.contrib.auth.views.LoginView` | HTML / redirect | Show login form and submit credentials. |
| GET, POST | `/profile/logout` | `users.views.logout_view` | Redirect | Logs out current session if present and redirects to home. |

## Excluded Endpoint Categories

- Conditional public endpoint: `/metrics/` (depends on `METRICS_REQUIRE_AUTH`).
- Authenticated endpoints: `/add`, `/u`, review mutation routes, and item lookup routes.
- Admin route: `/admin/`.
