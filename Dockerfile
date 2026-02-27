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

ARG DJANGO_SECRET_KEY=build-secret
ARG DJANGO_SETTINGS_MODULE=critic.settings.production
ENV SECRET_KEY=$DJANGO_SECRET_KEY
ENV DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE

RUN python manage.py collectstatic --noinput

RUN chmod +x /critic/scripts/entrypoint.sh

ENTRYPOINT ["/critic/scripts/entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "critic.wsgi:application"]
