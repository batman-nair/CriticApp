# Critic App

Critic App is my personal review tracker.

I built it because I kept forgetting what I watched, played, or wanted to recommend. The goal was simple: make it fast to add a review, easy to search later, and pleasant to use on both desktop and mobile.

It has also been a way to build and run a full-stack Django project end-to-end, including deployment and operations workflows.

## What It Does

- Stores personal reviews across movie, series, game, anime, manga, and book categories
- Fetches item metadata from OMDb, IGDB, MyAnimeList, and Open Library
- Supports user profiles and searchable review lists
- Exposes API endpoints for review CRUD and item lookups
- Includes an API usage page with Telegram quota alerts, and machine monitoring via Beszel

## Technical Stuff

- Django + Django REST Framework backend
- Custom user model and app-level review domain modeling
- Category-based external API integration layer
- Docker-based development and test workflows
- Kubernetes (k3s) production deployment path
- GitHub Actions deployment pipeline
- Prometheus-friendly metrics and background refresh jobs

## Run Locally

- Set up `.env` from `.env.example`
- Use `make dev` to run the app. It serves two URLs:
  - http://devbox:8000: Django, the current site
  - http://devbox:5173: the new frontend, with hot reload and `/api` forwarded to Django
- To run the frontend outside Compose, use `npm run dev` in `frontend/`. If Django isn't at `http://localhost:8000`, set `VITE_API_PROXY_TARGET` in your shell (`.env` files aren't read for it)
- `npm run dev` outside Compose, and `npm run build` anywhere, need `VITE_OWNER_USERNAME`: the username whose reviews the site shows. Set it in your shell or in `frontend/.env.local`
- Use `make test` to run tests

## Environment Notes

Start from `.env.example` and set values for:

- `SECRET_KEY`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `OMDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `MAL_CLIENT_ID` (for metadata enrichment; the IGDB keys are a Twitch app's client ID and secret)

## Deployment

If you want to deploy your own copy, use the Kubernetes guide in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Contributing

Contributions are welcome.

If you spot a bug, have an idea, or want to improve docs/tests/features, open an issue or submit a PR.



