"""URLconf the v3 schema is generated from. Mirrors the root mount of v3."""

from django.urls import include, path

urlpatterns = [
    path('api/v3/', include('critic.api.urls')),
]
