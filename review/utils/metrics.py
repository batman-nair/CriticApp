import time
import logging
from typing import Dict

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

_logger = logging.getLogger(__name__)


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


def record_request(method: str, path: str, status_code: int, latency_seconds: float):
    safe_method = (method or 'GET').upper()
    safe_path = normalize_path(path)
    safe_status_code = str(status_code)

    REQUEST_TOTAL.labels(method=safe_method, path=safe_path, status_code=safe_status_code).inc()
    REQUEST_LATENCY_SECONDS.labels(method=safe_method, path=safe_path).observe(max(latency_seconds, 0))
    if status_code >= 500:
        REQUEST_FAILURE_TOTAL.labels(method=safe_method, path=safe_path, status_code=safe_status_code).inc()


def record_upstream_api_call(source_name: str, outcome: str):
    provider = normalize_provider(source_name)
    safe_outcome = (outcome or 'unknown').lower().replace(' ', '_')
    UPSTREAM_API_CALLS_TOTAL.labels(provider=provider, outcome=safe_outcome).inc()


def metrics_http_response() -> HttpResponse:
    payload = generate_latest(REGISTRY)
    return HttpResponse(payload, content_type=CONTENT_TYPE_LATEST)
