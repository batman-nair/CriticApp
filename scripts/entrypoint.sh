#!/bin/sh
set -e

if [ -n "$DB_HOST" ] && [ -n "$DB_USER" ]; then
  echo "Waiting for database..."
  until pg_isready -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" >/dev/null 2>&1; do
    sleep 1
  done
fi

if [ "${DJANGO_MIGRATE:-1}" = "1" ]; then
  python manage.py migrate --noinput
fi

if [ "${DJANGO_SEED:-0}" = "1" ]; then
  python manage.py seed_dev_data
fi

if [ "${DJANGO_COLLECTSTATIC:-1}" = "1" ]; then
  python manage.py collectstatic --noinput
fi

exec "$@"
