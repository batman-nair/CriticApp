from unittest import mock

from django.test import SimpleTestCase
import requests

from review.utils.api_utils import request_json_with_retry


class _ResponseStub:
    def __init__(self, status_code, json_data=None, headers=None, reason=''):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.headers = headers or {}
        self.reason = reason

    def json(self):
        return self._json_data


class RequestJsonRetryTest(SimpleTestCase):
    def test_retries_then_succeeds(self):
        with mock.patch('review.utils.api_utils.time.sleep') as sleep_mock:
            with mock.patch('review.utils.api_utils.requests.get', side_effect=[
                _ResponseStub(429, headers={'Retry-After': '1'}, reason='Too Many Requests'),
                _ResponseStub(200, json_data={'ok': True}),
            ]):
                json_data, error = request_json_with_retry('https://example.com', source_name='Test API')

        self.assertEqual(json_data, {'ok': True})
        self.assertEqual(error, {})
        sleep_mock.assert_called_once_with(1)

    def test_returns_status_reason_on_final_failure(self):
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(503, reason='Service Unavailable')):
            json_data, error = request_json_with_retry('https://example.com', source_name='Test API')

        self.assertEqual(json_data, {})
        self.assertEqual(error['response'], 'False')
        self.assertEqual(error['status_code'], 503)
        self.assertEqual(error['upstream_reason'], 'Service Unavailable')
        self.assertEqual(error['source'], 'Test API')

    def test_request_exception_retries_then_errors(self):
        with mock.patch('review.utils.api_utils.time.sleep') as sleep_mock:
            with mock.patch('review.utils.api_utils.requests.get', side_effect=requests.ConnectionError('boom')):
                json_data, error = request_json_with_retry('https://example.com', source_name='Test API')

        self.assertEqual(json_data, {})
        self.assertEqual(error['response'], 'False')
        self.assertEqual(error['exception_type'], 'ConnectionError')
        self.assertEqual(error['source'], 'Test API')
        self.assertEqual(sleep_mock.call_count, 2)
