"""URLconf the v3 schema is generated from. Mirrors the root mounts of v3 and session auth."""

from django.urls import include, path

urlpatterns = [
    path('api/auth/', include('users.api_urls')),
    path('api/v3/', include('critic.api.urls')),
]
