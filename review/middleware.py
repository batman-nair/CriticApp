import time

from .utils import metrics


class RequestMetricsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start_time = time.perf_counter()
        method = request.method
        path = self._resolve_path(request)
        try:
            response = self.get_response(request)
        except Exception:
            elapsed = time.perf_counter() - start_time
            metrics.record_request(method=method, path=path, status_code=500, latency_seconds=elapsed)
            raise

        elapsed = time.perf_counter() - start_time
        metrics.record_request(method=method, path=path, status_code=response.status_code, latency_seconds=elapsed)
        return response

    @staticmethod
    def _resolve_path(request) -> str:
        route = getattr(getattr(request, 'resolver_match', None), 'route', None)
        if route:
            return route
        return request.path
