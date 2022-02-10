from django.urls import path
from django.contrib.auth import views as auth_views

from . import views

app_name = 'review'

urlpatterns = [
    path('search_item/<str:category>/<str:search_term>', views.search_review_item, name='search_review_item'),
    path('get_item_info/<str:category>/<str:item_id>', views.get_review_item_info, name='get_item_info'),
    path('login', auth_views.LoginView.as_view(template_name='review/login.html'), name='login'),
    path('logout', views.logout_view, name='logout'),
    path('add', views.add_review, name='add_review'),
    path('', views.view_reviews, name='view_reviews')
]
