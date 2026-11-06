from unittest import mock

from django.test import SimpleTestCase
import requests

from review.providers import (
    CATEGORIES,
    InvalidItemId,
    ItemDetails,
    ItemNotFound,
    ProviderError,
    UpstreamError,
    WrongCategory,
    get_provider,
    provider_for_item_id,
)
from review.providers.base import request_json_with_retry
from review.providers.mal import MALProvider
from review.providers.omdb import OMDbProvider, normalize_imdb_title_url_to_item_id
from review.providers.openlibrary import OpenLibraryProvider
from review.providers.rawg import RAWGProvider

RECORD_USAGE = 'review.providers.base.api_usage.record_upstream_request'
REQUESTS_GET = 'review.providers.base.requests.get'
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
                json_data = request_json_with_retry('https://example.com', source_name='RAWG API')

        self.assertEqual(json_data, {'ok': True})
        self.assertEqual(self.record_usage.call_count, 3)

    def test_every_provider_error_is_a_provider_error(self):
        for error_class in (InvalidItemId, ItemNotFound, WrongCategory, UpstreamError):
            self.assertTrue(issubclass(error_class, ProviderError))
        # The test network guard raises a RuntimeError, which must not be caught as a provider error.
        self.assertFalse(issubclass(ProviderError, RuntimeError))


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
            'item_id': 'jikan_anime_2',
            'title': 'Title 2',
            'image_url': 'https://img/2l.jpg',
            'year': '2019-2019',
        })

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
            details = MALProvider('anime').get_details('jikan_anime_38000')

        url = get_mock.call_args.args[0]
        self.assertTrue(url.startswith('https://api.myanimelist.net/v2/anime/38000?fields='))
        self.assertIn('studios', url)
        self.assertIsInstance(details, ItemDetails)
        self.assertEqual(details.genres, ['Action'])
        self.assertEqual(details.creators, ['ufotable'])
        self.assertEqual(details.media_type, 'tv')
        self.assertEqual(details.provider_rating, 8.5)
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'jikan_anime_38000',
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
            details = MALProvider('manga').get_details('jikan_manga_2')

        self.assertIn('authors{first_name,last_name}', get_mock.call_args.args[0])
        fields = details.to_review_item_fields()
        self.assertEqual(fields['item_id'], 'jikan_manga_2')
        self.assertEqual(fields['category'], 'manga')
        self.assertEqual(fields['year'], '2019')
        self.assertEqual(fields['attr2'], 'Kentarou Miura, Studio Gaga')
        self.assertEqual(fields['attr3'], 'manga')

    def test_details_with_missing_optional_fields(self):
        node = {'id': 5, 'title': 'Bare'}
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=node)):
            details = MALProvider('anime').get_details('jikan_anime_5')

        self.assertIsNone(details.image_url)
        self.assertIsNone(details.year)
        self.assertIsNone(details.provider_rating)
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'jikan_anime_5',
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
                MALProvider('anime').get_details('jikan_anime_999999999')

        self.assertEqual(ctx.exception.message, 'Bad response from API.')

    def test_details_requires_prefix(self):
        with mock.patch(REQUESTS_GET) as get_mock:
            with self.assertRaises(InvalidItemId) as ctx:
                MALProvider('anime').get_details('jikan_manga_2')

        self.assertEqual(ctx.exception.message, 'Missing prefix in item id.')
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
        'Language': 'English, Spanish',
    }
    data.update(extra)
    return data


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


def _rawg_game(game_id=3328, **extra):
    game = {
        'id': game_id,
        'name': 'The Witcher 3: Wild Hunt',
        'background_image': 'https://img/w3.jpg',
        'released': '2015-05-18',
        'genres': [{'name': 'Action'}, {'name': 'RPG'}, {'name': 'Action'}],
        'developers': [{'name': 'CD PROJEKT RED'}],
        'publishers': [{'name': 'CD PROJEKT RED'}, {'name': 'WB Games'}],
        'platforms': [{'platform': {'name': 'PC'}}, {'platform': {'name': 'PlayStation 4'}}],
        'description': '<p>Geralt.</p>',
        'rating': 4.66,
    }
    game.update(extra)
    return game


@mock.patch(RECORD_USAGE, new=mock.Mock())
@mock.patch.dict('os.environ', {'RAWG_API_KEY': 'key-456'})
class RAWGProviderTest(SimpleTestCase):
    def test_requires_api_key(self):
        with mock.patch.dict('os.environ', {'RAWG_API_KEY': ''}):
            with self.assertRaises(RuntimeError):
                RAWGProvider()

    def test_search_encodes_the_query(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'results': [_rawg_game()]})) as get_mock:
            RAWGProvider().search(SPECIAL_QUERY)

        self.assertEqual(
            get_mock.call_args.args[0],
            'https://api.rawg.io/api/games?key=key-456&search=' + ENCODED_SPECIAL_QUERY,
        )

    def test_search_results(self):
        games = [_rawg_game(1), _rawg_game(2, background_image=None, released=None)] + [_rawg_game(i) for i in range(3, 15)]
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'results': games})):
            results = RAWGProvider().search('witcher')

        self.assertEqual(len(results), 10)
        self.assertEqual([result.to_search_result() for result in results[:2]], [
            {'item_id': 'rawg_1', 'title': 'The Witcher 3: Wild Hunt', 'image_url': 'https://img/w3.jpg', 'year': '2015'},
            {'item_id': 'rawg_2', 'title': 'The Witcher 3: Wild Hunt', 'image_url': 'N/A', 'year': 'N/A'},
        ])

    def test_search_without_results_is_not_found(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'results': []})):
            with self.assertRaises(ItemNotFound) as ctx:
                RAWGProvider().search('zzzzzz')

        self.assertEqual(ctx.exception.message, 'Game not found!')

    def test_details(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=_rawg_game())) as get_mock:
            details = RAWGProvider().get_details('rawg_3328')

        self.assertEqual(get_mock.call_args.args[0], 'https://api.rawg.io/api/games/3328?key=key-456')
        self.assertEqual(details.genres, ['Action', 'RPG'])
        self.assertEqual(details.creators, ['CD PROJEKT RED', 'WB Games'])
        self.assertEqual(details.platforms, ['PC', 'PlayStation 4'])
        self.assertEqual(details.provider_rating, 4.66 * 2)
        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'rawg_3328',
            'category': 'game',
            'title': 'The Witcher 3: Wild Hunt',
            'image_url': 'https://img/w3.jpg',
            'year': '2015',
            'attr1': 'Action, RPG',
            'attr2': 'CD PROJEKT RED, WB Games',
            'attr3': 'PC, PlayStation 4',
            'description': '<p>Geralt.</p>',
            'rating': str(4.66 * 2),
        })

    def test_details_with_missing_optional_fields(self):
        game = _rawg_game(
            background_image='null', released=None, genres=[], developers=[], publishers=[],
            platforms=[], description='', rating=0,
        )
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=game)):
            details = RAWGProvider().get_details('rawg_3328')

        self.assertEqual(details.to_review_item_fields(), {
            'item_id': 'rawg_3328',
            'category': 'game',
            'title': 'The Witcher 3: Wild Hunt',
            'image_url': 'N/A',
            'year': 'N/A',
            'attr1': '',
            'attr2': '',
            'attr3': '',
            'description': '',
            'rating': '0',
        })

    def test_details_with_null_lists(self):
        game = _rawg_game(genres=None, developers=None, publishers=None, platforms=None)
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=game)):
            fields = RAWGProvider().get_details('rawg_3328').to_review_item_fields()

        self.assertEqual((fields['attr1'], fields['attr2'], fields['attr3']), ('', '', ''))

    def test_details_for_unknown_id_is_not_found(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(404, reason='Not Found')):
            with self.assertRaises(ItemNotFound) as ctx:
                RAWGProvider().get_details('rawg_999999999')

        self.assertEqual(ctx.exception.message, 'Bad response from API.')

    def test_details_server_error_is_upstream_error(self):
        with mock.patch(SLEEP):
            with mock.patch(REQUESTS_GET, return_value=_ResponseStub(503, reason='Service Unavailable')):
                with self.assertRaises(UpstreamError) as ctx:
                    RAWGProvider().get_details('rawg_3328')

        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(ctx.exception.source, 'RAWG API')

    def test_details_requires_prefix(self):
        with mock.patch(REQUESTS_GET) as get_mock:
            with self.assertRaises(InvalidItemId):
                RAWGProvider().get_details('3328')

        get_mock.assert_not_called()


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


def ol_requests_get(search_docs=None, work=None, search_status=200, work_status=200):
    """Fake requests.get answering the Open Library search and work URLs."""
    def fake_get(url, **kwargs):
        if '/search.json' in url:
            return _ResponseStub(search_status, json_data={'docs': search_docs if search_docs is not None else [ol_search_doc()]})
        if '/works/' in url and url.endswith('.json'):
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
                OpenLibraryProvider().get_details('jikan_manga_2')

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


@mock.patch.dict('os.environ', {'OMDB_API_KEY': 'key-123', 'RAWG_API_KEY': 'key-456', 'MAL_CLIENT_ID': 'client-123'})
class RegistryTest(SimpleTestCase):
    def test_every_category_has_a_provider(self):
        expected = {
            'movie': OMDbProvider,
            'series': OMDbProvider,
            'game': RAWGProvider,
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
        with mock.patch.dict('os.environ', {'RAWG_API_KEY': ''}):
            for _ in range(2):
                with self.assertRaises(RuntimeError):
                    get_provider('game')

    def test_provider_for_item_id(self):
        expected = {
            'omdb_tt0903747': (OMDbProvider, None),
            'rawg_3328': (RAWGProvider, 'game'),
            'jikan_anime_38000': (MALProvider, 'anime'),
            'jikan_manga_2': (MALProvider, 'manga'),
            'olib_OL27482W': (OpenLibraryProvider, 'book'),
        }
        for item_id, (provider_class, category) in expected.items():
            provider = provider_for_item_id(item_id)
            self.assertIsInstance(provider, provider_class)
            self.assertEqual(provider.category, category)

    def test_provider_for_unknown_prefix(self):
        for item_id in ('imdb_tt0903747', 'jikan_novel_1', 'tt0903747', ''):
            with self.assertRaises(InvalidItemId):
                provider_for_item_id(item_id)


def test_normalize_imdb_title_url_to_item_id_accepts_title_url():
    assert normalize_imdb_title_url_to_item_id('https://www.imdb.com/title/tt0111161/') == 'omdb_tt0111161'


def test_normalize_imdb_title_url_to_item_id_accepts_mobile_url_and_query_string():
    assert normalize_imdb_title_url_to_item_id('https://m.imdb.com/title/tt3896198/?ref_=fn_al_tt_1') == 'omdb_tt3896198'


def test_normalize_imdb_title_url_to_item_id_rejects_non_title_urls():
    assert normalize_imdb_title_url_to_item_id('https://www.imdb.com/name/nm0000209/') is None
    assert normalize_imdb_title_url_to_item_id('tt0111161') is None
    assert normalize_imdb_title_url_to_item_id('The Shawshank Redemption') is None
