from django.urls import path, include

from . import views

app_name = 'review'

review_patterns = [
    path('', views.ReviewList.as_view(), name='list'),
    path('create/', views.ReviewCreate.as_view(), name='create'),
    path('<int:pk>/', views.ReviewDetail.as_view(), name='detail'),
]

urlpatterns = [
    path('api/reviews/', include((review_patterns, 'reviews'))),
    path('search_item/<str:category>/<str:search_term>', views.search_review_item, name='search_review_item'),
    path('get_item_info/<str:category>/<str:item_id>', views.get_review_item_info, name='get_item_info'),
    path('add', views.add_review, name='add_review'),
    path('u/<str:username>', views.view_profile, name='profile'),
    path('u', views.profile_redirect, name='profile_redirect'),
    path('', views.view_reviews, name='view_reviews')
]
