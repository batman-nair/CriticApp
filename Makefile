.PHONY: dev prod test test-local test-reset test-docker build down schema

# Regenerate openapi/v3.yaml in the Docker image (the Python and package
# versions CI uses), so the committed file matches what the schema test
# generates in CI. The YAML comes out on stdout and replaces the file only
# when generation succeeds. Then regenerate the frontend's types from it in
# a Node container that mounts only what the generator reads, so it can't
# touch the host's node_modules or leave root-owned files.
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
	docker run --rm \
		-v "$(CURDIR)/frontend/package.json:/app/frontend/package.json:ro" \
		-v "$(CURDIR)/frontend/package-lock.json:/app/frontend/package-lock.json:ro" \
		-v "$(CURDIR)/openapi/v3.yaml:/app/openapi/v3.yaml:ro" \
		-w /app/frontend node:24-slim \
		sh -c 'npm ci --ignore-scripts --no-audit --no-fund >&2 && mkdir -p src/api && npm run --silent gen:api >&2 && cat src/api/schema.d.ts' \
		> frontend/src/api/schema.d.ts.tmp \
		&& mv frontend/src/api/schema.d.ts.tmp frontend/src/api/schema.d.ts \
		|| { rm -f frontend/src/api/schema.d.ts.tmp; exit 1; }
