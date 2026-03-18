# Project Guidelines

## Code Style
- Follow existing Django/Python style in `review/` and `users/`; keep changes minimal and localized.
- Keep DRF serializers thin; `ReviewSerializer` and `ReviewItemSerializer` use `fields = '__all__'` in `review/serializers.py`.
- Preserve review-item API response contracts in `review/utils/api_utils.py` (string booleans like `"True"`/`"False"`).
- Keep list/search behavior in utilities (`review/utils/review_utils.py`) rather than embedding complex query logic in views.

## Architecture
- Apps: `review` (templates + DRF endpoints + external item lookup) and `users` (custom auth model).
- Request flow is URL -> view -> model/utility (`review/urls.py`, `review/views.py`, `review/utils/*`).
- Settings are environment-split: `critic/settings/common.py`, `development.py`, `production.py`, `test.py`.
- Category dispatch is centralized in `CATEGORY_TO_API` in `review/views.py`, backed by `ReviewItemAPIBase` implementations in `review/utils/api_utils.py`.
- Review-item fetch/persist logic is handled in `review/views.py` (`get_review_item_info`) and writes to `ReviewItem`.

## Build and Test
- Install dependencies: `pip install -r requirements.txt`.
- Local dev server: `python manage.py runserver`.
- Migrations: `python manage.py makemigrations` and `python manage.py migrate`.
- Local tests: `python -m pytest` (or `make test-local`).
- Pytest defaults to `DJANGO_SETTINGS_MODULE=critic.settings.test` (`pytest.ini`).
- Docker dev: `make dev` (or `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`).
- Docker tests (preferred in this repo): `make test` (or `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build web`).

## Deployment Environment
- Prefer CLI commands for server-side operations, troubleshooting, and deployment steps; avoid GUI workflow guidance.
- Assume a Debian Linux server environment and use Debian-compatible commands/package assumptions.

## Project Conventions
- Always use `settings.AUTH_USER_MODEL` for user relations; user model is `users.User` in `users/models.py`.
- Preserve uniqueness of reviews per `(user, review_item)` from `review/models.py`.
- Reuse `get_filtered_review_objects` for list query behavior instead of duplicating filters in views.
- For a new review category: update `CATEGORY_TO_API` in `review/views.py` and add a matching `ReviewItemAPIBase` subclass in `review/utils/api_utils.py`.
- Current categories include OMDb (`movie`), RAWG (`game`), and Jikan (`anime`, `manga`) via `CATEGORY_TO_API` in `review/views.py`.
- Keep review content text-first; no file/media upload flows are implemented.

## Integration Points
- External item providers are OMDb, RAWG, and Jikan in `review/utils/api_utils.py`.
- Required env vars include `SECRET_KEY`, database `DB_*`, `OMDB_API_KEY`, and `RAWG_API_KEY`.
- Compose production mounts static files via `./static:/critic/static` and uses `postgres_data` (`docker-compose.yml`).
- Deployment targets include Docker Compose and k3s manifests in `k8s/` (see `docs/DEPLOYMENT.md`).

## Security
- Write protection is enforced with DRF permissions in `review/permissions.py` (`IsOwnerOrReadOnly`).
- Auth usage is mixed by endpoint: some views are public (`view_reviews`, `view_profile`, `health_check`) while mutating/personal views require login (`add_review`, `profile_redirect`, `get_user_review`) in `review/views.py`.
- Production security settings (`ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, SSL/cookie toggles) are env-driven in `critic/settings/production.py`.
- Metrics and health paths are operationally important (`/health/`, `/metrics/`); keep probe/scrape behavior aligned with `k8s/deployment.yaml` and `k8s/servicemonitor.yaml`.
