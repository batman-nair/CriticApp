import time
from collections import defaultdict, deque
from threading import Lock
from typing import Optional, Tuple

import requests
from django.conf import settings
from django.http import HttpResponse
from prometheus_client import CONTENT_TYPE_LATEST, REGISTRY, Counter, Histogram, generate_latest

REQUEST_TOTAL = Counter(
    'critic_http_requests_total',
    'Total number of HTTP requests processed by CriticApp.',
    ['method', 'path', 'status_code'],
)

REQUEST_LATENCY_SECONDS = Histogram(
    'critic_http_request_latency_seconds',
    'Latency of HTTP requests in seconds.',
    ['method', 'path'],
)

REQUEST_FAILURE_TOTAL = Counter(
    'critic_http_request_failures_total',
    'Total number of failed HTTP requests (5xx).',
    ['method', 'path', 'status_code'],
)

UPSTREAM_API_CALLS_TOTAL = Counter(
    'critic_upstream_api_calls_total',
    'Total number of outgoing calls to external APIs.',
    ['provider', 'outcome'],
)

_window_all_requests = deque()
_window_failed_requests = deque()
_provider_counts = defaultdict(lambda: defaultdict(int))
_status_counts = defaultdict(int)
_state_lock = Lock()


def normalize_provider(source_name: str) -> str:
    lowered = (source_name or '').strip().lower()
    if 'omdb' in lowered:
        return 'omdb'
    if 'rawg' in lowered:
        return 'rawg'
    if 'jikan' in lowered:
        return 'jikan'
    return lowered.replace(' ', '_') or 'unknown'


def normalize_path(path: str) -> str:
    if not path:
        return '/'
    if not path.startswith('/'):
        return f'/{path}'
    return path


def _window_seconds() -> int:
    return max(getattr(settings, 'MONITORING_WINDOW_SECONDS', 300), 60)


def _failure_rate_threshold() -> float:
    return max(getattr(settings, 'MONITORING_FAILURE_RATE_THRESHOLD', 0.15), 0.0)


def _prune_window(now: float):
    max_age = _window_seconds()
    while _window_all_requests and (now - _window_all_requests[0] > max_age):
        _window_all_requests.popleft()
    while _window_failed_requests and (now - _window_failed_requests[0] > max_age):
        _window_failed_requests.popleft()


def record_request(method: str, path: str, status_code: int, latency_seconds: float):
    safe_method = (method or 'GET').upper()
    safe_path = normalize_path(path)
    safe_status_code = str(status_code)

    REQUEST_TOTAL.labels(method=safe_method, path=safe_path, status_code=safe_status_code).inc()
    REQUEST_LATENCY_SECONDS.labels(method=safe_method, path=safe_path).observe(max(latency_seconds, 0))
    if status_code >= 500:
        REQUEST_FAILURE_TOTAL.labels(method=safe_method, path=safe_path, status_code=safe_status_code).inc()

    now = time.time()
    with _state_lock:
        _window_all_requests.append(now)
        _status_counts[safe_status_code] += 1
        if status_code >= 500:
            _window_failed_requests.append(now)
        _prune_window(now)


def record_upstream_api_call(source_name: str, outcome: str):
    provider = normalize_provider(source_name)
    safe_outcome = (outcome or 'unknown').lower().replace(' ', '_')
    UPSTREAM_API_CALLS_TOTAL.labels(provider=provider, outcome=safe_outcome).inc()

    with _state_lock:
        _provider_counts[provider][safe_outcome] += 1


def _process_metrics():
    rss = REGISTRY.get_sample_value('process_resident_memory_bytes')
    cpu = REGISTRY.get_sample_value('process_cpu_seconds_total')
    open_fds = REGISTRY.get_sample_value('process_open_fds')
    return {
        'cpu_seconds_total': round(cpu, 4) if cpu is not None else None,
        'resident_memory_bytes': int(rss) if rss is not None else None,
        'open_fds': int(open_fds) if open_fds is not None else None,
    }


def _query_prometheus_scalar(query: str) -> Tuple[Optional[float], Optional[str]]:
    base_url = getattr(settings, 'PROMETHEUS_BASE_URL', '')
    if not base_url:
        return None, 'PROMETHEUS_BASE_URL is not configured.'

    timeout_seconds = max(getattr(settings, 'PROMETHEUS_QUERY_TIMEOUT_SECONDS', 3), 1)
    endpoint = f'{base_url}/api/v1/query'
    try:
        response = requests.get(endpoint, params={'query': query}, timeout=timeout_seconds)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        return None, f'Prometheus request failed: {exc.__class__.__name__}'
    except ValueError:
        return None, 'Prometheus returned invalid JSON.'

    if payload.get('status') != 'success':
        return None, 'Prometheus query response status was not success.'

    results = payload.get('data', {}).get('result', [])
    if not results:
        return None, None

    value_pair = results[0].get('value', [])
    if len(value_pair) < 2:
        return None, 'Prometheus query result did not include scalar value.'

    try:
        return float(value_pair[1]), None
    except (TypeError, ValueError):
        return None, 'Prometheus query result value could not be parsed.'


def _infrastructure_metrics() -> dict:
    namespace = getattr(settings, 'PROMETHEUS_NAMESPACE', 'criticapp')
    pod_regex = getattr(settings, 'PROMETHEUS_POD_REGEX', 'criticapp-web.*')

    cpu_query = (
        'sum(rate(container_cpu_usage_seconds_total{'
        f'namespace="{namespace}",pod=~"{pod_regex}",container!="POD",container!=""'
        '}[5m]))'
    )
    memory_query = (
        'sum(container_memory_working_set_bytes{'
        f'namespace="{namespace}",pod=~"{pod_regex}",container!="POD",container!=""'
        '})'
    )

    cpu_value, cpu_error = _query_prometheus_scalar(cpu_query)
    memory_value, memory_error = _query_prometheus_scalar(memory_query)

    errors = [error for error in [cpu_error, memory_error] if error]
    return {
        'available': len(errors) == 0,
        'errors': errors,
        'pod_cpu_cores': round(cpu_value, 4) if cpu_value is not None else None,
        'pod_memory_bytes': int(memory_value) if memory_value is not None else None,
        'pod_memory_mib': round((memory_value / (1024 * 1024)), 2) if memory_value is not None else None,
        'namespace': namespace,
        'pod_regex': pod_regex,
    }


def get_dashboard_snapshot() -> dict:
    now = time.time()
    with _state_lock:
        _prune_window(now)
        total_window = len(_window_all_requests)
        failed_window = len(_window_failed_requests)
        failure_rate = (failed_window / total_window) if total_window else 0.0

        status_counts = dict(sorted(_status_counts.items()))
        provider_counts = {
            provider: dict(sorted(outcomes.items()))
            for provider, outcomes in sorted(_provider_counts.items())
        }

    return {
        'window_seconds': _window_seconds(),
        'requests_in_window': total_window,
        'failed_requests_in_window': failed_window,
        'failure_rate_in_window': round(failure_rate, 4),
        'healthy': failure_rate <= _failure_rate_threshold(),
        'status_counts': status_counts,
        'external_api_calls': provider_counts,
        'process': _process_metrics(),
        'infrastructure': _infrastructure_metrics(),
    }


def metrics_http_response() -> HttpResponse:
    payload = generate_latest(REGISTRY)
    return HttpResponse(payload, content_type=CONTENT_TYPE_LATEST)


def reset_dashboard_state_for_tests():
    with _state_lock:
        _window_all_requests.clear()
        _window_failed_requests.clear()
        _provider_counts.clear()
        _status_counts.clear()
