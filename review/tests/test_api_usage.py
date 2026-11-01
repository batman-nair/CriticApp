from datetime import date, datetime, timezone as dt_timezone
from unittest import mock

from django.db import DatabaseError
from django.test import TestCase, override_settings

from review.models import UpstreamApiUsage
from review.utils import api_usage

TODAY = date(2026, 3, 15)
NOW = datetime(2026, 3, 15, 12, 0, tzinfo=dt_timezone.utc)
TELEGRAM = {'ALERT_TELEGRAM_BOT_TOKEN': 'bot-token', 'ALERT_TELEGRAM_CHAT_ID': '42'}


@mock.patch('review.utils.api_usage.timezone.now', return_value=NOW)
class RecordUpstreamRequestTest(TestCase):
    def test_counts_requests_per_provider_per_day(self, _now):
        yesterday = UpstreamApiUsage.objects.create(provider='omdb', date=date(2026, 3, 14), requests=7)

        api_usage.record_upstream_request('OMDB API')
        api_usage.record_upstream_request('OMDB API')
        api_usage.record_upstream_request('RAWG API')

        omdb_today = UpstreamApiUsage.objects.get(provider='omdb', date=TODAY)
        self.assertEqual(omdb_today.requests, 2)
        self.assertEqual(UpstreamApiUsage.objects.get(provider='rawg', date=TODAY).requests, 1)
        yesterday.refresh_from_db()
        self.assertEqual(yesterday.requests, 7)

    def test_database_error_is_swallowed(self, _now):
        with mock.patch.object(UpstreamApiUsage.objects, 'get_or_create', side_effect=DatabaseError('down')):
            with self.assertLogs('review.utils.api_usage', level='WARNING'):
                api_usage.record_upstream_request('OMDB API')

    def test_db_access_not_allowed_error_is_swallowed(self, _now):
        # pytest-django raises RuntimeError in tests without database access.
        with mock.patch.object(UpstreamApiUsage.objects, 'get_or_create', side_effect=RuntimeError('no db')):
            with self.assertLogs('review.utils.api_usage', level='WARNING'):
                api_usage.record_upstream_request('OMDB API')


@override_settings(**TELEGRAM)
@mock.patch('review.utils.api_usage.timezone.now', return_value=NOW)
@mock.patch('review.utils.api_usage.requests.post')
class QuotaAlertTest(TestCase):
    def _sent_texts(self, post_mock):
        return [call.kwargs['json']['text'] for call in post_mock.call_args_list]

    def test_omdb_alerts_once_at_80_and_once_at_100_percent(self, post_mock, _now):
        UpstreamApiUsage.objects.create(provider='omdb', date=TODAY, requests=798)

        api_usage.record_upstream_request('OMDB API')  # 799
        api_usage.record_upstream_request('OMDB API')  # 800
        api_usage.record_upstream_request('OMDB API')  # 801
        self.assertEqual(self._sent_texts(post_mock), ['CriticApp: OMDb at 800/1000 requests today (80%)'])

        UpstreamApiUsage.objects.filter(provider='omdb', date=TODAY).update(requests=999)
        api_usage.record_upstream_request('OMDB API')  # 1000
        api_usage.record_upstream_request('OMDB API')  # 1001
        self.assertEqual(self._sent_texts(post_mock), [
            'CriticApp: OMDb at 800/1000 requests today (80%)',
            'CriticApp: OMDb at 1000/1000 requests today (100%)',
        ])
        post_mock.assert_called_with(
            'https://api.telegram.org/botbot-token/sendMessage',
            json={'chat_id': '42', 'text': 'CriticApp: OMDb at 1000/1000 requests today (100%)'},
            timeout=5,
        )

    def test_omdb_quota_is_daily(self, post_mock, _now):
        UpstreamApiUsage.objects.create(provider='omdb', date=date(2026, 3, 14), requests=799)

        api_usage.record_upstream_request('OMDB API')

        post_mock.assert_not_called()

    def test_rawg_quota_sums_the_current_month_only(self, post_mock, _now):
        UpstreamApiUsage.objects.create(provider='rawg', date=date(2026, 2, 28), requests=5000)
        UpstreamApiUsage.objects.create(provider='rawg', date=date(2026, 3, 1), requests=10000)
        UpstreamApiUsage.objects.create(provider='rawg', date=date(2026, 3, 14), requests=5998)

        api_usage.record_upstream_request('RAWG API')  # month total 15999
        post_mock.assert_not_called()
        api_usage.record_upstream_request('RAWG API')  # month total 16000

        self.assertEqual(self._sent_texts(post_mock), ['CriticApp: RAWG at 16000/20000 requests this month (80%)'])

    def test_providers_without_quota_never_alert(self, post_mock, _now):
        UpstreamApiUsage.objects.create(provider='mal', date=TODAY, requests=799)
        UpstreamApiUsage.objects.create(provider='openlibrary', date=TODAY, requests=999)

        api_usage.record_upstream_request('MAL API')
        api_usage.record_upstream_request('Open Library API')

        post_mock.assert_not_called()


@mock.patch('review.utils.api_usage.requests.post')
class SendAlertTest(TestCase):
    @override_settings(ALERT_TELEGRAM_BOT_TOKEN='', ALERT_TELEGRAM_CHAT_ID='42')
    def test_skips_without_token(self, post_mock):
        self.assertFalse(api_usage.send_alert('hello'))
        post_mock.assert_not_called()

    @override_settings(ALERT_TELEGRAM_BOT_TOKEN='bot-token', ALERT_TELEGRAM_CHAT_ID='')
    def test_skips_without_chat_id(self, post_mock):
        self.assertFalse(api_usage.send_alert('hello'))
        post_mock.assert_not_called()

    @override_settings(**TELEGRAM)
    def test_send_failure_is_swallowed_without_logging_the_token(self, post_mock):
        post_mock.side_effect = Exception('https://api.telegram.org/botbot-token/sendMessage failed')

        with self.assertLogs('review.utils.api_usage', level='WARNING') as logs:
            self.assertFalse(api_usage.send_alert('hello'))

        self.assertNotIn('bot-token', '\n'.join(logs.output))

    @override_settings(**TELEGRAM)
    def test_http_error_from_telegram_returns_false(self, post_mock):
        post_mock.return_value.raise_for_status.side_effect = Exception('401')

        with self.assertLogs('review.utils.api_usage', level='WARNING'):
            self.assertFalse(api_usage.send_alert('hello'))

    @override_settings(**TELEGRAM)
    def test_successful_send_returns_true(self, post_mock):
        self.assertTrue(api_usage.send_alert('hello'))
        post_mock.assert_called_once()


@mock.patch('review.utils.api_usage.timezone.now', return_value=NOW)
class UsageSummaryTest(TestCase):
    def test_reports_every_provider_with_zeros_when_empty(self, _now):
        summary = api_usage.usage_summary()

        self.assertEqual([p['provider'] for p in summary['providers']], ['omdb', 'rawg', 'mal', 'openlibrary'])
        for provider in summary['providers']:
            self.assertEqual(provider['today'], 0)
            self.assertEqual(provider['month'], 0)
        self.assertEqual(len(summary['daily']), 30)
        self.assertEqual(summary['daily'][0], {'date': TODAY, 'counts': [0, 0, 0, 0]})

    def test_today_month_and_percent_used(self, _now):
        UpstreamApiUsage.objects.create(provider='omdb', date=TODAY, requests=850)
        UpstreamApiUsage.objects.create(provider='omdb', date=date(2026, 3, 2), requests=300)
        UpstreamApiUsage.objects.create(provider='rawg', date=date(2026, 3, 10), requests=1000)
        UpstreamApiUsage.objects.create(provider='rawg', date=date(2026, 2, 27), requests=4000)
        UpstreamApiUsage.objects.create(provider='mal', date=TODAY, requests=3)

        providers = {p['provider']: p for p in api_usage.usage_summary()['providers']}

        self.assertEqual(providers['omdb']['today'], 850)
        self.assertEqual(providers['omdb']['month'], 1150)
        self.assertEqual(providers['omdb']['quota'], 1000)
        self.assertEqual(providers['omdb']['percent'], 85.0)
        self.assertEqual(providers['omdb']['level'], 'warning')
        self.assertEqual(providers['rawg']['month'], 1000)
        self.assertEqual(providers['rawg']['percent'], 5.0)
        self.assertEqual(providers['rawg']['level'], '')
        self.assertEqual(providers['mal']['today'], 3)
        self.assertIsNone(providers['mal']['quota'])
        self.assertIsNone(providers['mal']['percent'])

    def test_daily_rows_include_last_month_days_in_window(self, _now):
        UpstreamApiUsage.objects.create(provider='rawg', date=date(2026, 2, 27), requests=4000)

        daily = {row['date']: row['counts'] for row in api_usage.usage_summary()['daily']}

        self.assertEqual(daily[date(2026, 2, 27)], [0, 4000, 0, 0])

    def test_over_quota_is_danger(self, _now):
        UpstreamApiUsage.objects.create(provider='omdb', date=TODAY, requests=1000)

        providers = {p['provider']: p for p in api_usage.usage_summary()['providers']}

        self.assertEqual(providers['omdb']['level'], 'danger')
