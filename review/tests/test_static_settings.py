from importlib import import_module, reload

import pytest


@pytest.fixture
def production_settings(monkeypatch):
    """The production settings module, evaluated with the env vars it requires.

    Importing it doesn't change the active (test) settings.
    """
    monkeypatch.setenv('DB_NAME', 'test')
    monkeypatch.setenv('DB_USER', 'test')
    monkeypatch.setenv('DB_PASSWORD', 'test')
    return reload(import_module('critic.settings.production'))


def test_production_uses_hashed_static_storage(production_settings):
    # Hashed file names change with the content, so a deploy never pairs new
    # HTML with CSS/JS the browser cached from the previous release.
    assert production_settings.STORAGES['staticfiles']['BACKEND'] == (
        'whitenoise.storage.CompressedManifestStaticFilesStorage'
    )
    assert production_settings.STORAGES['default']['BACKEND'] == (
        'django.core.files.storage.FileSystemStorage'
    )


@pytest.mark.parametrize('module_name', ['common', 'production', 'development', 'test'])
def test_settings_do_not_use_removed_staticfiles_storage(production_settings, module_name):
    # Django 5.1 removed STATICFILES_STORAGE; it is silently ignored, so use STORAGES.
    module = import_module(f'critic.settings.{module_name}')
    assert not hasattr(module, 'STATICFILES_STORAGE')
