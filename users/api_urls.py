"""Session auth routes, mounted at /api/auth/. No trailing slashes.

Included from both critic.urls and critic.api.schema_urls.
"""

from django.urls import path

from . import views

urlpatterns = [
    path('csrf', views.SessionCsrfView.as_view(), name='auth-csrf'),
    path('login', views.SessionLoginView.as_view(), name='auth-login'),
    path('logout', views.SessionLogoutView.as_view(), name='auth-logout'),
    path('session', views.SessionView.as_view(), name='auth-session'),
]
