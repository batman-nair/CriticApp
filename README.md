# Critic App

Critic App is my personal review tracker.

I built it because I kept forgetting what I watched, played, or wanted to recommend. The goal was simple: make it fast to add a review, easy to search later, and pleasant to use on both desktop and mobile.

It has also been a way to build and run a full-stack Django project end-to-end, including deployment and operations workflows.

## What It Does

- Stores personal reviews across movie, game, anime, and manga categories
- Fetches item metadata from OMDb, RAWG, and Jikan
- Supports user profiles and searchable review lists
- Exposes API endpoints for review CRUD and item lookups
- Includes monitoring with Prometheus metrics and Grafana dashboards

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
- Use `make dev` to run the app
- Use `make test` to run tests

## Environment Notes

Start from `.env.example` and set values for:

- `SECRET_KEY`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `OMDB_API_KEY`, `RAWG_API_KEY` (for metadata enrichment)

## Deployment

If you want to deploy your own copy, use the Kubernetes guide in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Contributing

Contributions are welcome.

If you spot a bug, have an idea, or want to improve docs/tests/features, open an issue or submit a PR.



