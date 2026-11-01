from .common import *

import os


DEBUG = False

# External APIs are mocked in non-integration tests, but review/views.py
# builds the API clients at import time and they require a key. Real keys
# from the environment or .env still take precedence.
os.environ.setdefault('OMDB_API_KEY', 'test-dummy')
os.environ.setdefault('RAWG_API_KEY', 'test-dummy')
os.environ.setdefault('MAL_CLIENT_ID', 'test-dummy')

# SQLite by default; set TEST_DB_ENGINE=postgresql to test against Postgres
# (used in CI so migrations are exercised on the same engine as prod).
if os.environ.get('TEST_DB_ENGINE') == 'postgresql':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('TEST_DB_NAME', 'critic_test'),
            'USER': os.environ.get('TEST_DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('TEST_DB_PASSWORD', ''),
            'HOST': os.environ.get('TEST_DB_HOST', 'localhost'),
            'PORT': os.environ.get('TEST_DB_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.environ.get('TEST_DB_NAME', BASE_DIR / 'db.test.sqlite3'),
        }
    }

ALLOWED_HOSTS = ['*']

WHITENOISE_USE_FINDERS = True

# The default PBKDF2 hasher is deliberately slow (~1s per create_user/login),
# which dominated the suite's runtime. Tests don't need real password hashing.
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# Never send real quota alerts from tests, even if .env has Telegram credentials.
ALERT_TELEGRAM_BOT_TOKEN = ''
ALERT_TELEGRAM_CHAT_ID = ''
