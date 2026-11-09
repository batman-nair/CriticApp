.PHONY: dev prod test test-local test-reset test-docker build down schema

# Regenerate openapi/v3.yaml in the Docker image (the Python and package
# versions CI uses), so the committed file matches what the schema test
# generates in CI. The YAML comes out on stdout and replaces the file only
# when generation succeeds.
SCHEMA_IMAGE = criticapp-schema
SCHEMA_CMD = python manage.py spectacular --urlconf critic.api.schema_urls \
	--custom-settings critic.api.schema.V3_SCHEMA_SETTINGS --validate --fail-on-warn

dev:
	mkdir -p frontend/node_modules
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
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

schema:
	docker build -q -t $(SCHEMA_IMAGE) . >/dev/null
	docker run --rm -e SECRET_KEY=schema -e DJANGO_SETTINGS_MODULE=critic.settings.test \
		$(SCHEMA_IMAGE) $(SCHEMA_CMD) > openapi/v3.yaml.tmp \
		&& mv openapi/v3.yaml.tmp openapi/v3.yaml \
		|| { rm -f openapi/v3.yaml.tmp; exit 1; }
