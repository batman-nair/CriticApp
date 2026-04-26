from django.urls import path, include

from . import views

app_name = 'review'

# v2 API endpoints (new RFC-compliant format)
review_patterns_v2 = [
    path('', views.ReviewListCreateV2.as_view(), name='list'),
    path('<int:pk>/', views.ReviewDetailV2.as_view(), name='detail'),
]

# v2 external lookup endpoints
lookup_patterns_v2 = [
    path('search/<str:category>/', views.SearchItemV2.as_view(), name='search_item'),
    path('item/<str:category>/<str:item_id>/', views.GetItemInfoV2.as_view(), name='get_item_info'),
]

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('metrics/', views.metrics_endpoint, name='metrics_endpoint'),
    # v2 API routes (new)
    path('api/v2/reviews/', include((review_patterns_v2, 'reviews_v2'))),
    # v2 lookup routes
    path('api/v2/lookup/', include((lookup_patterns_v2, 'lookup_v2'))),
    path('add', views.add_review, name='add_review'),
    path('u/<str:username>', views.view_profile, name='profile'),
    path('u', views.profile_redirect, name='profile_redirect'),
    path('', views.view_reviews, name='view_reviews')
]
