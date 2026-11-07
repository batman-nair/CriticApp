import logging
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase
import requests

from review.providers import (
    CATEGORIES,
    InvalidItemId,
    ItemDetails,
    ItemNotFound,
    ItemSummary,
    LEGACY_PREFIXES,
    ProviderError,
    UpstreamError,
    WrongCategory,
    get_provider,
    provider_for_item_id,
)
from review.providers.base import _PARSE_ERRORS, request_json_with_retry
from review.providers.igdb import IGDBProvider
from review.providers.mal import MALProvider
from review.providers.omdb import OMDbProvider, normalize_imdb_title_url_to_item_id
from review.providers.openlibrary import OpenLibraryProvider

RECORD_USAGE = 'review.providers.base.api_usage.record_upstream_request'
REQUESTS_GET = 'review.providers.base.requests.get'
REQUESTS_POST = 'review.providers.base.requests.post'
SLEEP = 'review.providers.base.time.sleep'
SPECIAL_QUERY = 'a & b #1 + c'
ENCODED_SPECIAL_QUERY = 'a%20%26%20b%20%231%20%2B%20c'


class _ResponseStub:
    def __init__(self, status_code, json_data=None, headers=None, reason='', invalid_json=False):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.headers = headers or {}
        self.reason = reason
        self._invalid_json = invalid_json

    def json(self):
        if self._invalid_json:
            raise ValueError('not json')
        return self._json_data


def _json_response(json_data, status_code=200, reason=''):
    """A response with exactly this body; _ResponseStub turns None or [] into {}."""
    response = _ResponseStub(status_code, reason=reason)
    response._json_data = json_data
    return response


# Removes a key from the payload builders below (_omdb_title, _mal_node, _igdb_game).
_DROP = object()


def _assert_bad_response(testcase, exception, message, source):
    testcase.assertIsInstance(exception, UpstreamError)
    testcase.assertEqual(exception.message, message)
    testcase.assertEqual(exception.source, source)
    testcase.assertIsInstance(exception.__cause__, _PARSE_ERRORS)


class RequestJsonRetryTest(SimpleTestCase):
    def setUp(self):
        patcher = mock.patch(RECORD_USAGE)
        self.record_usage = patcher.start()
        self.addCleanup(patcher.stop)

    def test_retries_then_succeeds(self):
        with mock.patch(SLEEP) as sleep_mock:
            with mock.patch(REQUESTS_GET, side_effect=[
                _ResponseStub(429, headers={'Retry-After': '1'}, reason='Too Many Requests'),
                _ResponseStub(200, json_data={'ok': True}),
            ]):
                json_data = request_json_with_retry('https://example.com', source_name='Test API')

        self.assertEqual(json_data, {'ok': True})
        sleep_mock.assert_called_once_with(1)
        self.assertEqual(self.record_usage.call_count, 2)

    def test_raises_with_status_reason_on_final_failure(self):
        with mock.patch(SLEEP):
            with mock.patch(REQUESTS_GET, return_value=_ResponseStub(503, reason='Service Unavailable')):
                with self.assertRaises(UpstreamError) as ctx:
                    request_json_with_retry('https://example.com', source_name='Test API')

        self.assertEqual(ctx.exception.message, 'Bad response from API.')
        self.assertEqual(str(ctx.exception), 'Bad response from API.')
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(ctx.exception.upstream_reason, 'Service Unavailable')
        self.assertEqual(ctx.exception.source, 'Test API')

    def test_request_exception_retries_then_raises(self):
        with mock.patch(SLEEP) as sleep_mock:
            with mock.patch(REQUESTS_GET, side_effect=requests.ConnectionError('boom')):
                with self.assertRaises(UpstreamError) as ctx:
                    request_json_with_retry('https://example.com', source_name='Test API')

        self.assertEqual(ctx.exception.message, 'Request failure to upstream API.')
        self.assertEqual(ctx.exception.exception_type, 'ConnectionError')
        self.assertEqual(ctx.exception.source, 'Test API')
        self.assertEqual(sleep_mock.call_count, 2)
        self.assertEqual(self.record_usage.call_count, 3)
        self.record_usage.assert_called_with('Test API')

    def test_invalid_json_raises(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, invalid_json=True)):
            with self.assertRaises(UpstreamError) as ctx:
                request_json_with_retry('https://example.com', source_name='Test API')

        self.assertEqual(ctx.exception.message, 'Invalid JSON from upstream API.')
        self.assertEqual(ctx.exception.source, 'Test API')

    def test_extra_headers_are_merged_with_defaults(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={})) as get_mock:
            request_json_with_retry('https://example.com', headers={'X-Test': 'yes'})

        headers = get_mock.call_args.kwargs['headers']
        self.assertEqual(headers['X-Test'], 'yes')
        self.assertEqual(headers['User-Agent'], 'CriticApp/1.0')

    def test_counts_one_request_on_immediate_success(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={})):
            request_json_with_retry('https://example.com', source_name='OMDB API')

        self.record_usage.assert_called_once_with('OMDB API')

    def test_counts_every_retry_attempt(self):
        with mock.patch(SLEEP):
            with mock.patch(REQUESTS_GET, side_effect=[
                _ResponseStub(503),
                _ResponseStub(503),
                _ResponseStub(200, json_data={'ok': True}),
            ]):
                json_data = request_json_with_retry('https://example.com', source_name='IGDB API')

        self.assertEqual(json_data, {'ok': True})
        self.assertEqual(self.record_usage.call_count, 3)

    def test_get_does_not_post(self):
        with mock.patch(REQUESTS_POST) as post_mock:
            with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'ok': True})) as get_mock:
                json_data = request_json_with_retry('https://example.com', source_name='Test API')

        self.assertEqual(json_data, {'ok': True})
        get_mock.assert_called_once()
        self.assertEqual(get_mock.call_args.args, ('https://example.com',))
        self.assertEqual(set(get_mock.call_args.kwargs), {'timeout', 'headers'})
        post_mock.assert_not_called()

    def test_post_sends_data_and_headers(self):
        with mock.patch(REQUESTS_GET) as get_mock:
            with mock.patch(REQUESTS_POST, return_value=_ResponseStub(200, json_data=[{'id': 1}])) as post_mock:
                json_data = request_json_with_retry(
                    'https://example.com/v4/games', source_name='Test API', method='POST',
                    data='fields name; limit 10;', headers={'Client-ID': 'abc'})

        self.assertEqual(json_data, [{'id': 1}])
        get_mock.assert_not_called()
        post_mock.assert_called_once()
        self.assertEqual(post_mock.call_args.args, ('https://example.com/v4/games',))
        self.assertEqual(post_mock.call_args.kwargs['data'], 'fields name; limit 10;')
        self.assertEqual(post_mock.call_args.kwargs['timeout'], 10)
        headers = post_mock.call_args.kwargs['headers']
        self.assertEqual(headers['Client-ID'], 'abc')
        self.assertEqual(headers['User-Agent'], 'CriticApp/1.0')
        self.record_usage.assert_called_once_with('Test API')

    def test_post_sends_form_data(self):
        form = {'client_id': 'id', 'grant_type': 'client_credentials'}
        with mock.patch(REQUESTS_POST, return_value=_ResponseStub(200, json_data={'ok': True})) as post_mock:
            request_json_with_retry('https://example.com/token', method='POST', data=form)

        self.assertEqual(post_mock.call_args.kwargs['data'], form)

    def test_post_retries_then_succeeds(self):
        with mock.patch(SLEEP) as sleep_mock:
            with mock.patch(REQUESTS_POST, side_effect=[
                _ResponseStub(429, reason='Too Many Requests'),
                _ResponseStub(200, json_data={'ok': True}),
            ]) as post_mock:
                json_data = request_json_with_retry(
                    'https://example.com', source_name='Test API', method='POST', data='body')

        self.assertEqual(json_data, {'ok': True})
        sleep_mock.assert_called_once_with(2)
        self.assertEqual(post_mock.call_count, 2)
        for call in post_mock.call_args_list:
            self.assertEqual(call.kwargs['data'], 'body')
        self.assertEqual(self.record_usage.call_count, 2)

    def test_post_final_failure_raises(self):
        with mock.patch(REQUESTS_POST, return_value=_ResponseStub(401, reason='Unauthorized')) as post_mock:
            with self.assertRaises(UpstreamError) as ctx:
                request_json_with_retry('https://example.com', source_name='Test API', method='POST', data='body')

        # 401 isn't retried.
        post_mock.assert_called_once()
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.source, 'Test API')

    def test_every_provider_error_is_a_provider_error(self):
        for error_class in (InvalidItemId, ItemNotFound, WrongCategory, UpstreamError):
            self.assertTrue(issubclass(error_class, ProviderError))
        # The test network guard raises a RuntimeError, which must not be caught as a provider error.
        self.assertFalse(issubclass(ProviderError, RuntimeError))


class ItemSummaryTest(SimpleTestCase):
    def test_genres_and_rating_default_to_unknown(self):
        summary = ItemSummary(item_id='x_1', category='game', title='Title')
        self.assertIsNone(summary.genres)
        self.assertIsNone(summary.provider_rating)

    def test_search_result_keeps_the_v2_keys_only(self):
        summary = ItemSummary(item_id='x_1', category='game', title='Title', year='2015',
                              genres=['Action'], provider_rating=8.7)
        self.assertEqual(summary.to_search_result(), {
            'item_id': 'x_1',
            'title': 'Title',
            'image_url': 'N/A',
            'year': '2015',
        })

    def test_details_from_summary(self):
        summary = ItemSummary(item_id='x_1', category='game', title='Title', image_url='https://img/1.jpg',
                              year='2015', genres=['Action'], provider_rating=8.7)
        details = ItemDetails.from_summary(summary, provider_rating=9.0, platforms=['PC'])
        self.assertEqual(details.item_id, 'x_1')
        self.assertEqual(details.image_url, 'https://img/1.jpg')
        self.assertEqual(details.year, '2015')
        self.assertEqual(details.genres, ['Action'])
        self.assertEqual(details.provider_rating, 9.0)
        self.assertEqual(details.platforms, ['PC'])

    def test_details_from_summary_with_unknown_genres(self):
        summary = ItemSummary(item_id='x_1', category='game', title='Title')
        details = ItemDetails.from_summary(summary)
        self.assertEqual(details.genres, [])
        self.assertIsNone(details.provider_rating)
        self.assertEqual(details.to_review_item_fields()['attr1'], '')


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
    return {key: value for key, value in node.items() if value is not _DROP}


@mock.patch(RECORD_USAGE, new=mock.Mock())
@mock.patch.dict('os.environ', {'MAL_CLIENT_ID': 'client-123'})
class MALProviderTest(SimpleTestCase):
    def test_requires_client_id(self):
        with mock.patch.dict('os.environ', {'MAL_CLIENT_ID': ''}):
            with self.assertRaises(RuntimeError):
                MALProvider('anime')

    def test_rejects_unknown_type(self):
        with self.assertRaises(RuntimeError):
            MALProvider('movie')

    def test_search_sends_client_id_and_skips_unscored(self):
        nodes = [{'node': _mal_node(1, mean=None)}] + [{'node': _mal_node(i)} for i in range(2, 15)]
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'data': nodes})) as get_mock:
            results = MALProvider('anime').search('Kimetsu no Yaiba')

        url = get_mock.call_args.args[0]
        self.assertTrue(url.startswith('https://api.myanimelist.net/v2/anime?q=Kimetsu%20no%20Yaiba&'))
        self.assertEqual(get_mock.call_args.kwargs['headers']['X-MAL-CLIENT-ID'], 'client-123')
        self.assertEqual(len(results), 10)
        self.assertEqual(results[0].category, 'anime')
        self.assertEqual(results[0].to_search_result(), {
            'item_id': 'mal_anime_2',
            'title': 'Title 2',
            'image_url': 'https://img/2l.jpg',
            'year': '2019-2019',
        })

    def test_search_gives_genres_and_rating_from_the_same_request(self):
        nodes = [
            {'node': _mal_node(1, mean=9.3, genres=[{'id': 2, 'name': 'Adventure'}, {'id': 8, 'name': 'Drama'}])},
            {'node': _mal_node(2, mean=7)},
        ]
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'data': nodes})) as get_mock:
            results = MALProvider('anime').search('frieren')

        self.assertEqual(get_mock.call_count, 1)
        self.assertIn('&fields=id,title,main_picture,start_date,end_date,mean,genres', get_mock.call_args.args[0])
        self.assertEqual(results[0].genres, ['Adventure', 'Drama'])
        self.assertEqual(results[0].provider_rating, 9.3)
        # MAL leaves out an empty genre list.
        self.assertEqual(results[1].genres, [])
        self.assertEqual(results[1].provider_rating, 7)

    def test_search_without_results_is_not_found(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'data': []})):
            with self.assertRaises(ItemNotFound) as ctx:
                MALProvider('manga').search('zzzzzz')

        self.assertEqual(ctx.exception.message, 'Manga not found!')

    def test_search_upstream_error_is_raised(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(400, reason='Bad Request')):
            with self.assertRaises(UpstreamError) as ctx:
                MALProvider('anime').search('ab')

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.source, 'MAL API')

    def test_anime_details(self):
        node = _mal_node(
            38000,
            genres=[{'id': 1, 'name': 'Action'}],
            studios=[{'id': 569, 'name': 'ufotable'}],
            media_type='tv',
            synopsis='Demons.',
        )
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=node)) as get_mock:
            details = MALProvider('anime').get_details('mal_anime_38000')

        url = get_mock.call_args.args[0]
        self.assertTrue(url.startswith('https://api.myanimelist.net/v2/anime/38000?fields='))
        self.assertIn('studios', url)
        self.assertIsInstance(details, ItemDetails)
        self.assertEqual(details.genres, ['Action'])
        self.assertEqual(details.creators, ['ufotable'])
        self.assertEqual(details.media_type, 'tv')
        self.assertEqual(details.provider_rating, 8.5)
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'mal_anime_38000',
            'category': 'anime',
            'title': 'Title 38000',
            'image_url': 'https://img/38000l.jpg',
            'year': '2019-2019',
            'attr1': 'Action',
            'attr2': 'ufotable',
            'attr3': 'tv',
            'description': 'Demons.',
            'rating': '8.5',
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
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=node)) as get_mock:
            details = MALProvider('manga').get_details('mal_manga_2')

        self.assertIn('authors{first_name,last_name}', get_mock.call_args.args[0])
        fields = details.to_review_item_fields()
        self.assertEqual(fields['item_id'], 'mal_manga_2')
        self.assertEqual(fields['category'], 'manga')
        self.assertEqual(fields['year'], '2019')
        self.assertEqual(fields['attr2'], 'Kentarou Miura, Studio Gaga')
        self.assertEqual(fields['attr3'], 'manga')

    def test_details_with_missing_optional_fields(self):
        node = {'id': 5, 'title': 'Bare'}
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=node)):
            details = MALProvider('anime').get_details('mal_anime_5')

        self.assertIsNone(details.image_url)
        self.assertIsNone(details.year)
        self.assertIsNone(details.provider_rating)
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'mal_anime_5',
            'category': 'anime',
            'title': 'Bare',
            'image_url': 'N/A',
            'year': 'N/A',
            'attr1': '',
            'attr2': '',
            'attr3': 'N/A',
            'description': '',
            'rating': 'N/A',
        })

    def test_details_for_unknown_id_is_not_found(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(404, reason='Not Found')):
            with self.assertRaises(ItemNotFound) as ctx:
                MALProvider('anime').get_details('mal_anime_999999999')

        self.assertEqual(ctx.exception.message, 'Bad response from API.')
        # The refresh command logs the status from the original error.
        self.assertEqual(ctx.exception.__cause__.status_code, 404)

    def test_details_requires_prefix(self):
        with mock.patch(REQUESTS_GET) as get_mock:
            with self.assertRaises(InvalidItemId) as ctx:
                MALProvider('anime').get_details('mal_manga_2')

        self.assertEqual(ctx.exception.message, 'Missing prefix in item id.')
        get_mock.assert_not_called()

    def test_details_rejects_invalid_ids(self):
        for item_id in ['mal_anime_abc', 'mal_anime_052991', 'mal_anime_', 'mal_anime_1/2', 'mal_anime_1?x=2']:
            with self.subTest(item_id=item_id):
                with mock.patch(REQUESTS_GET) as get_mock:
                    with self.assertRaises(InvalidItemId) as ctx:
                        MALProvider('anime').get_details(item_id)

                self.assertEqual(ctx.exception.message, 'Invalid anime id.')
                get_mock.assert_not_called()

    def test_optional_fields_null_or_missing(self):
        optional = ['main_picture', 'start_date', 'end_date', 'mean', 'genres', 'studios', 'authors', 'media_type', 'synopsis']
        for missing in (_DROP, None):
            for category in ('anime', 'manga'):
                with self.subTest(missing='absent' if missing is _DROP else 'null', category=category):
                    node = _mal_node(5, **{key: missing for key in optional})
                    with mock.patch(REQUESTS_GET, return_value=_json_response(node)):
                        details = MALProvider(category).get_details('mal_{}_5'.format(category))

                    self.assertEqual(details.to_review_item_fields(), {
                        'item_id': 'mal_{}_5'.format(category),
                        'category': category,
                        'title': 'Title 5',
                        'image_url': 'N/A',
                        'year': 'N/A',
                        'attr1': '',
                        'attr2': '',
                        'attr3': 'N/A',
                        'description': '',
                        'rating': 'N/A',
                    })

    def test_entries_without_a_name_are_dropped(self):
        genres = [{'id': 1}, {'id': 2, 'name': None}, {'id': 3, 'name': 'Action'}]
        anime = _mal_node(5, genres=genres, studios=[{'id': 1}, {'id': 2, 'name': None}, {'id': 3, 'name': 'MAPPA'}])
        manga = _mal_node(5, genres=genres, authors=[
            {'node': {'id': 1}},
            {'node': {'id': 2, 'first_name': None, 'last_name': None}},
            {'node': {'id': 3, 'first_name': None, 'last_name': 'Miura'}},
        ])
        for category, node, creators in (('anime', anime, ['MAPPA']), ('manga', manga, ['Miura'])):
            with self.subTest(category=category):
                with mock.patch(REQUESTS_GET, return_value=_json_response(node)):
                    details = MALProvider(category).get_details('mal_{}_5'.format(category))

                self.assertEqual(details.genres, ['Action'])
                self.assertEqual(details.creators, creators)

    def test_malformed_payloads_are_upstream_errors(self):
        # Node values that are wrong in a search result and in the details alike.
        node_cases = [
            ('id missing', {'id': _DROP}),
            ('id null', {'id': None}),
            ('id text', {'id': '5'}),
            ('id bool', {'id': True}),
            ('title missing', {'title': _DROP}),
            ('title null', {'title': None}),
            ('title empty', {'title': ''}),
            ('title not text', {'title': 5}),
            ('main_picture not an object', {'main_picture': 'https://img/5l.jpg'}),
            ('picture url not text', {'main_picture': {'large': 5}}),
            ('start_date not text', {'start_date': 2019}),
            ('end_date not text', {'end_date': ['2019']}),
            ('genres not a list', {'genres': 'Action'}),
            ('genres not objects', {'genres': [1, 2]}),
            ('genre name not text', {'genres': [{'id': 1, 'name': 5}]}),
            ('mean text', {'mean': '8.5'}),
            ('mean bool', {'mean': True}),
            ('mean NaN', {'mean': float('nan')}),
            ('mean infinite', {'mean': float('inf')}),
        ]
        anime_cases = [
            ('studios not a list', {'studios': {'name': 'MAPPA'}}),
            ('studios not objects', {'studios': [1]}),
            ('studio name not text', {'studios': [{'id': 1, 'name': ['MAPPA']}]}),
            ('synopsis not text', {'synopsis': 5}),
            ('media_type not text', {'media_type': ['tv']}),
        ]
        manga_cases = [
            ('authors not a list', {'authors': 'Kentarou Miura'}),
            ('authors not objects', {'authors': [5]}),
            ('author without node', {'authors': [{'role': 'Art'}]}),
            ('author node not an object', {'authors': [{'node': 1868}]}),
            ('author name not text', {'authors': [{'node': {'id': 1868, 'first_name': 5}}]}),
        ]
        body_cases = [
            ('body is a list', [_mal_node(5)]),
            ('body is null', None),
        ]
        search_cases = body_cases + [
            ('data not a list', {'data': {'node': _mal_node(5)}}),
            ('entry not an object', {'data': ['Title 5']}),
            ('entry without node', {'data': [{}]}),
            ('node not an object', {'data': [{'node': 5}]}),
            ('one bad entry among good ones', {'data': [{'node': _mal_node(1)}, {'node': _mal_node(2, title=None)}]}),
        ] + [(name, {'data': [{'node': _mal_node(5, **extra)}]}) for name, extra in node_cases]
        cases = [('search', 'anime', name, payload) for name, payload in search_cases]
        cases += [('get_details', 'anime', name, payload) for name, payload in body_cases]
        cases += [('get_details', 'anime', name, _mal_node(5, **extra)) for name, extra in node_cases + anime_cases]
        cases += [('get_details', 'manga', name, _mal_node(5, **extra)) for name, extra in manga_cases]
        for method, category, name, payload in cases:
            with self.subTest(method=method, category=category, case=name):
                with mock.patch(REQUESTS_GET, return_value=_json_response(payload)):
                    with self.assertRaises(ProviderError) as ctx:
                        if method == 'search':
                            MALProvider(category).search('frieren')
                        else:
                            MALProvider(category).get_details('mal_{}_5'.format(category))

                _assert_bad_response(self, ctx.exception, 'Unexpected response from MAL.', 'MAL API')


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
        'Language': 'English, Spanish',
    }
    data.update(extra)
    return {key: value for key, value in data.items() if value is not _DROP}


@mock.patch(RECORD_USAGE, new=mock.Mock())
@mock.patch.dict('os.environ', {'OMDB_API_KEY': 'key-123'})
class OMDbProviderTest(SimpleTestCase):
    def test_rejects_unknown_type(self):
        with self.assertRaises(RuntimeError):
            OMDbProvider('episode')

    def test_requires_api_key(self):
        with mock.patch.dict('os.environ', {'OMDB_API_KEY': ''}):
            with self.assertRaises(RuntimeError):
                OMDbProvider('movie')

    def test_search_filters_by_type_over_https(self):
        search_json = {'Response': 'True', 'Search': [_omdb_title('series')]}
        for type_ in ('movie', 'series'):
            with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=search_json)) as get_mock:
                OMDbProvider(type_).search('breaking')
            url = get_mock.call_args.args[0]
            self.assertTrue(url.startswith('https://www.omdbapi.com/?apikey=key-123&'))
            self.assertIn('&type={}&'.format(type_), url)

    def test_search_encodes_the_query(self):
        search_json = {'Response': 'True', 'Search': [_omdb_title()]}
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=search_json)) as get_mock:
            OMDbProvider('movie').search(SPECIAL_QUERY)

        self.assertTrue(get_mock.call_args.args[0].endswith('&s=' + ENCODED_SPECIAL_QUERY))

    def test_search_results(self):
        search_json = {'Response': 'True', 'Search': [_omdb_title(Poster='N/A') for _ in range(12)]}
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=search_json)):
            results = OMDbProvider('series').search('breaking')

        self.assertEqual(len(results), 10)
        self.assertEqual(results[0].category, 'series')
        self.assertIsNone(results[0].image_url)
        self.assertEqual(results[0].to_search_result(), {
            'item_id': 'omdb_tt0903747',
            'title': 'Breaking Bad',
            'image_url': 'N/A',
            'year': '2008–2013',
        })

    def test_search_not_found(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'Response': 'False', 'Error': 'Movie not found!'})):
            with self.assertRaises(ItemNotFound) as ctx:
                OMDbProvider('movie').search('zzzzzz')

        self.assertEqual(ctx.exception.message, 'Movie not found!')

    def test_error_payloads_are_upstream_errors(self):
        for error in ('Request limit reached!', 'Too many results.', 'Invalid API key!'):
            with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'Response': 'False', 'Error': error})):
                with self.assertRaises(UpstreamError) as ctx:
                    OMDbProvider('movie').search('ab')

            self.assertEqual(ctx.exception.message, error)
            self.assertEqual(ctx.exception.source, 'OMDB API')

    def test_error_payload_without_message(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'Response': 'False'})):
            with self.assertRaises(UpstreamError) as ctx:
                OMDbProvider('movie').search('ab')

        self.assertEqual(ctx.exception.message, 'Bad response from API.')

    def test_details_incorrect_id_is_not_found(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'Response': 'False', 'Error': 'Incorrect IMDb ID.'})):
            with self.assertRaises(ItemNotFound) as ctx:
                OMDbProvider('movie').get_details('omdb_tt0')

        self.assertEqual(ctx.exception.message, 'Incorrect IMDb ID.')

    def test_series_details_for_series(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=_omdb_title('series'))) as get_mock:
            details = OMDbProvider('series').get_details('omdb_tt0903747')

        self.assertEqual(get_mock.call_args.args[0], 'https://www.omdbapi.com/?apikey=key-123&i=tt0903747')
        self.assertEqual(details.genres, ['Crime', 'Drama'])
        self.assertEqual(details.creators, ['Vince Gilligan', 'Bryan Cranston'])
        self.assertEqual(details.languages, ['English', 'Spanish'])
        self.assertEqual(details.provider_rating, 9.5)
        self.assertEqual(details.media_type, 'series')
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'omdb_tt0903747',
            'category': 'series',
            'title': 'Breaking Bad',
            'image_url': 'https://img/bb.jpg',
            'year': '2008–2013',
            'attr1': 'Crime, Drama',
            'attr2': 'Vince Gilligan, Bryan Cranston',
            'attr3': 'series',
            'language': 'English, Spanish',
            'description': 'A chemistry teacher turns to crime.',
            'rating': '9.5',
        })

    def test_details_dedupe_crew(self):
        title = _omdb_title(Director='Vince Gilligan', Writer='Vince Gilligan, Peter Gould', Actors='Bryan Cranston, N/A')
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=title)):
            details = OMDbProvider('movie').get_details('omdb_tt0903747')

        self.assertEqual(details.to_review_item_fields()['attr2'], 'Vince Gilligan, Peter Gould, Bryan Cranston')

    def test_details_with_missing_optional_fields(self):
        title = _omdb_title(
            Poster='N/A', Genre='N/A', Director='N/A', Writer='N/A', Actors='N/A',
            Plot='N/A', imdbRating='N/A', Language='N/A',
        )
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=title)):
            details = OMDbProvider('movie').get_details('omdb_tt0903747')

        self.assertIsNone(details.image_url)
        self.assertIsNone(details.description)
        self.assertIsNone(details.provider_rating)
        self.assertEqual(details.genres, [])
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'omdb_tt0903747',
            'category': 'movie',
            'title': 'Breaking Bad',
            'image_url': 'N/A',
            'year': '2008–2013',
            'attr1': 'N/A',
            'attr2': '',
            'attr3': 'movie',
            'language': '',
            'description': 'N/A',
            'rating': 'N/A',
        })

    def test_details_without_language(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=_omdb_title(Language='N/A'))):
            details = OMDbProvider('movie').get_details('omdb_tt0903747')

        self.assertEqual(details.to_review_item_fields()['language'], '')

    def test_movie_details_reject_series(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=_omdb_title('series'))):
            with self.assertRaises(WrongCategory) as ctx:
                OMDbProvider('movie').get_details('omdb_tt0903747')

        self.assertEqual(ctx.exception.message, 'This title is a series. Pick the Series category.')

    def test_series_details_reject_movie(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=_omdb_title('movie'))):
            with self.assertRaises(WrongCategory) as ctx:
                OMDbProvider('series').get_details('omdb_tt0903747')

        self.assertEqual(ctx.exception.message, 'This title is not a series. Pick the Movie category.')

    def test_movie_details_accept_other_types(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=_omdb_title('episode'))):
            details = OMDbProvider('movie').get_details('omdb_tt0903747')

        self.assertEqual(details.category, 'movie')
        self.assertEqual(details.to_review_item_fields()['attr3'], 'episode')

    def test_details_without_category_take_it_from_the_type(self):
        for type_, category in (('series', 'series'), ('movie', 'movie'), ('episode', 'movie')):
            with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=_omdb_title(type_))):
                details = OMDbProvider(None).get_details('omdb_tt0903747')

            self.assertEqual(details.category, category)

    def test_search_without_category_is_not_available(self):
        with mock.patch(REQUESTS_GET) as get_mock:
            with self.assertRaises(RuntimeError):
                OMDbProvider(None).search('breaking')

        get_mock.assert_not_called()

    def test_details_requires_prefix(self):
        with mock.patch(REQUESTS_GET) as get_mock:
            with self.assertRaises(InvalidItemId):
                OMDbProvider('movie').get_details('tt0903747')

        get_mock.assert_not_called()

    def test_details_rejects_invalid_ids(self):
        for item_id in ['omdb_TT0903747', 'omdb_tt', 'omdb_nm0000206', 'omdb_tt1&type=series', 'omdb_tt1 ']:
            with self.subTest(item_id=item_id):
                with mock.patch(REQUESTS_GET) as get_mock:
                    with self.assertRaises(InvalidItemId) as ctx:
                        OMDbProvider(None).get_details(item_id)

                self.assertEqual(ctx.exception.message, 'Invalid IMDb id.')
                get_mock.assert_not_called()

    def test_optional_keys_missing_or_null(self):
        optional = ['Poster', 'Year', 'Genre', 'Director', 'Writer', 'Actors', 'Plot', 'imdbRating', 'Language', 'Type']
        for missing in (_DROP, None):
            with self.subTest(missing='absent' if missing is _DROP else 'null'):
                title = _omdb_title(**{key: missing for key in optional})
                with mock.patch(REQUESTS_GET, return_value=_json_response(title)):
                    details = OMDbProvider('movie').get_details('omdb_tt0903747')
                with mock.patch(REQUESTS_GET, return_value=_json_response({'Response': 'True', 'Search': [title]})):
                    results = OMDbProvider('movie').search('breaking')

                self.assertEqual(details.to_review_item_fields(), {
                    'item_id': 'omdb_tt0903747',
                    'category': 'movie',
                    'title': 'Breaking Bad',
                    'image_url': 'N/A',
                    'year': 'N/A',
                    'attr1': 'N/A',
                    'attr2': '',
                    # No Type: the movie default.
                    'attr3': 'N/A',
                    'language': '',
                    'description': 'N/A',
                    'rating': 'N/A',
                })
                self.assertEqual(results[0].to_search_result(), {
                    'item_id': 'omdb_tt0903747', 'title': 'Breaking Bad', 'image_url': 'N/A', 'year': 'N/A',
                })

    def test_search_with_null_results_is_empty(self):
        with mock.patch(REQUESTS_GET, return_value=_json_response({'Response': 'True', 'Search': None})):
            self.assertEqual(OMDbProvider('movie').search('breaking'), [])

    def test_malformed_payloads_are_upstream_errors(self):
        # Field values that are wrong in a search result and in a title alike.
        field_cases = [
            ('imdbID missing', {'imdbID': _DROP}),
            ('imdbID null', {'imdbID': None}),
            ('imdbID empty', {'imdbID': ''}),
            ('imdbID not text', {'imdbID': 903747}),
            ('Title missing', {'Title': _DROP}),
            ('Title null', {'Title': None}),
            ('Title empty', {'Title': ''}),
            ('Title not text', {'Title': 5}),
            ('Poster not text', {'Poster': ['https://img/bb.jpg']}),
            ('Year not text', {'Year': 2008}),
        ]
        details_field_cases = [
            ('Genre not text', {'Genre': ['Crime']}),
            ('Director not text', {'Director': 5}),
            ('Actors not text', {'Actors': {'name': 'Bryan Cranston'}}),
            ('Plot not text', {'Plot': {'short': 'A teacher.'}}),
            ('Language not text', {'Language': ['English']}),
            ('Type not text', {'Type': 5}),
        ]
        body_cases = [
            ('body is a list', [_omdb_title()]),
            ('body is null', None),
            ('error message not text', {'Response': 'False', 'Error': 5}),
        ]
        search_cases = body_cases + [
            ('Search not a list', {'Response': 'True', 'Search': _omdb_title()}),
            ('entry not an object', {'Response': 'True', 'Search': ['tt0903747']}),
            ('one bad entry among good ones', {'Response': 'True', 'Search': [_omdb_title(), _omdb_title(Title=None)]}),
        ] + [(name, {'Response': 'True', 'Search': [_omdb_title(**extra)]}) for name, extra in field_cases]
        details_cases = body_cases + [
            (name, _omdb_title(**extra)) for name, extra in field_cases + details_field_cases
        ]
        # A series lookup checks Type first: a malformed one isn't "not a series".
        series_cases = [('Type not text', _omdb_title('series', Type=5)), ('Type a list', _omdb_title('series', Type=['series']))]
        cases = [('search', 'movie', name, payload) for name, payload in search_cases]
        cases += [('get_details', 'movie', name, payload) for name, payload in details_cases]
        cases += [('get_details', 'series', name, payload) for name, payload in series_cases]
        for method, category, name, payload in cases:
            with self.subTest(method=method, category=category, case=name):
                with mock.patch(REQUESTS_GET, return_value=_json_response(payload)):
                    with self.assertRaises(ProviderError) as ctx:
                        if method == 'search':
                            OMDbProvider(category).search('breaking')
                        else:
                            OMDbProvider(category).get_details('omdb_tt0903747')

                    _assert_bad_response(self, ctx.exception, 'Unexpected response from OMDb.', 'OMDB API')


IGDB_ENV = {'IGDB_CLIENT_ID': 'igdb-client-id', 'IGDB_CLIENT_SECRET': 'igdb-secret-s3cr3t'}
IGDB_TOKEN = 'igdb-token-t0k3n'
IGDB_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
IGDB_GAMES_URL = 'https://api.igdb.com/v4/games'
IGDB_SEARCH_FIELDS = 'fields name,first_release_date,cover.image_id,genres.name,total_rating,platforms.name;'


def _igdb_response(json_data, status_code=200, reason=''):
    return _json_response(json_data, status_code=status_code, reason=reason)


def _igdb_token(token=IGDB_TOKEN, expires_in=5184000):
    return _igdb_response({'access_token': token, 'expires_in': expires_in, 'token_type': 'bearer'})


def _igdb_game(game_id=1942, **extra):
    game = {
        'id': game_id,
        'name': 'The Witcher 3: Wild Hunt',
        # 2015-05-19 00:00 UTC
        'first_release_date': 1431993600,
        'cover': {'id': 89386, 'image_id': 'coaarl'},
        'genres': [{'id': 12, 'name': 'Role-playing (RPG)'}, {'id': 31, 'name': 'Adventure'}, {'id': 12, 'name': 'Role-playing (RPG)'}],
        'total_rating': 92.6789,
        'platforms': [{'id': 6, 'name': 'PC (Microsoft Windows)'}, {'id': 48, 'name': 'PlayStation 4'}],
        'summary': 'Geralt hunts monsters.',
        'involved_companies': [
            {'id': 1, 'company': {'id': 908, 'name': 'CD Projekt RED'}, 'developer': True},
            {'id': 2, 'company': {'id': 1, 'name': 'Warner Bros.'}, 'developer': False},
            {'id': 3, 'company': {'id': 909, 'name': 'Saber Interactive'}, 'developer': True},
            {'id': 4, 'company': {'id': 908, 'name': 'CD Projekt RED'}, 'developer': True},
        ],
    }
    game.update(extra)
    return {key: value for key, value in game.items() if value is not _DROP}


@mock.patch(RECORD_USAGE, new=mock.Mock())
@mock.patch.dict('os.environ', IGDB_ENV)
class IGDBProviderTest(SimpleTestCase):
    def setUp(self):
        patcher = mock.patch(REQUESTS_GET)
        get_mock = patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(get_mock.assert_not_called)

    def _with_cached_token(self):
        cache.set(IGDBProvider.TOKEN_CACHE_KEY, IGDB_TOKEN)

    def _assert_bad_response(self, exception):
        _assert_bad_response(self, exception, 'Unexpected response from IGDB.', 'IGDB API')

    def test_requires_client_id_and_secret(self):
        for key in IGDB_ENV:
            with self.subTest(key=key):
                with mock.patch.dict('os.environ', {key: ''}):
                    with self.assertRaises(RuntimeError):
                        IGDBProvider()
                env = {name: value for name, value in IGDB_ENV.items() if name != key}
                with mock.patch.dict('os.environ', env, clear=True):
                    with self.assertRaises(RuntimeError):
                        IGDBProvider()

    def test_token_is_fetched_once_and_cached(self):
        responses = [_igdb_token(), _igdb_response([_igdb_game()]), _igdb_response([_igdb_game()])]
        with mock.patch('review.providers.igdb.cache', wraps=cache) as cache_mock:
            with mock.patch(REQUESTS_POST, side_effect=responses) as post_mock:
                provider = IGDBProvider()
                provider.search('witcher')
                provider.search('witcher')

        self.assertEqual(post_mock.call_count, 3)
        token_call, *query_calls = post_mock.call_args_list
        self.assertEqual(token_call.args, (IGDB_TOKEN_URL,))
        self.assertEqual(token_call.kwargs['data'], {
            'client_id': 'igdb-client-id',
            'client_secret': 'igdb-secret-s3cr3t',
            'grant_type': 'client_credentials',
        })
        for query_call in query_calls:
            self.assertEqual(query_call.args, (IGDB_GAMES_URL,))
            self.assertEqual(query_call.kwargs['headers']['Client-ID'], 'igdb-client-id')
            self.assertEqual(query_call.kwargs['headers']['Authorization'], 'Bearer ' + IGDB_TOKEN)
        # Cached for an hour less than the token lives.
        cache_mock.set.assert_called_once_with('igdb:access_token', IGDB_TOKEN, timeout=5184000 - 3600)
        self.assertEqual(cache.get('igdb:access_token'), IGDB_TOKEN)

    def test_short_lived_token_is_cached_for_a_minute(self):
        with mock.patch('review.providers.igdb.cache', wraps=cache) as cache_mock:
            with mock.patch(REQUESTS_POST, side_effect=[_igdb_token(expires_in=100), _igdb_response([_igdb_game()])]):
                IGDBProvider().search('witcher')

        cache_mock.set.assert_called_once_with('igdb:access_token', IGDB_TOKEN, timeout=60)

    def test_token_request_counts_as_igdb_usage(self):
        with mock.patch(RECORD_USAGE) as record_usage:
            with mock.patch(REQUESTS_POST, side_effect=[_igdb_token(), _igdb_response([_igdb_game()])]):
                IGDBProvider().search('witcher')

        self.assertEqual(record_usage.call_args_list, [mock.call('IGDB API'), mock.call('IGDB API')])

    def test_401_refetches_the_token_and_retries_once(self):
        cache.set('igdb:access_token', 'old-token')
        responses = [
            _igdb_response({}, status_code=401, reason='Unauthorized'),
            _igdb_token('new-token'),
            _igdb_response([_igdb_game()]),
        ]
        with mock.patch(REQUESTS_POST, side_effect=responses) as post_mock:
            results = IGDBProvider().search('witcher')

        self.assertEqual([result.item_id for result in results], ['igdb_1942'])
        urls = [call.args[0] for call in post_mock.call_args_list]
        self.assertEqual(urls, [IGDB_GAMES_URL, IGDB_TOKEN_URL, IGDB_GAMES_URL])
        self.assertEqual(post_mock.call_args_list[0].kwargs['headers']['Authorization'], 'Bearer old-token')
        self.assertEqual(post_mock.call_args_list[2].kwargs['headers']['Authorization'], 'Bearer new-token')
        self.assertEqual(cache.get('igdb:access_token'), 'new-token')

    def test_401_on_a_fresh_token_is_not_retried(self):
        responses = [
            _igdb_token('new-token'),
            _igdb_response({}, status_code=401, reason='Unauthorized'),
        ]
        with mock.patch(REQUESTS_POST, side_effect=responses) as post_mock:
            with self.assertRaises(UpstreamError) as ctx:
                IGDBProvider().search('witcher')

        self.assertEqual(post_mock.call_count, 2)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_401_on_a_cached_token_refetches_it(self):
        self._with_cached_token()
        responses = [
            _igdb_response({}, status_code=401, reason='Unauthorized'),
            _igdb_token('new-token'),
            _igdb_response([_igdb_game()]),
        ]
        with mock.patch(REQUESTS_POST, side_effect=responses) as post_mock:
            IGDBProvider().get_details('igdb_1942')

        self.assertEqual(post_mock.call_count, 3)
        self.assertEqual(cache.get('igdb:access_token'), 'new-token')

    def test_second_401_is_upstream_error(self):
        cache.set('igdb:access_token', 'old-token')
        responses = [
            _igdb_response({}, status_code=401, reason='Unauthorized'),
            _igdb_token('new-token'),
            _igdb_response({}, status_code=401, reason='Unauthorized'),
        ]
        with mock.patch(REQUESTS_POST, side_effect=responses) as post_mock:
            with self.assertRaises(UpstreamError) as ctx:
                IGDBProvider().search('witcher')

        self.assertEqual(post_mock.call_count, 3)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.source, 'IGDB API')

    def test_other_query_errors_do_not_refetch_the_token(self):
        with mock.patch(REQUESTS_POST, side_effect=[_igdb_token(), _igdb_response({}, status_code=400, reason='Bad Request')]) as post_mock:
            with self.assertRaises(UpstreamError) as ctx:
                IGDBProvider().search('witcher')

        self.assertEqual(post_mock.call_count, 2)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_bad_token_response_is_upstream_error(self):
        bad_tokens = [
            {},
            [],
            None,
            {'expires_in': 5184000},
            {'access_token': '', 'expires_in': 5184000},
            {'access_token': 123, 'expires_in': 5184000},
            {'access_token': IGDB_TOKEN},
            {'access_token': IGDB_TOKEN, 'expires_in': '5184000'},
            {'access_token': IGDB_TOKEN, 'expires_in': 5184000.0},
            {'access_token': IGDB_TOKEN, 'expires_in': True},
        ]
        for token_json in bad_tokens:
            with self.subTest(token_json=token_json):
                with mock.patch(REQUESTS_POST, return_value=_igdb_response(token_json)) as post_mock:
                    with self.assertRaises(UpstreamError) as ctx:
                        IGDBProvider().search('witcher')

                self._assert_bad_response(ctx.exception)
                post_mock.assert_called_once()
                self.assertIsNone(cache.get('igdb:access_token'))

    def test_token_and_secret_are_never_logged(self):
        secret = IGDB_ENV['IGDB_CLIENT_SECRET']
        tokens = ['first-t0k3n', 'second-t0k3n']
        records = []
        handler = logging.Handler(level=logging.DEBUG)
        handler.emit = records.append
        root = logging.getLogger()
        old_level = root.level
        root.addHandler(handler)
        root.setLevel(logging.DEBUG)
        errors = []
        try:
            responses = [
                # Token fetch, then a query.
                _igdb_token(tokens[0]),
                _igdb_response([_igdb_game()]),
                # 401 on the cached token, refresh, 401 again.
                _igdb_response({}, status_code=401, reason='Unauthorized'),
                _igdb_token(tokens[1]),
                _igdb_response({}, status_code=401, reason='Unauthorized'),
                # The token request itself fails, then returns no expiry.
                _igdb_response({'message': 'invalid client secret'}, status_code=403, reason='Forbidden'),
                _igdb_response({'access_token': tokens[0]}),
            ]
            with mock.patch(REQUESTS_POST, side_effect=responses) as post_mock:
                provider = IGDBProvider()
                provider.search('witcher')
                for _ in range(3):
                    try:
                        provider.search('witcher')
                    except UpstreamError as ex:
                        errors.append(ex)
                    cache.clear()
        finally:
            root.removeHandler(handler)
            root.setLevel(old_level)

        self.assertEqual(post_mock.call_count, 7)
        self.assertEqual(len(errors), 3)
        formatter = logging.Formatter()
        texts = [formatter.format(record) for record in records]
        texts += [str(call.args) + str(call.kwargs.get('url')) for call in post_mock.call_args_list]
        for error in errors:
            chained = error
            while chained is not None:
                texts += [str(chained), repr(chained), repr(vars(chained))]
                chained = chained.__cause__ or chained.__context__
        for text in texts:
            for value in [secret] + tokens:
                self.assertNotIn(value, text)

    def test_search_body(self):
        self._with_cached_token()
        with mock.patch(REQUESTS_POST, return_value=_igdb_response([_igdb_game()])) as post_mock:
            IGDBProvider().search('witcher 3')

        self.assertEqual(
            post_mock.call_args.kwargs['data'],
            'search "witcher 3"; ' + IGDB_SEARCH_FIELDS
            + ' where version_parent = null & game_type = (0,4,8,9,10); limit 10;',
        )

    def test_search_escapes_quotes_and_backslashes(self):
        self._with_cached_token()
        with mock.patch(REQUESTS_POST, return_value=_igdb_response([_igdb_game()])) as post_mock:
            IGDBProvider().search('a "b" \\c')

        self.assertTrue(post_mock.call_args.kwargs['data'].startswith('search "a \\"b\\" \\\\c"; fields '))

    def test_search_all_types_drops_the_filter(self):
        self._with_cached_token()
        with mock.patch(REQUESTS_POST, return_value=_igdb_response([_igdb_game()])) as post_mock:
            IGDBProvider().search('blood and wine', all_types=True)

        self.assertEqual(post_mock.call_args.kwargs['data'], 'search "blood and wine"; ' + IGDB_SEARCH_FIELDS + ' limit 10;')

    def test_search_results(self):
        self._with_cached_token()
        games = [
            _igdb_game(),
            _igdb_game(1943, cover=_DROP, total_rating=_DROP, first_release_date=_DROP, genres=_DROP),
        ]
        with mock.patch(REQUESTS_POST, return_value=_igdb_response(games)):
            results = IGDBProvider().search('witcher')

        self.assertEqual(results, [
            ItemSummary(
                item_id='igdb_1942',
                category='game',
                title='The Witcher 3: Wild Hunt',
                image_url='https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg',
                year='2015',
                genres=['Role-playing (RPG)', 'Adventure'],
                provider_rating=9.3,
            ),
            ItemSummary(
                item_id='igdb_1943', category='game', title='The Witcher 3: Wild Hunt',
                image_url=None, year=None, genres=[], provider_rating=None,
            ),
        ])
        self.assertEqual([result.to_search_result() for result in results], [
            {
                'item_id': 'igdb_1942',
                'title': 'The Witcher 3: Wild Hunt',
                'image_url': 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg',
                'year': '2015',
            },
            {'item_id': 'igdb_1943', 'title': 'The Witcher 3: Wild Hunt', 'image_url': 'N/A', 'year': 'N/A'},
        ])

    def test_search_without_results_is_not_found(self):
        self._with_cached_token()
        with mock.patch(REQUESTS_POST, return_value=_igdb_response([])):
            with self.assertRaises(ItemNotFound) as ctx:
                IGDBProvider().search('zzzzzz')

        self.assertEqual(ctx.exception.message, 'Game not found!')

    def test_search_retries_429(self):
        self._with_cached_token()
        with mock.patch(SLEEP) as sleep_mock:
            with mock.patch(REQUESTS_POST, side_effect=[
                _igdb_response({}, status_code=429, reason='Too Many Requests'),
                _igdb_response([_igdb_game()]),
            ]) as post_mock:
                results = IGDBProvider().search('witcher')

        self.assertEqual(len(results), 1)
        self.assertEqual(post_mock.call_count, 2)
        sleep_mock.assert_called_once()

    def test_details(self):
        self._with_cached_token()
        with mock.patch(REQUESTS_POST, return_value=_igdb_response([_igdb_game()])) as post_mock:
            details = IGDBProvider().get_details('igdb_1942')

        self.assertEqual(post_mock.call_args.args, (IGDB_GAMES_URL,))
        self.assertEqual(
            post_mock.call_args.kwargs['data'],
            'fields name,first_release_date,cover.image_id,genres.name,total_rating,platforms.name,'
            'summary,involved_companies.company.name,involved_companies.developer; where id = 1942;',
        )
        self.assertEqual(details.genres, ['Role-playing (RPG)', 'Adventure'])
        # Developers only, without the publisher.
        self.assertEqual(details.creators, ['CD Projekt RED', 'Saber Interactive'])
        self.assertEqual(details.platforms, ['PC (Microsoft Windows)', 'PlayStation 4'])
        self.assertEqual(details.languages, [])
        self.assertEqual(details.provider_rating, 9.3)
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'igdb_1942',
            'category': 'game',
            'title': 'The Witcher 3: Wild Hunt',
            'image_url': 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg',
            'year': '2015',
            'attr1': 'Role-playing (RPG), Adventure',
            'attr2': 'CD Projekt RED, Saber Interactive',
            'attr3': 'PC (Microsoft Windows), PlayStation 4',
            'description': 'Geralt hunts monsters.',
            'rating': '9.3',
        })

    def test_details_with_missing_optional_fields(self):
        self._with_cached_token()
        game = {'id': 1942, 'name': 'The Witcher 3: Wild Hunt'}
        with mock.patch(REQUESTS_POST, return_value=_igdb_response([game])):
            details = IGDBProvider().get_details('igdb_1942')

        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'igdb_1942',
            'category': 'game',
            'title': 'The Witcher 3: Wild Hunt',
            'image_url': 'N/A',
            'year': 'N/A',
            'attr1': '',
            'attr2': '',
            'attr3': '',
            'description': '',
            'rating': 'N/A',
        })

    def test_long_title_and_platform_list_fit_the_columns(self):
        self._with_cached_token()
        platforms = [{'name': 'Platform number {}'.format(i)} for i in range(40)]
        with mock.patch(REQUESTS_POST, return_value=_igdb_response([_igdb_game(name='T' * 150, platforms=platforms)])):
            fields = IGDBProvider().get_details('igdb_1942').to_review_item_fields()

        self.assertEqual(fields['title'], 'T' * 100)
        self.assertLessEqual(len(fields['attr3']), 300)
        self.assertTrue(fields['attr3'].startswith('Platform number 0, Platform number 1, '))
        # Whole names only: 0-14 take 288 characters, 15 would make it 308.
        self.assertTrue(fields['attr3'].endswith('Platform number 14'))

    def test_details_rejects_invalid_ids(self):
        for item_id in ['igdb_', 'igdb_12a', 'igdb_-1', 'igdb_0', 'igdb_01942', 'igdb_1; fields *', 'igdb_²', 'rawg_1942', '1942']:
            with self.subTest(item_id=item_id):
                with mock.patch(REQUESTS_POST) as post_mock:
                    with self.assertRaises(InvalidItemId) as ctx:
                        IGDBProvider().get_details(item_id)

                post_mock.assert_not_called()
                if item_id.startswith('igdb_'):
                    self.assertEqual(ctx.exception.message, 'Invalid game id.')

    def test_details_for_unknown_id_is_not_found(self):
        self._with_cached_token()
        with mock.patch(REQUESTS_POST, return_value=_igdb_response([])):
            with self.assertRaises(ItemNotFound) as ctx:
                IGDBProvider().get_details('igdb_999999999')

        self.assertEqual(ctx.exception.message, 'Game not found!')

    def test_optional_fields_null_or_missing(self):
        company = {'id': 1, 'company': {'id': 908, 'name': 'CD Projekt RED'}, 'developer': True}
        cases = [
            ('cover', {'cover': None}, 'image_url', None),
            ('cover', {'cover': _DROP}, 'image_url', None),
            ('cover.image_id', {'cover': {'id': 1, 'image_id': None}}, 'image_url', None),
            ('cover.image_id', {'cover': {'id': 1}}, 'image_url', None),
            ('genres', {'genres': None}, 'genres', []),
            ('genres', {'genres': _DROP}, 'genres', []),
            ('genres.name', {'genres': [{'id': 1, 'name': None}, {'id': 2}]}, 'genres', []),
            ('total_rating', {'total_rating': None}, 'provider_rating', None),
            ('total_rating', {'total_rating': _DROP}, 'provider_rating', None),
            ('first_release_date', {'first_release_date': None}, 'year', None),
            ('first_release_date', {'first_release_date': _DROP}, 'year', None),
        ]
        details_cases = [
            ('platforms', {'platforms': None}, 'platforms', []),
            ('platforms', {'platforms': _DROP}, 'platforms', []),
            ('platforms.name', {'platforms': [{'id': 6, 'name': None}, {'id': 7}]}, 'platforms', []),
            ('involved_companies', {'involved_companies': None}, 'creators', []),
            ('involved_companies', {'involved_companies': _DROP}, 'creators', []),
            ('involved_companies.company', {'involved_companies': [{**company, 'company': None}, {'id': 2, 'developer': True}]}, 'creators', []),
            ('involved_companies.company.name', {'involved_companies': [{**company, 'company': {'id': 908, 'name': None}}, {**company, 'company': {'id': 908}}]}, 'creators', []),
            ('involved_companies.developer', {'involved_companies': [{**company, 'developer': None}, {'id': 2, 'company': {'id': 1, 'name': 'X'}}]}, 'creators', []),
            ('summary', {'summary': None}, 'description', None),
            ('summary', {'summary': _DROP}, 'description', None),
        ]
        self._with_cached_token()
        for method, item_cases in [('search', cases), ('get_details', cases + details_cases)]:
            for field_name, extra, attribute, expected in item_cases:
                with self.subTest(method=method, field=field_name, game=extra):
                    with mock.patch(REQUESTS_POST, return_value=_igdb_response([_igdb_game(**extra)])):
                        if method == 'search':
                            result = IGDBProvider().search('witcher')[0]
                        else:
                            result = IGDBProvider().get_details('igdb_1942')

                    self.assertEqual(getattr(result, attribute), expected)
                    self.assertEqual(result.title, 'The Witcher 3: Wild Hunt')

    def test_malformed_payloads_are_upstream_errors(self):
        cases = [
            ('body is an object', {}),
            ('body is null', None),
            ('entry is not an object', [1]),
            ('entry is a string', ['The Witcher 3']),
            ('name missing', [_igdb_game(name=_DROP)]),
            ('name null', [_igdb_game(name=None)]),
            ('name empty', [_igdb_game(name='')]),
            ('name not a string', [_igdb_game(name=3)]),
            ('id missing', [_igdb_game(id=_DROP)]),
            ('id null', [_igdb_game(id=None)]),
            ('id not a number', [_igdb_game(id='abc')]),
            ('rating text', [_igdb_game(total_rating='high')]),
            ('rating bool', [_igdb_game(total_rating=True)]),
            ('rating not finite', [_igdb_game(total_rating=float('nan'))]),
            ('release date text', [_igdb_game(first_release_date='2015')]),
            ('release date out of range', [_igdb_game(first_release_date=10 ** 20)]),
            ('genres not objects', [_igdb_game(genres=[1, 2])]),
            ('genres not a list', [_igdb_game(genres='RPG')]),
            ('genre name not text', [_igdb_game(genres=[{'id': 1, 'name': 5}])]),
            ('cover not an object', [_igdb_game(cover=89386)]),
            ('cover image id not text', [_igdb_game(cover={'id': 1, 'image_id': 5})]),
        ]
        search_cases = [
            # One bad entry fails the whole search.
            ('one bad entry among good ones', [_igdb_game(), _igdb_game(1943, name=None)]),
        ]
        details_cases = [
            ('platforms not objects', [_igdb_game(platforms=[6, 48])]),
            ('companies not objects', [_igdb_game(involved_companies=[1])]),
            ('company not an object', [_igdb_game(involved_companies=[{'id': 1, 'company': 908, 'developer': True}])]),
            ('company name not text', [_igdb_game(involved_companies=[{'id': 1, 'company': {'name': 5}, 'developer': True}])]),
            ('summary not text', [_igdb_game(summary=5)]),
        ]
        self._with_cached_token()
        for method, payload_cases in [('search', cases + search_cases), ('get_details', cases + details_cases)]:
            for name, payload in payload_cases:
                with self.subTest(method=method, case=name):
                    with mock.patch(REQUESTS_POST, return_value=_igdb_response(payload)):
                        with self.assertRaises(ProviderError) as ctx:
                            if method == 'search':
                                IGDBProvider().search('witcher')
                            else:
                                IGDBProvider().get_details('igdb_1942')

                    self._assert_bad_response(ctx.exception)


def ol_search_doc(work_id='OL27482W', **extra):
    doc = {
        'key': '/works/{}'.format(work_id),
        'title': 'The Hobbit',
        'author_name': ['J.R.R. Tolkien'],
        'first_publish_year': 1937,
        'cover_i': 14627509,
        'ratings_average': 4.2978306,
        'number_of_pages_median': 310,
    }
    doc.update(extra)
    return {key: value for key, value in doc.items() if value is not None}


def ol_work(**extra):
    work = {
        'key': '/works/OL27482W',
        'title': 'The Hobbit',
        'description': 'A tale of high adventure.',
        'subjects': ['Fantasy', 'Open Library Staff Picks', 'nyt:young-adult=2012', 'Dragons', 'Wizards', 'Dwarves', 'Elves', 'Trolls'],
    }
    work.update(extra)
    return {key: value for key, value in work.items() if value is not None}


_UNSET = object()


def ol_requests_get(search_docs=None, work=None, search_status=200, work_status=200, search_json=_UNSET, work_json=_UNSET):
    """Fake requests.get answering the Open Library search and work URLs.

    `search_json` and `work_json` are raw bodies, sent exactly as given, in
    place of the docs wrapper and the default work.
    """
    def fake_get(url, **kwargs):
        if '/search.json' in url:
            if search_json is not _UNSET:
                return _json_response(search_json, status_code=search_status)
            return _ResponseStub(search_status, json_data={'docs': search_docs if search_docs is not None else [ol_search_doc()]})
        if '/works/' in url and url.endswith('.json'):
            if work_json is not _UNSET:
                return _json_response(work_json, status_code=work_status)
            return _ResponseStub(work_status, json_data=work if work is not None else ol_work())
        raise AssertionError('Unexpected URL {}'.format(url))
    return fake_get


@mock.patch(RECORD_USAGE, new=mock.Mock())
class OpenLibraryProviderTest(SimpleTestCase):
    def test_search_maps_works(self):
        docs = [ol_search_doc(), ol_search_doc('OL219602W', title='The Hobbit (graphic novel)', cover_i=None, first_publish_year=None)]
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=docs)) as get_mock:
            results = OpenLibraryProvider().search('the hobbit & co')

        url = get_mock.call_args.args[0]
        self.assertTrue(url.startswith('https://openlibrary.org/search.json?q=the%20hobbit%20%26%20co&limit=10&'))
        self.assertEqual([result.to_search_result() for result in results], [
            {
                'item_id': 'olib_OL27482W',
                'title': 'The Hobbit',
                'image_url': 'https://covers.openlibrary.org/b/id/14627509-M.jpg',
                'year': '1937',
            },
            {
                'item_id': 'olib_OL219602W',
                'title': 'The Hobbit (graphic novel)',
                'image_url': 'N/A',
                'year': 'N/A',
            },
        ])

    def test_search_gives_rating_but_not_genres(self):
        docs = [ol_search_doc(), ol_search_doc('OL1W', ratings_average=None), ol_search_doc('OL2W', ratings_average=0)]
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=docs)) as get_mock:
            results = OpenLibraryProvider().search('hobbit')

        self.assertEqual(get_mock.call_count, 1)
        self.assertIn('&fields=key,title,author_name,first_publish_year,cover_i,ratings_average', get_mock.call_args.args[0])
        self.assertEqual([result.provider_rating for result in results], [8.6, None, None])
        # Genres would need a request per work, so they stay unknown.
        self.assertEqual([result.genres for result in results], [None, None, None])

    def test_requests_identify_the_app(self):
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get()) as get_mock:
            OpenLibraryProvider().search('hobbit')
            OpenLibraryProvider().get_details('olib_OL27482W')

        self.assertEqual(get_mock.call_count, 3)
        for call in get_mock.call_args_list:
            self.assertEqual(call.kwargs['headers']['User-Agent'], OpenLibraryProvider.USER_AGENT)
        self.assertIn('github.com/batman-nair/CriticApp', OpenLibraryProvider.USER_AGENT)

    def test_search_without_results(self):
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=[])):
            with self.assertRaises(ItemNotFound) as ctx:
                OpenLibraryProvider().search('zzzzzz')

        self.assertEqual(ctx.exception.message, 'Book not found!')

    def test_search_upstream_error(self):
        with mock.patch(SLEEP):
            with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_status=503)):
                with self.assertRaises(UpstreamError) as ctx:
                    OpenLibraryProvider().search('hobbit')

        self.assertEqual(ctx.exception.source, 'Open Library API')

    def test_details(self):
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get()) as get_mock:
            details = OpenLibraryProvider().get_details('olib_OL27482W')

        urls = [call.args[0] for call in get_mock.call_args_list]
        self.assertTrue(urls[0].startswith('https://openlibrary.org/search.json?q=key:/works/OL27482W&'))
        self.assertEqual(urls[1], 'https://openlibrary.org/works/OL27482W.json')
        self.assertEqual(details.pages, 310)
        self.assertEqual(details.provider_rating, 8.6)
        self.assertEqual(details.creators, ['J.R.R. Tolkien'])
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'olib_OL27482W',
            'category': 'book',
            'title': 'The Hobbit',
            'image_url': 'https://covers.openlibrary.org/b/id/14627509-L.jpg',
            'year': '1937',
            'attr1': 'Fantasy, Dragons, Wizards, Dwarves, Elves',
            'attr2': 'J.R.R. Tolkien',
            'attr3': '310 pages',
            'language': '',
            'description': 'A tale of high adventure.',
            'rating': '8.6',
        })

    def test_details_accept_typed_description(self):
        work = ol_work(description={'type': '/type/text', 'value': ' A tale of high adventure. '})
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(work=work)):
            details = OpenLibraryProvider().get_details('olib_OL27482W')

        self.assertEqual(details.description, 'A tale of high adventure.')

    def test_details_with_missing_optional_fields(self):
        doc = ol_search_doc(author_name=None, cover_i=None, first_publish_year=None, ratings_average=None, number_of_pages_median=None)
        for description in (None, '', '   ', {'type': '/type/text', 'value': ''}):
            work = ol_work(description=description, subjects=None)
            with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=[doc], work=work)):
                details = OpenLibraryProvider().get_details('olib_OL27482W')

            self.assertEqual(details.to_review_item_fields(), {
                'item_id': 'olib_OL27482W',
                'category': 'book',
                'title': 'The Hobbit',
                'image_url': 'https://covers.openlibrary.org/w/olid/OL27482W-L.jpg?default=false',
                'year': 'N/A',
                'attr1': 'N/A',
                'attr2': 'N/A',
                'attr3': 'N/A',
                'language': '',
                'description': 'N/A',
                'rating': 'N/A',
            })

    def test_details_with_zero_pages(self):
        doc = ol_search_doc(number_of_pages_median=0)
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=[doc])):
            details = OpenLibraryProvider().get_details('olib_OL27482W')

        self.assertIsNone(details.pages)
        self.assertEqual(details.to_review_item_fields()['attr3'], 'N/A')

    def test_details_truncate_to_column_sizes(self):
        doc = ol_search_doc(title='T' * 150, author_name=['Author {}'.format(i) for i in range(60)])
        work = ol_work(subjects=['S' * 200, 'U' * 200])
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=[doc], work=work)):
            fields = OpenLibraryProvider().get_details('olib_OL27482W').to_review_item_fields()

        self.assertEqual(fields['title'], 'T' * 100)
        # Whole entries only: the second subject doesn't fit, and no author is cut.
        self.assertEqual(fields['attr1'], 'S' * 200)
        authors = fields['attr2'].split(', ')
        self.assertLessEqual(len(fields['attr2']), 300)
        self.assertEqual(authors, ['Author {}'.format(i) for i in range(len(authors))])
        # The next author would not have fit.
        self.assertGreater(len(fields['attr2'] + ', Author {}'.format(len(authors))), 300)

    def test_details_cut_a_single_overlong_entry(self):
        doc = ol_search_doc(author_name=['A' * 350, 'Second Author'])
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=[doc])):
            fields = OpenLibraryProvider().get_details('olib_OL27482W').to_review_item_fields()

        self.assertEqual(fields['attr2'], 'A' * 300)

    def test_details_dedupe_genres_and_authors(self):
        doc = ol_search_doc(author_name=['Roald Dahl', 'Quentin Blake', 'Roald Dahl'])
        work = ol_work(subjects=['Fiction', 'fiction', "Children's stories, English", 'Foxes', 'FICTION', 'Animals'])
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=[doc], work=work)):
            fields = OpenLibraryProvider().get_details('olib_OL27482W').to_review_item_fields()

        self.assertEqual(fields['attr1'], 'Fiction, Foxes, Animals')
        self.assertEqual(fields['attr2'], 'Roald Dahl, Quentin Blake')

    def test_search_skips_docs_that_are_not_works(self):
        docs = [{'key': '/books/OL1M', 'title': 'An edition'}, {'title': 'No key'}, ol_search_doc()]
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=docs)):
            results = OpenLibraryProvider().search('hobbit')

        self.assertEqual([item.item_id for item in results], ['olib_OL27482W'])

    def test_details_requires_prefix(self):
        with mock.patch(REQUESTS_GET) as get_mock:
            with self.assertRaises(InvalidItemId) as ctx:
                OpenLibraryProvider().get_details('mal_manga_2')

        self.assertEqual(ctx.exception.message, 'Missing prefix in item id.')
        get_mock.assert_not_called()

    def test_details_reject_invalid_work_id(self):
        for item_id in ('olib_OL1M', 'olib_*', 'olib_OL1W OR key:*', 'olib_'):
            with mock.patch(REQUESTS_GET) as get_mock:
                with self.assertRaises(InvalidItemId) as ctx:
                    OpenLibraryProvider().get_details(item_id)

            self.assertEqual(ctx.exception.message, 'Invalid book id.')
            get_mock.assert_not_called()

    def test_details_for_unknown_work(self):
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=[])) as get_mock:
            with self.assertRaises(ItemNotFound) as ctx:
                OpenLibraryProvider().get_details('olib_OL1W')

        self.assertEqual(ctx.exception.message, 'Book not found!')
        self.assertEqual(get_mock.call_count, 1)

    def test_details_upstream_errors(self):
        for statuses in ((503, 200), (200, 404)):
            with mock.patch(SLEEP):
                with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_status=statuses[0], work_status=statuses[1])):
                    with self.assertRaises(UpstreamError) as ctx:
                        OpenLibraryProvider().get_details('olib_OL27482W')

            self.assertEqual(ctx.exception.source, 'Open Library API')

    def test_malformed_payloads_are_upstream_errors(self):
        # Search bodies that are wrong for a search and for the details' lookup alike.
        search_body_cases = [
            ('search body is a list', [ol_search_doc()]),
            ('search body is null', None),
            ('docs is an object', {'docs': ol_search_doc()}),
            ('docs is a string', {'docs': 'The Hobbit'}),
            ('doc not an object', {'docs': ['OL27482W']}),
            ('key not text', {'docs': [ol_search_doc(key=27482)]}),
            ('cover_i text', {'docs': [ol_search_doc(cover_i='14627509')]}),
            ('first_publish_year text', {'docs': [ol_search_doc(first_publish_year='1937')]}),
            ('ratings_average text', {'docs': [ol_search_doc(ratings_average='4.3')]}),
            ('ratings_average NaN', {'docs': [ol_search_doc(ratings_average=float('nan'))]}),
        ]
        search_cases = search_body_cases + [
            ('one bad doc among good ones', {'docs': [ol_search_doc(), ol_search_doc('OL1W', cover_i='14627509')]}),
        ]
        details_cases = [(name, {'search_json': body}) for name, body in search_body_cases] + [
            ('number_of_pages_median text', {'search_json': {'docs': [ol_search_doc(number_of_pages_median='310')]}}),
            ('author_name a string', {'search_json': {'docs': [ol_search_doc(author_name='J.R.R. Tolkien')]}}),
            ('work body is a list', {'work_json': [ol_work()]}),
            ('work body is null', {'work_json': None}),
            ('subjects a string', {'work_json': ol_work(subjects='Fantasy')}),
        ]
        cases = [('search', name, {'search_json': body}) for name, body in search_cases]
        cases += [('get_details', name, fake_args) for name, fake_args in details_cases]
        for method, name, fake_args in cases:
            with self.subTest(method=method, case=name):
                with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(**fake_args)):
                    with self.assertRaises(ProviderError) as ctx:
                        if method == 'search':
                            OpenLibraryProvider().search('hobbit')
                        else:
                            OpenLibraryProvider().get_details('olib_OL27482W')

                _assert_bad_response(self, ctx.exception, 'Unexpected response from Open Library.', 'Open Library API')


@mock.patch.dict('os.environ', {'OMDB_API_KEY': 'key-123', 'MAL_CLIENT_ID': 'client-123', **IGDB_ENV})
class RegistryTest(SimpleTestCase):
    def test_every_category_has_a_provider(self):
        expected = {
            'movie': OMDbProvider,
            'series': OMDbProvider,
            'game': IGDBProvider,
            'anime': MALProvider,
            'manga': MALProvider,
            'book': OpenLibraryProvider,
        }
        self.assertEqual(set(CATEGORIES), set(expected))
        for category, provider_class in expected.items():
            provider = get_provider(category)
            self.assertIsInstance(provider, provider_class)
            self.assertEqual(provider.category, category)

    def test_unknown_category(self):
        with self.assertRaises(ValueError):
            get_provider('podcast')

    def test_missing_key_is_reported_on_every_call(self):
        for key in IGDB_ENV:
            with self.subTest(key=key):
                with mock.patch.dict('os.environ', {key: ''}):
                    for _ in range(2):
                        with self.assertRaises(RuntimeError):
                            get_provider('game')
                        with self.assertRaises(RuntimeError):
                            provider_for_item_id('igdb_1942')

    def test_provider_for_item_id(self):
        expected = {
            'omdb_tt0903747': (OMDbProvider, None),
            'igdb_1942': (IGDBProvider, 'game'),
            'mal_anime_38000': (MALProvider, 'anime'),
            'mal_manga_2': (MALProvider, 'manga'),
            'olib_OL27482W': (OpenLibraryProvider, 'book'),
        }
        for item_id, (provider_class, category) in expected.items():
            provider = provider_for_item_id(item_id)
            self.assertIsInstance(provider, provider_class)
            self.assertEqual(provider.category, category)

    def test_provider_for_unknown_prefix(self):
        for item_id in ('imdb_tt0903747', 'mal_novel_1', 'jikan_anime_38000', 'tt0903747', ''):
            with self.assertRaises(InvalidItemId):
                provider_for_item_id(item_id)

    def test_legacy_rawg_ids_have_no_provider(self):
        self.assertEqual(LEGACY_PREFIXES, ('rawg_',))
        with self.assertRaises(InvalidItemId) as ctx:
            provider_for_item_id('rawg_3328')

        self.assertEqual(ctx.exception.message, 'Unknown item id prefix.')


def test_normalize_imdb_title_url_to_item_id_accepts_title_url():
    assert normalize_imdb_title_url_to_item_id('https://www.imdb.com/title/tt0111161/') == 'omdb_tt0111161'


def test_normalize_imdb_title_url_to_item_id_accepts_mobile_url_and_query_string():
    assert normalize_imdb_title_url_to_item_id('https://m.imdb.com/title/tt3896198/?ref_=fn_al_tt_1') == 'omdb_tt3896198'


def test_normalize_imdb_title_url_to_item_id_rejects_non_title_urls():
    assert normalize_imdb_title_url_to_item_id('https://www.imdb.com/name/nm0000209/') is None
    assert normalize_imdb_title_url_to_item_id('tt0111161') is None
    assert normalize_imdb_title_url_to_item_id('The Shawshank Redemption') is None
