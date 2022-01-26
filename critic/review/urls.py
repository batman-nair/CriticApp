from django.urls import path

from . import views

app_name = 'review'

urlpatterns = [
    path('add', views.add_review, name='add_review'),
    path('', views.view_reviews, name='view_reviews')
]
