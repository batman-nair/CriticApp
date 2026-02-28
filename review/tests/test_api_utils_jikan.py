from unittest import mock

from django.test import SimpleTestCase

from review.utils.api_utils import JikanItemAPI


class _ResponseStub:
    def __init__(self, status_code, json_data=None, headers=None, reason=''):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.headers = headers or {}
        self.reason = reason

    def json(self):
        return self._json_data


class JikanRetryTest(SimpleTestCase):
    def test_get_details_retries_on_429_then_succeeds(self):
        api = JikanItemAPI('anime')

        with mock.patch('review.utils.api_utils.time.sleep') as sleep_mock:
            with mock.patch('review.utils.api_utils.requests.get', side_effect=[
                _ResponseStub(429, headers={'Retry-After': '1'}, reason='Too Many Requests'),
                _ResponseStub(200, json_data={
                    'data': {
                        'mal_id': 32951,
                        'title': 'Kuroko no Basket Movie 4: Last Game',
                        'images': {'jpg': {'image_url': 'https://example.com/poster.jpg'}},
                        'aired': {'prop': {'from': {'year': 2017}, 'to': {'year': 2017}}},
                        'genres': [{'name': 'Sports'}],
                        'studios': [{'name': 'Production I.G'}],
                        'type': 'Movie',
                        'synopsis': 'desc',
                        'score': 8.1,
                    }
                }),
            ]):
                details = api.get_details('jikan_anime_32951')

        self.assertEqual(details['response'], 'True')
        self.assertEqual(details['item_id'], 'jikan_anime_32951')
        sleep_mock.assert_called_once_with(1)

    def test_get_details_exposes_status_on_non_200(self):
        api = JikanItemAPI('anime')

        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(503, reason='Service Unavailable')):
            details = api.get_details('jikan_anime_32951')

        self.assertEqual(details['response'], 'False')
        self.assertEqual(details['status_code'], 503)
        self.assertEqual(details['upstream_reason'], 'Service Unavailable')
