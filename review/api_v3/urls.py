"""Review-domain API v3 routes, included by critic.api.urls. No trailing slashes."""

from django.urls import path

from .categories import CategoryListView
from .facets import ReviewFacetsView
from .items import ItemDetailView
from .reviews import ReviewDetailView, ReviewListCreateView
from .search import SearchView
from .tags import TagListView
from .watchlist import WatchlistEntryView, WatchlistFacetsView, WatchlistView

urlpatterns = [
    path('categories', CategoryListView.as_view(), name='v3-categories'),
    path('tags', TagListView.as_view(), name='v3-tags'),
    path('search', SearchView.as_view(), name='v3-search'),
    path('items/<str:item_id>', ItemDetailView.as_view(), name='v3-item'),
    path('reviews', ReviewListCreateView.as_view(), name='v3-reviews'),
    path('reviews/facets', ReviewFacetsView.as_view(), name='v3-review-facets'),
    path('reviews/<int:pk>', ReviewDetailView.as_view(), name='v3-review'),
    path('watchlist', WatchlistView.as_view(), name='v3-watchlist'),
    path('watchlist/facets', WatchlistFacetsView.as_view(), name='v3-watchlist-facets'),
    path('watchlist/<str:item_id>', WatchlistEntryView.as_view(), name='v3-watchlist-entry'),
]
