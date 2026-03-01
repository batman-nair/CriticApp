from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings

from review.utils import metrics
from review.utils.api_utils import request_json_with_retry


class MonitoringMetricsTest(SimpleTestCase):
    def setUp(self):
        metrics.reset_dashboard_state_for_tests()

    def test_provider_counts_are_recorded_for_success(self):
        response = mock.Mock(status_code=200)
        response.json.return_value = {'result': 'ok'}

        with mock.patch('review.utils.api_utils.requests.get', return_value=response):
            data, error = request_json_with_retry('https://example.com', source_name='OMDB API')

        self.assertEqual(data, {'result': 'ok'})
        self.assertEqual(error, {})

        snapshot = metrics.get_dashboard_snapshot()
        self.assertEqual(snapshot['external_api_calls']['omdb']['success'], 1)

    def test_failure_rate_reflects_failed_requests(self):
        metrics.record_request('GET', '/fake-path', 200, 0.1)
        metrics.record_request('GET', '/fake-path', 500, 0.2)

        snapshot = metrics.get_dashboard_snapshot()

        self.assertEqual(snapshot['requests_in_window'], 2)
        self.assertEqual(snapshot['failed_requests_in_window'], 1)
        self.assertEqual(snapshot['failure_rate_in_window'], 0.5)

    def test_infrastructure_stats_handles_missing_prometheus_url(self):
        snapshot = metrics.get_dashboard_snapshot()

        self.assertFalse(snapshot['infrastructure']['available'])
        self.assertTrue(snapshot['infrastructure']['errors'])

    @override_settings(PROMETHEUS_BASE_URL='http://prometheus.local:9090')
    def test_infrastructure_stats_reads_pod_cpu_and_memory(self):
        cpu_response = mock.Mock()
        cpu_response.raise_for_status.return_value = None
        cpu_response.json.return_value = {
            'status': 'success',
            'data': {
                'result': [{'value': [1700000000, '0.1234']}],
            },
        }

        memory_response = mock.Mock()
        memory_response.raise_for_status.return_value = None
        memory_response.json.return_value = {
            'status': 'success',
            'data': {
                'result': [{'value': [1700000000, '268435456']}],
            },
        }

        with mock.patch('review.utils.metrics.requests.get', side_effect=[cpu_response, memory_response]):
            snapshot = metrics.get_dashboard_snapshot()

        self.assertTrue(snapshot['infrastructure']['available'])
        self.assertEqual(snapshot['infrastructure']['pod_cpu_cores'], 0.1234)
        self.assertEqual(snapshot['infrastructure']['pod_memory_bytes'], 268435456)
        self.assertEqual(snapshot['infrastructure']['pod_memory_mib'], 256.0)


class MonitoringEndpointsTest(TestCase):
    def setUp(self):
        metrics.reset_dashboard_state_for_tests()
        user_model = get_user_model()
        self.staff_user = user_model.objects.create_user(
            username='monitor_admin',
            password='test-pass-123',
            is_staff=True,
        )
        self.normal_user = user_model.objects.create_user(
            username='monitor_user',
            password='test-pass-123',
            is_staff=False,
        )

    def test_dashboard_requires_staff_user(self):
        anonymous_response = self.client.get('/monitoring/')
        self.assertEqual(anonymous_response.status_code, 302)

        self.client.login(username='monitor_user', password='test-pass-123')
        non_staff_response = self.client.get('/monitoring/')
        self.assertEqual(non_staff_response.status_code, 302)

        self.client.logout()
        self.client.login(username='monitor_admin', password='test-pass-123')
        staff_response = self.client.get('/monitoring/')
        self.assertEqual(staff_response.status_code, 200)

    def test_metrics_endpoint_default_open_for_scrape(self):
        response = self.client.get('/metrics/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/plain', response.headers['Content-Type'])

    @override_settings(METRICS_REQUIRE_AUTH=True)
    def test_metrics_endpoint_honors_auth_toggle(self):
        blocked_response = self.client.get('/metrics/')
        self.assertEqual(blocked_response.status_code, 403)

        self.client.login(username='monitor_user', password='test-pass-123')
        non_staff_response = self.client.get('/metrics/')
        self.assertEqual(non_staff_response.status_code, 403)

        self.client.logout()
        self.client.login(username='monitor_admin', password='test-pass-123')
        allowed_response = self.client.get('/metrics/')
        self.assertEqual(allowed_response.status_code, 200)

    def test_monitoring_health_requires_staff(self):
        response = self.client.get('/health/monitoring/')
        self.assertEqual(response.status_code, 302)

        self.client.login(username='monitor_admin', password='test-pass-123')
        allowed_response = self.client.get('/health/monitoring/')
        self.assertEqual(allowed_response.status_code, 200)
        payload = allowed_response.json()
        self.assertEqual(payload['response'], 'True')
        self.assertIn('healthy', payload)

    def test_monitoring_timeline_requires_staff(self):
        response = self.client.get('/monitoring/timeline/?range=1w')
        self.assertEqual(response.status_code, 302)

        self.client.login(username='monitor_user', password='test-pass-123')
        non_staff_response = self.client.get('/monitoring/timeline/?range=1w')
        self.assertEqual(non_staff_response.status_code, 302)

        self.client.logout()
        self.client.login(username='monitor_admin', password='test-pass-123')
        allowed_response = self.client.get('/monitoring/timeline/?range=1w')
        self.assertEqual(allowed_response.status_code, 200)
        payload = allowed_response.json()
        self.assertEqual(payload['response'], 'True')

    def test_monitoring_timeline_validates_range(self):
        self.client.login(username='monitor_admin', password='test-pass-123')

        response = self.client.get('/monitoring/timeline/?range=2w')
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload['response'], 'False')

    @override_settings(PROMETHEUS_BASE_URL='http://prometheus.local:9090')
    def test_monitoring_timeline_returns_series_payload(self):
        self.client.login(username='monitor_admin', password='test-pass-123')

        def build_response(v1: str, v2: str):
            mocked = mock.Mock()
            mocked.raise_for_status.return_value = None
            mocked.json.return_value = {
                'status': 'success',
                'data': {
                    'result': [
                        {
                            'values': [
                                [1700000000, v1],
                                [1700003600, v2],
                            ],
                        }
                    ],
                },
            }
            return mocked

        with mock.patch(
            'review.utils.metrics.requests.get',
            side_effect=[
                build_response('10', '12'),
                build_response('0.15', '0.2'),
                build_response('4', '5'),
                build_response('0.1', '0.11'),
                build_response('0.2', '0.21'),
                build_response('0.3', '0.31'),
                build_response('0.6', '0.7'),
            ],
        ):
            response = self.client.get('/monitoring/timeline/?range=1w')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['response'], 'True')
        self.assertEqual(payload['range'], '1w')
        self.assertEqual(payload['step'], '1h')
        self.assertIn('series', payload)
        self.assertIn('requests', payload['series'])
        self.assertIn('pod_cpu_cores', payload['series'])
        self.assertIn('external_api_calls', payload['series'])
        self.assertIn('latency_p50', payload['series'])
        self.assertIn('latency_p95', payload['series'])
        self.assertIn('latency_p99', payload['series'])
        self.assertIn('latency_max_approx', payload['series'])
        self.assertEqual(len(payload['series']['requests']), 2)
