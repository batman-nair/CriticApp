"""API v3 routes, mounted at /api/v3/. No trailing slashes."""

from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .schema import V3_SCHEMA_SETTINGS
from .views import V3NotFoundView

urlpatterns = [
    # versioning_class=None: the global versioning would report version 2.0
    # to the schema generator.
    path('schema', SpectacularAPIView.as_view(
        urlconf='critic.api.schema_urls',
        custom_settings=V3_SCHEMA_SETTINGS,
        versioning_class=None,
    ), name='api-v3-schema'),
    path('docs', SpectacularSwaggerView.as_view(url_name='api-v3-schema'), name='api-v3-docs'),
    path('', include('review.api_v3.urls')),
    # Must stay last: unknown /api/v3/ paths get a 404 problem, not Django's HTML 404.
    re_path(r'^.*$', V3NotFoundView.as_view()),
]
