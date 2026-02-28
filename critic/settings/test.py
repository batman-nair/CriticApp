from .common import *

import os


DEBUG = False

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.environ.get('TEST_DB_NAME', BASE_DIR / 'db.test.sqlite3'),
    }
}

ALLOWED_HOSTS = ['*']

STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'
WHITENOISE_USE_FINDERS = True