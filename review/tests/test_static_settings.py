import re
import sys
from importlib import import_module
from pathlib import Path

import pytest
from django.conf import settings
from django.core.management import call_command
from django.template.loader import get_template
from django.templatetags.static import static
from django.test import override_settings
from django.urls import get_resolver


PRODUCTION_SETTINGS = 'critic.settings.production'


@pytest.fixture
def production_settings(monkeypatch):
    """The production settings module, evaluated with the env vars it requires.

    Importing it doesn't change the active (test) settings. It is removed from
    sys.modules afterwards so a later import runs it again.
    """
    monkeypatch.setenv('DB_NAME', 'test')
    monkeypatch.setenv('DB_USER', 'test')
    monkeypatch.setenv('DB_PASSWORD', 'test')
    sys.modules.pop(PRODUCTION_SETTINGS, None)
    yield import_module(PRODUCTION_SETTINGS)
    sys.modules.pop(PRODUCTION_SETTINGS, None)


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


def _project_template_names():
    base_dir = Path(settings.BASE_DIR)
    roots = [base_dir / 'templates', *base_dir.glob('*/templates')]
    return sorted(
        path.relative_to(root).as_posix()
        for root in roots
        for path in root.rglob('*.html')
    )


def test_templates_render_with_production_static_storage(tmp_path, production_settings):
    # The manifest storage raises for any {% static %} path that collectstatic
    # didn't produce, which would be a 500 in production. Tests otherwise use
    # plain storage, so render every template (with an empty context) against
    # a real manifest here.
    template_names = _project_template_names()
    assert 'base.html' in template_names

    # critic/urls.py resolves the favicon URL from the static storage when it
    # is first loaded; load it now so the hashed name doesn't leak into later tests.
    get_resolver().url_patterns

    with override_settings(STORAGES=production_settings.STORAGES, STATIC_ROOT=tmp_path):
        call_command('collectstatic', interactive=False, verbosity=0)

        for name in template_names:
            get_template(name).render({})

        assert re.fullmatch(r'/static/css/base\.[0-9a-f]{12}\.css', static('css/base.css'))
