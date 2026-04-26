from django.urls import path, include

from . import views

app_name = 'review'

# v1 API endpoints (legacy, unchanged for backwards compatibility)
review_patterns_v1 = [
    path('', views.ReviewList.as_view(), name='list'),
    path('create/', views.ReviewCreate.as_view(), name='create'),
    path('<int:pk>/', views.ReviewDetail.as_view(), name='detail'),
    path('get_user_review/<str:item_id>/', views.get_user_review, name='get_user_review'),
    path('post_review/', views.ReviewPost.as_view(), name='post_review')
]

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
    # v1 API routes (legacy)
    path('api/reviews/', include((review_patterns_v1, 'reviews_v1'))),
    # v2 API routes (new)
    path('api/v2/reviews/', include((review_patterns_v2, 'reviews_v2'))),
    # v2 lookup routes
    path('api/v2/lookup/', include((lookup_patterns_v2, 'lookup_v2'))),
    path('search_item/<str:category>/<str:search_term>', views.search_review_item, name='search_review_item'),
    path('get_item_info/<str:category>/<str:item_id>', views.get_review_item_info, name='get_item_info'),
    path('add', views.add_review, name='add_review'),
    path('u/<str:username>', views.view_profile, name='profile'),
    path('u', views.profile_redirect, name='profile_redirect'),
    path('', views.view_reviews, name='view_reviews')
]
