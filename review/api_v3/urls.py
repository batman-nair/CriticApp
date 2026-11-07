"""Review-domain API v3 routes, included by critic.api.urls. No trailing slashes."""

from django.urls import path

from .categories import CategoryListView
from .tags import TagListView

urlpatterns = [
    path('categories', CategoryListView.as_view(), name='v3-categories'),
    path('tags', TagListView.as_view(), name='v3-tags'),
]
