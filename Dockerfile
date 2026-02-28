FROM python:3.11-slim

# PYTHONDONTWRITEBYTECODE: Prevents Python from writing pyc files to disc
# PYTHONUNBUFFERED: Prevents Python from buffering stdout and stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /critic

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /critic/

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

COPY . /critic/

RUN SECRET_KEY=build-secret DJANGO_SETTINGS_MODULE=critic.settings.production DB_NAME=build DB_USER=build DB_PASSWORD=build DB_HOST=localhost DB_PORT=5432 python manage.py collectstatic --noinput

RUN chmod +x /critic/scripts/entrypoint.sh

ENTRYPOINT ["/critic/scripts/entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "critic.wsgi:application"]
