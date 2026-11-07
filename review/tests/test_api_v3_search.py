from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from review.models import Review, ReviewItem
from review.providers import ItemNotFound, ItemSummary, UpstreamError
from review.tests.test_api_utils import (
    IGDB_ENV,
    RECORD_USAGE,
    REQUESTS_GET,
    REQUESTS_POST,
    _ResponseStub,
    _igdb_game,
    _igdb_response,
    _igdb_token,
    _mal_node,
    _omdb_title,
    ol_requests_get,
    ol_search_doc,
)

GET_PROVIDER = 'review.api_v3.search.get_provider'
PROVIDER_ENV = {'OMDB_API_KEY': 'key-123', 'MAL_CLIENT_ID': 'client-123', **IGDB_ENV}


class _StubProvider:
    def __init__(self, results=(), error=None):
        self.results = list(results)
        self.error = error

    def search(self, query):
        if self.error:
            raise self.error
        return self.results


def _summary(item_id, **extra):
    return ItemSummary(**{'item_id': item_id, 'category': 'movie', 'title': item_id, **extra})


def _store_item(item_id):
    return ReviewItem.objects.create(
        item_id=item_id, category='movie', title=item_id, image_url='N/A', year='2019', attr1='', attr2='',
        attr3='', description='', rating='N/A',
    )


@mock.patch(RECORD_USAGE, new=mock.Mock())
@mock.patch.dict('os.environ', PROVIDER_ENV)
class V3SearchTest(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user('alice', password='pw')
        self.other = user_model.objects.create_user('bob', password='pw')
        self.client.force_authenticate(self.user)

    def search(self, category, q):
        return self.client.get('/api/v3/search', {'category': category, 'q': q})

    def assertProblem(self, response, status, code):
        self.assertEqual(response.status_code, status)
        self.assertEqual(response['Content-Type'], 'application/problem+json')
        body = response.json()
        self.assertEqual(body['code'], code)
        return body

    # Free fields, per provider, from the provider's own search response.

    def test_igdb_genres_and_rating(self):
        with mock.patch(REQUESTS_POST, side_effect=[_igdb_token(), _igdb_response([_igdb_game()])]):
            response = self.search('game', 'witcher 3')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'data': [{
            'id': 'igdb_1942',
            'category': 'game',
            'title': 'The Witcher 3: Wild Hunt',
            'image_url': 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg',
            'start_year': 2015,
            'end_year': None,
            'genres': ['Role-playing (RPG)', 'Adventure'],
            'provider_rating': 9.3,
            'my_review': None,
        }], 'meta': {}})

    def test_mal_genres_and_rating(self):
        nodes = [
            {'node': _mal_node(52991, mean=9.3, genres=[{'id': 2, 'name': 'Adventure'}, {'id': 8, 'name': 'Drama'}])},
            {'node': _mal_node(2, mean=8)},
        ]
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'data': nodes})) as get_mock:
            response = self.search('anime', 'frieren')

        self.assertEqual(get_mock.call_count, 1)
        first, second = response.json()['data']
        self.assertEqual((first['genres'], first['provider_rating']), (['Adventure', 'Drama'], 9.3))
        self.assertEqual((first['start_year'], first['end_year']), (2019, 2019))
        # MAL reported no genres.
        self.assertEqual((second['genres'], second['provider_rating']), ([], 8))

    def test_open_library_rating_without_genres(self):
        docs = [ol_search_doc(), ol_search_doc('OL1W', cover_i=None, ratings_average=None, first_publish_year=None)]
        with mock.patch(REQUESTS_GET, side_effect=ol_requests_get(search_docs=docs)) as get_mock:
            response = self.search('book', 'hobbit')

        self.assertEqual(get_mock.call_count, 1)
        first, second = response.json()['data']
        self.assertEqual((first['genres'], first['provider_rating']), (None, 8.6))
        self.assertEqual((first['start_year'], first['end_year']), (1937, None))
        self.assertEqual((second['genres'], second['provider_rating']), (None, None))
        self.assertIsNone(second['image_url'])
        self.assertEqual((second['start_year'], second['end_year']), (None, None))

    def test_omdb_has_neither(self):
        body = {'Search': [
            {'imdbID': 'tt0903747', 'Title': 'Breaking Bad', 'Year': '2008–2013', 'Poster': 'N/A', 'Type': 'series'},
            {'imdbID': 'tt9999999', 'Title': 'Still Running', 'Year': '2018–', 'Poster': 'https://img/s.jpg', 'Type': 'series'},
        ], 'Response': 'True'}
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=body)):
            response = self.search('series', 'breaking')

        first, second = response.json()['data']
        self.assertEqual(first['id'], 'omdb_tt0903747')
        self.assertEqual(first['category'], 'series')
        self.assertIsNone(first['image_url'])
        self.assertEqual((first['genres'], first['provider_rating']), (None, None))
        self.assertEqual((first['start_year'], first['end_year']), (2008, 2013))
        self.assertEqual((second['start_year'], second['end_year']), (2018, None))

    # my_review

    def test_my_review(self):
        mine = Review.objects.create(user=self.user, review_item=_store_item('omdb_tt1'), review_rating='7.50')
        Review.objects.create(user=self.other, review_item=_store_item('omdb_tt2'), review_rating=9)
        provider = _StubProvider([_summary('omdb_tt1'), _summary('omdb_tt2'), _summary('omdb_tt3')])
        with mock.patch(GET_PROVIDER, return_value=provider):
            with CaptureQueriesContext(connection) as queries:
                response = self.search('movie', 'anything')

        self.assertEqual(response.status_code, 200)
        self.assertEqual([result['my_review'] for result in response.json()['data']], [
            {'id': mine.id, 'rating': 7.5},
            # Someone else's review isn't mine.
            None,
            None,
        ])
        # A JSON number, not a string.
        self.assertIn(b'"rating":7.5', response.content)
        review_queries = [query for query in queries.captured_queries if 'review_review' in query['sql']]
        self.assertEqual(len(review_queries), 1)

    def test_no_review_query_without_results(self):
        with mock.patch(GET_PROVIDER, return_value=_StubProvider(error=ItemNotFound('Movie not found!'))):
            with CaptureQueriesContext(connection) as queries:
                response = self.search('movie', 'zzzz')

        self.assertEqual(response.json(), {'data': [], 'meta': {}})
        self.assertFalse([query for query in queries.captured_queries if 'review_review' in query['sql']])

    # IMDb title URLs

    def test_imdb_url_returns_that_title(self):
        omdb_json = _omdb_title('movie', imdbID='tt5884052', Title='Pokémon Detective Pikachu', Year='2019')
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=omdb_json)) as get_mock:
            response = self.search('movie', 'https://www.imdb.com/title/tt5884052/?ref_=nv_sr_srsg_0')

        self.assertEqual(get_mock.call_count, 1)
        self.assertIn('&i=tt5884052', get_mock.call_args.args[0])
        [result] = response.json()['data']
        self.assertEqual(result['id'], 'omdb_tt5884052')
        self.assertEqual(result['title'], 'Pokémon Detective Pikachu')
        # The details come with them in the same request.
        self.assertEqual(result['genres'], ['Crime', 'Drama'])
        self.assertEqual(result['provider_rating'], 9.5)

    def test_imdb_url_of_a_series_in_a_movie_search(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=_omdb_title('series'))):
            body = self.assertProblem(
                self.search('movie', 'https://www.imdb.com/title/tt0903747/'), 400, 'VALIDATION_ERROR',
            )
        self.assertEqual(body['errors'], [{
            'field': 'q', 'code': 'wrong_category',
            'message': 'This title is a series. Pick the Series category.',
        }])

    def test_imdb_url_of_an_unknown_title_finds_nothing(self):
        body = {'Response': 'False', 'Error': 'Incorrect IMDb ID.'}
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=body)):
            response = self.search('series', 'https://www.imdb.com/title/tt0000000/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data'], [])

    # Errors

    def test_nothing_found_is_an_empty_list(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data={'data': []})):
            response = self.search('manga', 'zzzzzz')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'data': [], 'meta': {}})

    def test_upstream_failure(self):
        error = UpstreamError('Request limit reached!', source='OMDB API')
        with mock.patch(GET_PROVIDER, return_value=_StubProvider(error=error)):
            body = self.assertProblem(self.search('movie', 'alien'), 502, 'UPSTREAM_ERROR')
        self.assertEqual(body['detail'], 'Request limit reached!')

    def test_upstream_http_error(self):
        with mock.patch(REQUESTS_GET, return_value=_ResponseStub(400, reason='Bad Request')):
            self.assertProblem(self.search('anime', 'frieren'), 502, 'UPSTREAM_ERROR')

    def test_invalid_parameters(self):
        cases = [
            ({'category': 'podcast', 'q': 'x'}, 'category'),
            ({'q': 'x'}, 'category'),
            ({'category': '', 'q': 'x'}, 'category'),
            ({'category': 'movie'}, 'q'),
            ({'category': 'movie', 'q': '   '}, 'q'),
            ({'category': 'movie', 'q': 'x' * 101}, 'q'),
        ]
        for params, field in cases:
            with self.subTest(params=params):
                with mock.patch(GET_PROVIDER) as get_provider:
                    response = self.client.get('/api/v3/search', params)
                body = self.assertProblem(response, 400, 'VALIDATION_ERROR')
                self.assertEqual([error['field'] for error in body['errors']], [field])
                get_provider.assert_not_called()

    def test_requires_login(self):
        self.client.force_authenticate(None)
        with mock.patch(GET_PROVIDER) as get_provider:
            response = self.search('movie', 'alien')
        self.assertProblem(response, 401, 'UNAUTHENTICATED')
        get_provider.assert_not_called()

    @mock.patch.object(ScopedRateThrottle, 'THROTTLE_RATES', {'search': '1/min'})
    def test_rate_limited(self):
        with mock.patch(GET_PROVIDER, return_value=_StubProvider([_summary('omdb_tt1')])) as get_provider:
            self.assertEqual(self.search('movie', 'alien').status_code, 200)
            response = self.search('movie', 'alien')
        self.assertProblem(response, 429, 'RATE_LIMITED')
        self.assertGreater(int(response['Retry-After']), 0)
        self.assertEqual(get_provider.call_count, 1)
