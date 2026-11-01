import logging
import math
from datetime import timedelta

import requests
from django.conf import settings
from django.db.models import F, Sum
from django.utils import timezone

from review.models import UpstreamApiUsage
from . import metrics

PROVIDERS = ('omdb', 'rawg', 'mal', 'openlibrary')
PROVIDER_LABELS = {
    'omdb': 'OMDb',
    'rawg': 'RAWG',
    'mal': 'MyAnimeList',
    'openlibrary': 'Open Library',
}
PERIOD_LABELS = {'day': 'today', 'month': 'this month'}
TELEGRAM_SEND_URL = 'https://api.telegram.org/bot{token}/sendMessage'
ALERT_TIMEOUT_SECONDS = 5

_logger = logging.getLogger(__name__)


def record_upstream_request(source_name: str):
    """Count one outbound HTTP attempt to an external API for today (UTC).

    Never raises: a failure to count must not break the lookup itself.
    """
    try:
        provider = metrics.normalize_provider(source_name)
        day = timezone.now().date()
        usage, created = UpstreamApiUsage.objects.get_or_create(
            provider=provider, date=day, defaults={'requests': 1},
        )
        if not created:
            UpstreamApiUsage.objects.filter(pk=usage.pk).update(requests=F('requests') + 1)
        _check_quota(provider, day)
    except Exception as exc:
        _logger.warning('Recording upstream API usage failed: %s', exc.__class__.__name__)


def _period_start(period: str, day):
    return day.replace(day=1) if period == 'month' else day


def _period_count(provider: str, period: str, day) -> int:
    total = UpstreamApiUsage.objects.filter(
        provider=provider, date__gte=_period_start(period, day), date__lte=day,
    ).aggregate(total=Sum('requests'))['total']
    return total or 0


def _check_quota(provider: str, day):
    quota = settings.UPSTREAM_API_QUOTAS.get(provider)
    if not quota:
        return
    period, limit = quota
    count = _period_count(provider, period, day)
    # The count rises by one per request, so each threshold is hit exactly once per period.
    for percent in settings.UPSTREAM_API_QUOTA_WARN_AT:
        if count == math.ceil(limit * percent / 100):
            send_alert('CriticApp: {} at {}/{} requests {} ({}%)'.format(
                PROVIDER_LABELS.get(provider, provider), count, limit, PERIOD_LABELS[period], percent,
            ))


def send_alert(text: str) -> bool:
    """Send a Telegram message. Returns False when not configured or on any failure."""
    token = settings.ALERT_TELEGRAM_BOT_TOKEN
    chat_id = settings.ALERT_TELEGRAM_CHAT_ID
    if not token or not chat_id:
        _logger.info('Alert not sent, Telegram is not configured: %s', text)
        return False
    try:
        response = requests.post(
            TELEGRAM_SEND_URL.format(token=token),
            json={'chat_id': chat_id, 'text': text},
            timeout=ALERT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except Exception as exc:
        # Only the class name: request exceptions include the URL, which contains the bot token.
        _logger.warning('Sending alert failed: %s', exc.__class__.__name__)
        return False
    return True


def _level(percent) -> str:
    if percent is None:
        return ''
    if percent >= 100:
        return 'danger'
    if percent >= min(settings.UPSTREAM_API_QUOTA_WARN_AT):
        return 'warning'
    return ''


def usage_summary(days: int = 30) -> dict:
    today = timezone.now().date()
    month_start = today.replace(day=1)
    since = min(today - timedelta(days=days - 1), month_start)
    counts = {
        (provider, date): count
        for provider, date, count in UpstreamApiUsage.objects.filter(
            date__gte=since, date__lte=today,
        ).values_list('provider', 'date', 'requests')
    }

    providers = []
    for provider in PROVIDERS:
        today_count = counts.get((provider, today), 0)
        month_count = sum(
            count for (row_provider, date), count in counts.items()
            if row_provider == provider and date >= month_start
        )
        entry = {
            'provider': provider,
            'label': PROVIDER_LABELS[provider],
            'today': today_count,
            'month': month_count,
            'quota': None,
            'period': '',
            'percent': None,
        }
        quota = settings.UPSTREAM_API_QUOTAS.get(provider)
        if quota:
            period, limit = quota
            used = today_count if period == 'day' else month_count
            entry.update(quota=limit, period=PERIOD_LABELS[period], percent=round(100 * used / limit, 1))
        entry['level'] = _level(entry['percent'])
        providers.append(entry)

    daily = [
        {'date': date, 'counts': [counts.get((provider, date), 0) for provider in PROVIDERS]}
        for date in (today - timedelta(days=offset) for offset in range(days))
    ]
    return {
        'today': today,
        'labels': [PROVIDER_LABELS[provider] for provider in PROVIDERS],
        'providers': providers,
        'daily': daily,
    }
