from django.urls import path, include

from . import views

app_name = 'review'

review_patterns = [
    path('', views.ReviewList.as_view(), name='list'),
    path('create/', views.ReviewCreate.as_view(), name='create'),
    path('<int:pk>/', views.ReviewDetail.as_view(), name='detail'),
    path('get_user_review/<str:item_id>/', views.get_user_review, name='get_user_review'),
    path('post_review/', views.ReviewPost.as_view(), name='post_review')
]

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('health/monitoring/', views.monitoring_health, name='monitoring_health'),
    path('monitoring/', views.monitoring_dashboard, name='monitoring_dashboard'),
    path('monitoring/timeline/', views.monitoring_timeline, name='monitoring_timeline'),
    path('metrics/', views.metrics_endpoint, name='metrics_endpoint'),
    path('api/reviews/', include((review_patterns, 'reviews'))),
    path('search_item/<str:category>/<str:search_term>', views.search_review_item, name='search_review_item'),
    path('get_item_info/<str:category>/<str:item_id>', views.get_review_item_info, name='get_item_info'),
    path('add', views.add_review, name='add_review'),
    path('u/<str:username>', views.view_profile, name='profile'),
    path('u', views.profile_redirect, name='profile_redirect'),
    path('', views.view_reviews, name='view_reviews')
]
