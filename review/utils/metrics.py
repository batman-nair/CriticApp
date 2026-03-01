import time
import math
import logging
from collections import defaultdict, deque
from threading import Lock
from typing import Dict, Optional, Tuple

import requests
from django.conf import settings
from django.http import HttpResponse
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    REGISTRY,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    push_to_gateway,
)

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
_logger = logging.getLogger(__name__)
KNOWN_UPSTREAM_PROVIDERS = ('omdb', 'rawg', 'jikan')
_PROVIDER_EVENT_RETENTION_SECONDS = 35 * 24 * 60 * 60
_provider_events = defaultdict(deque)


def push_refresh_run_metrics(
    *,
    processed: int,
    refreshed: int,
    failed: int,
    skipped: int,
    duration_seconds: float,
    dry_run: bool,
    success: bool,
    provider_totals: Dict[str, Dict[str, int]],
):
    pushgateway_url = getattr(settings, 'PUSHGATEWAY_URL', '').rstrip('/')
    if not pushgateway_url:
        return

    job_name = getattr(settings, 'PUSHGATEWAY_JOB_NAME', 'critic_refresh_review_items')
    timeout_seconds = max(getattr(settings, 'PUSHGATEWAY_TIMEOUT_SECONDS', 5), 1)
    dry_run_label = 'true' if dry_run else 'false'
    status_label = 'success' if success else 'failure'

    registry = CollectorRegistry()
    run_status = Gauge(
        'critic_refresh_run_status',
        'Refresh command status (1 for success, 0 for failure).',
        ['status', 'dry_run'],
        registry=registry,
    )
    run_duration = Gauge(
        'critic_refresh_run_duration_seconds',
        'Total duration of refresh command run in seconds.',
        ['dry_run'],
        registry=registry,
    )
    run_timestamp = Gauge(
        'critic_refresh_run_last_timestamp_seconds',
        'Unix timestamp of the latest refresh command completion.',
        ['dry_run'],
        registry=registry,
    )
    run_item_totals = Gauge(
        'critic_refresh_run_items_total',
        'Per-run refresh item totals by result.',
        ['result', 'dry_run'],
        registry=registry,
    )
    provider_item_totals = Gauge(
        'critic_refresh_run_provider_items_total',
        'Per-run refresh item totals by provider and result.',
        ['provider', 'result', 'dry_run'],
        registry=registry,
    )

    run_status.labels(status=status_label, dry_run=dry_run_label).set(1.0)
    run_duration.labels(dry_run=dry_run_label).set(max(duration_seconds, 0.0))
    run_timestamp.labels(dry_run=dry_run_label).set(time.time())

    totals_by_result = {
        'processed': processed,
        'refreshed': refreshed,
        'failed': failed,
        'skipped': skipped,
    }
    for result, count in totals_by_result.items():
        run_item_totals.labels(result=result, dry_run=dry_run_label).set(max(count, 0))

    for provider, totals in sorted(provider_totals.items()):
        safe_provider = normalize_provider(provider)
        for result in ('processed', 'refreshed', 'failed', 'skipped'):
            provider_item_totals.labels(
                provider=safe_provider,
                result=result,
                dry_run=dry_run_label,
            ).set(max(totals.get(result, 0), 0))

    try:
        push_to_gateway(
            gateway=pushgateway_url,
            job=job_name,
            registry=registry,
            timeout=timeout_seconds,
        )
    except Exception as exc:
        _logger.warning('Pushgateway metrics push failed: %s', exc.__class__.__name__)


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

    now = time.time()
    with _state_lock:
        _provider_counts[provider][safe_outcome] += 1
        provider_events = _provider_events[provider]
        provider_events.append(now)
        cutoff = now - _PROVIDER_EVENT_RETENTION_SECONDS
        while provider_events and provider_events[0] < cutoff:
            provider_events.popleft()


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


def _query_prometheus_range(
    query: str,
    start: int,
    end: int,
    step: str,
    group_by_label: Optional[str] = None,
) -> Tuple[object, Optional[str]]:
    base_url = getattr(settings, 'PROMETHEUS_BASE_URL', '')
    if not base_url:
        return {} if group_by_label else [], 'PROMETHEUS_BASE_URL is not configured.'

    timeout_seconds = max(getattr(settings, 'PROMETHEUS_QUERY_TIMEOUT_SECONDS', 3), 1)
    endpoint = f'{base_url}/api/v1/query_range'

    try:
        response = requests.get(
            endpoint,
            params={
                'query': query,
                'start': start,
                'end': end,
                'step': step,
            },
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        _logger.warning('Prometheus range query failed for %s: %s', query, exc.__class__.__name__)
        return ({} if group_by_label else []), f'Prometheus request failed: {exc.__class__.__name__}'
    except ValueError:
        _logger.warning('Prometheus range query returned invalid JSON for %s', query)
        return ({} if group_by_label else []), 'Prometheus returned invalid JSON.'

    if payload.get('status') != 'success':
        _logger.warning('Prometheus range query status was not success for %s', query)
        return ({} if group_by_label else []), 'Prometheus query response status was not success.'

    results = payload.get('data', {}).get('result', [])
    if not results:
        return ({} if group_by_label else []), None

    def _parse_points(values: list) -> list:
        points = []
        for pair in values:
            if len(pair) < 2:
                continue
            try:
                parsed_value = float(pair[1])
                if not math.isfinite(parsed_value):
                    parsed_value = 0.0
                points.append({
                    'timestamp': int(float(pair[0])),
                    'value': parsed_value,
                })
            except (TypeError, ValueError):
                continue
        return points

    if group_by_label:
        grouped_series = {}
        for series in results:
            label_value = series.get('metric', {}).get(group_by_label, 'unknown')
            grouped_series[label_value] = _parse_points(series.get('values', []))
        return grouped_series, None

    points_by_timestamp = defaultdict(float)
    for series in results:
        for point in _parse_points(series.get('values', [])):
            points_by_timestamp[point['timestamp']] += point['value']

    points = [
        {'timestamp': timestamp, 'value': value}
        for timestamp, value in sorted(points_by_timestamp.items())
    ]
    return points, None


def _step_to_seconds(step: str) -> int:
    if not step:
        return 3600
    suffix = step[-1]
    try:
        amount = int(step[:-1])
    except ValueError:
        return 3600

    unit_map = {
        's': 1,
        'm': 60,
        'h': 3600,
        'd': 86400,
    }
    return max(amount * unit_map.get(suffix, 3600), 1)


def _build_zero_series(start: int, end: int, step: str) -> list:
    increment = _step_to_seconds(step)
    points = []
    current = start
    while current <= end:
        points.append({'timestamp': current, 'value': 0.0})
        current += increment
    return points


def _build_zero_provider_series(start: int, end: int, step: str) -> dict:
    return {
        provider: _build_zero_series(start=start, end=end, step=step)
        for provider in KNOWN_UPSTREAM_PROVIDERS
    }


def _build_provider_series_from_events(start: int, end: int, step: str) -> dict:
    increment = _step_to_seconds(step)
    if end < start:
        return {}

    bucket_count = ((end - start) // increment) + 1

    with _state_lock:
        provider_events_snapshot = {
            provider: list(events)
            for provider, events in _provider_events.items()
        }

    series = {}
    for provider, events in provider_events_snapshot.items():
        bucket_values = [0.0] * bucket_count
        for event_timestamp in events:
            if event_timestamp < start or event_timestamp > end:
                continue
            bucket_index = int((event_timestamp - start) // increment)
            if 0 <= bucket_index < bucket_count:
                bucket_values[bucket_index] += 1.0

        points = []
        for index in range(bucket_count):
            timestamp = start + (index * increment)
            points.append({'timestamp': timestamp, 'value': bucket_values[index]})
        series[provider] = points

    return series


def _provider_series_has_non_zero(series_dict: dict) -> bool:
    for points in series_dict.values():
        for point in points:
            if point.get('value', 0.0) > 0:
                return True
    return False


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


def _timeline_config(range_key: str) -> Optional[dict]:
    return {
        '1w': {
            'seconds': 7 * 24 * 60 * 60,
            'step': '1h',
            'lookback': '1h',
        },
        '1m': {
            'seconds': 30 * 24 * 60 * 60,
            'step': '1d',
            'lookback': '1d',
        },
    }.get(range_key)


def get_timeline_snapshot(range_key: str) -> dict:
    config = _timeline_config(range_key)
    if not config:
        raise ValueError('Invalid timeline range. Use 1w or 1m.')

    end = int(time.time())
    start = end - config['seconds']
    step = config['step']
    lookback = config['lookback']

    namespace = getattr(settings, 'PROMETHEUS_NAMESPACE', 'criticapp')
    pod_regex = getattr(settings, 'PROMETHEUS_POD_REGEX', 'criticapp-web.*')

    query_map = {
        'requests': f'(sum(increase(critic_http_requests_total[{lookback}])) or vector(0))',
        'pod_cpu_cores': (
            'sum(rate(container_cpu_usage_seconds_total{'
            f'namespace="{namespace}",pod=~"{pod_regex}",container!="POD",container!=""'
            '}[5m]))'
        ),
        'external_api_calls': f'sum by (provider) (increase(critic_upstream_api_calls_total[{lookback}]))',
        'latency_p50': (
            '(histogram_quantile(0.5, '
            f'sum(rate(critic_http_request_latency_seconds_bucket[{lookback}])) by (le)) or vector(0))'
        ),
        'latency_p95': (
            '(histogram_quantile(0.95, '
            f'sum(rate(critic_http_request_latency_seconds_bucket[{lookback}])) by (le)) or vector(0))'
        ),
        'latency_p99': (
            '(histogram_quantile(0.99, '
            f'sum(rate(critic_http_request_latency_seconds_bucket[{lookback}])) by (le)) or vector(0))'
        ),
        'latency_max_approx': (
            '(histogram_quantile(1.0, '
            f'sum(rate(critic_http_request_latency_seconds_bucket[{lookback}])) by (le)) or vector(0))'
        ),
    }

    errors = []
    series = {}
    for metric_key, query in query_map.items():
        grouped = metric_key == 'external_api_calls'
        values, error = _query_prometheus_range(
            query,
            start=start,
            end=end,
            step=step,
            group_by_label='provider' if grouped else None,
        )

        if grouped:
            fallback_series = _build_provider_series_from_events(start=start, end=end, step=step)
            fallback_has_non_zero = _provider_series_has_non_zero(fallback_series)
            prom_empty = not values
            prom_all_zero = not prom_empty and not _provider_series_has_non_zero(values)

            if (prom_empty or prom_all_zero) and fallback_has_non_zero:
                values = fallback_series
            elif prom_empty and not error:
                values = _build_zero_provider_series(start=start, end=end, step=step)

            for provider in KNOWN_UPSTREAM_PROVIDERS:
                values.setdefault(provider, _build_zero_series(start=start, end=end, step=step))
        elif not values and not error:
            values = _build_zero_series(start=start, end=end, step=step)

        series[metric_key] = values
        if error:
            errors.append(f'{metric_key}: {error}')

    return {
        'range': range_key,
        'step': step,
        'start': start,
        'end': end,
        'available': len(errors) == 0,
        'errors': errors,
        'series': series,
    }


def metrics_http_response() -> HttpResponse:
    payload = generate_latest(REGISTRY)
    return HttpResponse(payload, content_type=CONTENT_TYPE_LATEST)


def reset_dashboard_state_for_tests():
    with _state_lock:
        _window_all_requests.clear()
        _window_failed_requests.clear()
        _provider_counts.clear()
        _provider_events.clear()
        _status_counts.clear()
