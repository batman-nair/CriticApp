from .common import *

import os


DEBUG = True
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql_psycopg2',
        'NAME': os.environ.get('DB_NAME', 'critic'),
        'USER': os.environ.get('DB_USER', 'critic'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'critic'),
        'HOST': os.environ.get('DB_HOST', 'db'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

ALLOWED_HOSTS = ['*']
