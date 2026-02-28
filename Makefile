.PHONY: dev prod test test-local test-reset test-docker build down

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

prod:
	docker compose up --build -d

test:
	docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build web

test-local:
	python -m pytest

test-reset:
	python -c "from pathlib import Path; db = Path('db.test.sqlite3'); db.unlink(missing_ok=True)"

test-docker:
	docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build web

build:
	docker compose build

down:
	docker compose down
