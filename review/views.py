from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

from .utils import metrics


def health_check(request):
    """Health check endpoint for k8s probes. Returns 200 OK."""
    return HttpResponse("OK", status=200)


@csrf_exempt
def metrics_endpoint(request):
    if settings.METRICS_REQUIRE_AUTH and not (request.user.is_authenticated and request.user.is_staff):
        return HttpResponse('Forbidden', status=403)
    return metrics.metrics_http_response()
