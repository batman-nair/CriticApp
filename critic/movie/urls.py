from django.urls import path

from . import views

app_name = 'polls'

urlpatterns = [
    path('search/<str:movie_name>', views.search_movie, name='search_movie'),
    path('info/<str:imdb_id>', views.get_movie_info, name='get_movie_info'),
]