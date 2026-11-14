from django.urls import path

from . import views

app_name = 'review'

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('metrics/', views.metrics_endpoint, name='metrics_endpoint'),
    path('api/usage/', views.api_usage_view, name='api_usage'),
]
