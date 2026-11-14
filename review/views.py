from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.shortcuts import render
from django.contrib.admin.views.decorators import staff_member_required
from django.views.decorators.csrf import csrf_exempt

from .utils import api_usage, metrics


def health_check(request):
    """Health check endpoint for k8s probes. Returns 200 OK."""
    return HttpResponse("OK", status=200)


@csrf_exempt
def metrics_endpoint(request):
    if settings.METRICS_REQUIRE_AUTH and not (request.user.is_authenticated and request.user.is_staff):
        return HttpResponse('Forbidden', status=403)
    return metrics.metrics_http_response()


@staff_member_required
def api_usage_view(request):
    return render(request, 'review/api_usage.html', {
        **admin.site.each_context(request),
        'title': 'API usage',
        **api_usage.usage_summary(),
    })
