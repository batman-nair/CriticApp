from unittest import mock

from django.test import SimpleTestCase
import requests

from review.utils.api_utils import (
    MISSING_PREFIX_RESPONSE,
    MALItemAPI,
    OMDBItemAPI,
    normalize_imdb_title_url_to_item_id,
    request_json_with_retry,
)


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
        with mock.patch('review.utils.api_utils.time.sleep'):
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

    def test_extra_headers_are_merged_with_defaults(self):
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data={})) as get_mock:
            request_json_with_retry('https://example.com', headers={'X-Test': 'yes'})

        headers = get_mock.call_args.kwargs['headers']
        self.assertEqual(headers['X-Test'], 'yes')
        self.assertEqual(headers['User-Agent'], 'CriticApp/1.0')


def _mal_node(mal_id, mean=8.5, **extra):
    node = {
        'id': mal_id,
        'title': 'Title {}'.format(mal_id),
        'main_picture': {'medium': 'https://img/{}m.jpg'.format(mal_id), 'large': 'https://img/{}l.jpg'.format(mal_id)},
        'start_date': '2019-04-06',
        'end_date': '2019-09-28',
    }
    if mean is not None:
        node['mean'] = mean
    node.update(extra)
    return node


@mock.patch.dict('os.environ', {'MAL_CLIENT_ID': 'client-123'})
class MALItemAPITest(SimpleTestCase):
    def test_requires_client_id(self):
        with mock.patch.dict('os.environ', {'MAL_CLIENT_ID': ''}):
            with self.assertRaises(RuntimeError):
                MALItemAPI('anime')

    def test_rejects_unknown_type(self):
        with self.assertRaises(RuntimeError):
            MALItemAPI('movie')

    def test_search_sends_client_id_and_skips_unscored(self):
        nodes = [{'node': _mal_node(1, mean=None)}] + [{'node': _mal_node(i)} for i in range(2, 15)]
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data={'data': nodes})) as get_mock:
            result = MALItemAPI('anime').search('Kimetsu no Yaiba')

        url = get_mock.call_args.args[0]
        self.assertTrue(url.startswith('https://api.myanimelist.net/v2/anime?q=Kimetsu%20no%20Yaiba&'))
        self.assertEqual(get_mock.call_args.kwargs['headers']['X-MAL-CLIENT-ID'], 'client-123')
        self.assertEqual(result['response'], 'True')
        self.assertEqual(len(result['results']), 10)
        self.assertEqual(result['results'][0], {
            'item_id': 'jikan_anime_2',
            'title': 'Title 2',
            'image_url': 'https://img/2l.jpg',
            'year': '2019-2019',
        })

    def test_search_without_results_is_not_found(self):
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data={'data': []})):
            result = MALItemAPI('manga').search('zzzzzz')

        self.assertEqual(result['response'], 'False')
        self.assertEqual(result['error'], 'Manga not found!')

    def test_search_upstream_error_is_returned(self):
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(400, reason='Bad Request')):
            result = MALItemAPI('anime').search('ab')

        self.assertEqual(result['response'], 'False')
        self.assertEqual(result['status_code'], 400)
        self.assertEqual(result['query'], 'ab')
        self.assertEqual(result['source'], 'MAL API')

    def test_anime_details(self):
        node = _mal_node(
            38000,
            genres=[{'id': 1, 'name': 'Action'}],
            studios=[{'id': 569, 'name': 'ufotable'}],
            media_type='tv',
            synopsis='Demons.',
        )
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data=node)) as get_mock:
            result = MALItemAPI('anime').get_details('jikan_anime_38000')

        url = get_mock.call_args.args[0]
        self.assertTrue(url.startswith('https://api.myanimelist.net/v2/anime/38000?fields='))
        self.assertIn('studios', url)
        self.assertEqual(result, {
            'item_id': 'jikan_anime_38000',
            'title': 'Title 38000',
            'image_url': 'https://img/38000l.jpg',
            'year': '2019-2019',
            'attr1': 'Action',
            'attr2': 'ufotable',
            'attr3': 'tv',
            'description': 'Demons.',
            'rating': 8.5,
            'response': 'True',
        })

    def test_manga_details_use_author_names(self):
        node = _mal_node(
            2,
            end_date=None,
            authors=[
                {'node': {'id': 1868, 'first_name': 'Kentarou', 'last_name': 'Miura'}, 'role': 'Story & Art'},
                {'node': {'id': 49592, 'first_name': '', 'last_name': 'Studio Gaga'}, 'role': 'Art'},
            ],
            media_type='manga',
            synopsis='Guts.',
        )
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data=node)) as get_mock:
            result = MALItemAPI('manga').get_details('jikan_manga_2')

        self.assertIn('authors{first_name,last_name}', get_mock.call_args.args[0])
        self.assertEqual(result['item_id'], 'jikan_manga_2')
        self.assertEqual(result['year'], '2019')
        self.assertEqual(set(result['attr2'].split(', ')), {'Kentarou Miura', 'Studio Gaga'})
        self.assertEqual(result['attr3'], 'manga')

    def test_details_with_missing_optional_fields(self):
        node = {'id': 5, 'title': 'Bare'}
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data=node)):
            result = MALItemAPI('anime').get_details('jikan_anime_5')

        self.assertEqual(result['image_url'], 'N/A')
        self.assertEqual(result['year'], 'N/A')
        self.assertEqual(result['attr1'], '')
        self.assertEqual(result['attr2'], '')
        self.assertEqual(result['attr3'], 'N/A')
        self.assertEqual(result['description'], '')
        self.assertEqual(result['rating'], 'N/A')
        self.assertEqual(result['response'], 'True')

    def test_details_requires_prefix(self):
        with mock.patch('review.utils.api_utils.requests.get') as get_mock:
            result = MALItemAPI('anime').get_details('jikan_manga_2')

        self.assertEqual(result, MISSING_PREFIX_RESPONSE)
        get_mock.assert_not_called()


def _omdb_title(type_='movie', **extra):
    data = {
        'Response': 'True',
        'imdbID': 'tt0903747',
        'Title': 'Breaking Bad',
        'Poster': 'https://img/bb.jpg',
        'Year': '2008–2013',
        'Genre': 'Crime, Drama',
        'Director': 'N/A',
        'Writer': 'Vince Gilligan',
        'Actors': 'Bryan Cranston',
        'Type': type_,
        'Plot': 'A chemistry teacher turns to crime.',
        'imdbRating': '9.5',
    }
    data.update(extra)
    return data


@mock.patch.dict('os.environ', {'OMDB_API_KEY': 'key-123'})
class OMDBItemAPITest(SimpleTestCase):
    def test_rejects_unknown_type(self):
        with self.assertRaises(RuntimeError):
            OMDBItemAPI('episode')

    def test_search_filters_by_type(self):
        search_json = {'Response': 'True', 'Search': [_omdb_title('series')]}
        for type_ in ('movie', 'series'):
            with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data=search_json)) as get_mock:
                OMDBItemAPI(type_).search('breaking')
            self.assertIn('&type={}&'.format(type_), get_mock.call_args.args[0])

    def test_series_details_for_series(self):
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data=_omdb_title('series'))):
            result = OMDBItemAPI('series').get_details('omdb_tt0903747')

        self.assertEqual(result['response'], 'True')
        self.assertEqual(result['item_id'], 'omdb_tt0903747')
        self.assertEqual(result['attr3'], 'series')

    def test_movie_details_reject_series(self):
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data=_omdb_title('series'))):
            result = OMDBItemAPI('movie').get_details('omdb_tt0903747')

        self.assertEqual(result['response'], 'False')
        self.assertEqual(result['error'], 'This title is a series. Pick the Series category.')

    def test_series_details_reject_movie(self):
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data=_omdb_title('movie'))):
            result = OMDBItemAPI('series').get_details('omdb_tt0903747')

        self.assertEqual(result['response'], 'False')
        self.assertEqual(result['error'], 'This title is not a series. Pick the Movie category.')

    def test_movie_details_accept_other_types(self):
        with mock.patch('review.utils.api_utils.requests.get', return_value=_ResponseStub(200, json_data=_omdb_title('episode'))):
            result = OMDBItemAPI('movie').get_details('omdb_tt0903747')

        self.assertEqual(result['response'], 'True')
        self.assertEqual(result['attr3'], 'episode')


def test_normalize_imdb_title_url_to_item_id_accepts_title_url():
    assert normalize_imdb_title_url_to_item_id('https://www.imdb.com/title/tt0111161/') == 'omdb_tt0111161'


def test_normalize_imdb_title_url_to_item_id_accepts_mobile_url_and_query_string():
    assert normalize_imdb_title_url_to_item_id('https://m.imdb.com/title/tt3896198/?ref_=fn_al_tt_1') == 'omdb_tt3896198'


def test_normalize_imdb_title_url_to_item_id_rejects_non_title_urls():
    assert normalize_imdb_title_url_to_item_id('https://www.imdb.com/name/nm0000209/') is None
    assert normalize_imdb_title_url_to_item_id('tt0111161') is None
    assert normalize_imdb_title_url_to_item_id('The Shawshank Redemption') is None
