"""Review-domain API v3 routes, included by critic.api.urls. No trailing slashes."""

from django.urls import path

from .categories import CategoryListView

urlpatterns = [
    path('categories', CategoryListView.as_view(), name='v3-categories'),
]
