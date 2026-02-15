.PHONY: dev prod test build down

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

prod:
	docker compose up --build -d

test:
	docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm web pytest

build:
	docker compose build

down:
	docker compose down
