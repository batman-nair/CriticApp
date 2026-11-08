from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from drf_spectacular.generators import SchemaGenerator
from drf_spectacular.settings import patched_settings
from rest_framework.test import APITestCase

from critic.api.schema import V3_SCHEMA_SETTINGS
from review.api_v3.items import ITEM_SCHEMA_SERIALIZERS, ItemSerializer, parse_years
from review.api_v3.services import get_or_fetch_item
from review.models import ReviewItem
from review.providers import CATEGORIES, InvalidItemId, ItemDetails, ItemNotFound, UpstreamError
from review.tests.test_api_utils import RECORD_USAGE, REQUESTS_GET, _ResponseStub, _mal_node, _omdb_title

# Rows as the providers have stored them, "N/A" values included.
STORED_ROWS = {
    'movie': dict(
        item_id='omdb_tt5884052', category='movie', title='Pokémon Detective Pikachu',
        image_url='https://img/pikachu.jpg', year='2019', attr1='Action, Adventure, Comedy',
        attr2='Rob Letterman, Dan Hernandez, Ryan Reynolds', attr3='movie', language='English, Japanese',
        description='In a world where people collect Pokémon...', rating='6.5',
    ),
    'series': dict(
        item_id='omdb_tt0903747', category='series', title='Breaking Bad', image_url='N/A', year='2008–2013',
        attr1='Crime, Drama', attr2='Vince Gilligan', attr3='series', language='English', description='N/A',
        rating='9.5',
    ),
    'game': dict(
        item_id='igdb_1942', category='game', title='The Witcher 3: Wild Hunt',
        image_url='https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg', year='2015',
        attr1='Role-playing (RPG), Adventure', attr2='CD Projekt RED', attr3='PC (Microsoft Windows), PlayStation 4',
        language='', description='', rating='9.3',
    ),
    'anime': dict(
        item_id='mal_anime_52991', category='anime', title='Sousou no Frieren', image_url='https://img/frieren.jpg',
        year='2023-2024', attr1='Adventure, Drama, Fantasy', attr2='Madhouse', attr3='tv', language='',
        description='The adventure is over but life goes on.', rating='9.3',
    ),
    'manga': dict(
        item_id='mal_manga_2', category='manga', title='Berserk', image_url='https://img/berserk.jpg', year='1989',
        attr1='', attr2='Kentarou Miura', attr3='manga', language='', description='', rating='9.47',
    ),
    'book': dict(
        item_id='olib_OL27482W', category='book', title='The Hobbit',
        image_url='https://covers.openlibrary.org/b/id/14627509-L.jpg', year='1937', attr1='Fantasy, Dragons',
        attr2='J.R.R. Tolkien', attr3='310 pages', language='', description='A tale of high adventure.',
        rating='8.6',
    ),
}


def store(**fields):
    return ReviewItem.objects.create(**fields)


class ParseYearsTest(SimpleTestCase):
    def test_shapes(self):
        cases = [
            ('2019', (2019, None)),
            ('2018–2021', (2018, 2021)),
            ('2018–', (2018, None)),
            ('2022-02-25', (2022, None)),
            ('2019-2020', (2019, 2020)),
            # MAL's range for a title that started and ended in one year.
            ('2023-2023', (2023, None)),
            (' 2019 ', (2019, None)),
            ('N/A', (None, None)),
            ('', (None, None)),
            (None, (None, None)),
            ('abcd', (None, None)),
            ('19', (None, None)),
            ('2019–2020–2021', (None, None)),
        ]
        for text, expected in cases:
            with self.subTest(text=text):
                self.assertEqual(parse_years(text), expected)


class ItemSerializerTest(TestCase):
    def data(self, category, **overrides):
        return ItemSerializer(store(**{**STORED_ROWS[category], **overrides})).data

    def test_movie(self):
        self.assertEqual(self.data('movie'), {
            'id': 'omdb_tt5884052',
            'category': 'movie',
            'title': 'Pokémon Detective Pikachu',
            'image_url': 'https://img/pikachu.jpg',
            'start_year': 2019,
            'end_year': None,
            'genres': ['Action', 'Adventure', 'Comedy'],
            'creators': ['Rob Letterman', 'Dan Hernandez', 'Ryan Reynolds'],
            'languages': ['English', 'Japanese'],
            'description': 'In a world where people collect Pokémon...',
            'provider_rating': 6.5,
            'details': {'media_type': 'movie'},
        })

    def test_key_order(self):
        self.assertEqual(list(self.data('movie')), [
            'id', 'category', 'title', 'image_url', 'start_year', 'end_year', 'genres', 'creators',
            'languages', 'description', 'provider_rating', 'details',
        ])

    def test_series_with_missing_values(self):
        data = self.data('series')
        self.assertIsNone(data['image_url'])
        self.assertIsNone(data['description'])
        self.assertEqual((data['start_year'], data['end_year']), (2008, 2013))
        self.assertEqual(data['details'], {'media_type': 'series'})

    def test_game(self):
        data = self.data('game')
        self.assertEqual(data['details'], {'platforms': ['PC (Microsoft Windows)', 'PlayStation 4']})
        self.assertEqual(data['genres'], ['Role-playing (RPG)', 'Adventure'])
        self.assertEqual(data['languages'], [])
        self.assertIsNone(data['description'])
        self.assertEqual(data['provider_rating'], 9.3)

    def test_legacy_rawg_game(self):
        data = self.data(
            'game', item_id='rawg_3328', year='2015-05-18', attr3='PC, PlayStation 4, Xbox One', rating='8.84',
        )
        self.assertEqual(data['id'], 'rawg_3328')
        self.assertEqual((data['start_year'], data['end_year']), (2015, None))
        self.assertEqual(data['details'], {'platforms': ['PC', 'PlayStation 4', 'Xbox One']})
        self.assertEqual(data['provider_rating'], 8.84)

    def test_game_without_platforms(self):
        self.assertEqual(self.data('game', attr3='')['details'], {'platforms': []})

    def test_anime(self):
        data = self.data('anime')
        self.assertEqual((data['start_year'], data['end_year']), (2023, 2024))
        self.assertEqual(data['creators'], ['Madhouse'])
        self.assertEqual(data['details'], {'media_type': 'tv'})

    def test_anime_without_media_type(self):
        self.assertEqual(self.data('anime', attr3='N/A')['details'], {'media_type': None})

    def test_manga_without_genres(self):
        data = self.data('manga')
        self.assertEqual(data['genres'], [])
        self.assertEqual(data['provider_rating'], 9.47)
        self.assertEqual(data['details'], {'media_type': 'manga'})

    def test_book(self):
        data = self.data('book')
        self.assertEqual(data['details'], {'pages': 310})
        self.assertEqual(data['creators'], ['J.R.R. Tolkien'])

    def test_book_with_missing_values(self):
        data = self.data(
            'book', attr1='N/A', attr2='N/A', attr3='N/A', description='N/A', rating='N/A', year='N/A',
        )
        self.assertEqual(data['genres'], [])
        self.assertEqual(data['creators'], [])
        self.assertEqual(data['details'], {'pages': None})
        self.assertIsNone(data['description'])
        self.assertIsNone(data['provider_rating'])
        self.assertEqual((data['start_year'], data['end_year']), (None, None))

    def test_ratings_that_are_not_numbers(self):
        for rating in ['N/A', '', 'nan', 'inf', 'abc']:
            with self.subTest(rating=rating):
                self.assertIsNone(self.data('movie', item_id='omdb_' + rating, rating=rating)['provider_rating'])

    def test_lists_drop_empty_and_unknown_entries(self):
        self.assertEqual(self.data('movie', attr1='Action, , N/A,Drama ')['genres'], ['Action', 'Drama'])


class ItemSchemaTest(TestCase):
    def test_output_matches_the_schema_per_category(self):
        for category in CATEGORIES:
            with self.subTest(category=category):
                data = ItemSerializer(store(**STORED_ROWS[category])).data
                schema_fields = ITEM_SCHEMA_SERIALIZERS[category]().fields
                self.assertEqual(list(data), list(schema_fields))
                self.assertEqual(list(data['details']), list(schema_fields['details'].fields))

    def test_discriminator_maps_each_category(self):
        with patched_settings(V3_SCHEMA_SETTINGS):
            schema = SchemaGenerator(urlconf='critic.api.schema_urls').get_schema(request=None, public=True)
        item = schema['components']['schemas']['Item']
        self.assertEqual(item['discriminator']['propertyName'], 'category')
        self.assertEqual(item['discriminator']['mapping'], {
            category: '#/components/schemas/{}Item'.format(category.capitalize()) for category in CATEGORIES
        })


class _StubProvider:
    def __init__(self, details=None, error=None, on_fetch=None):
        self.details = details
        self.error = error
        self.on_fetch = on_fetch
        self.calls = []

    def get_details(self, item_id):
        self.calls.append(item_id)
        if self.on_fetch:
            self.on_fetch()
        if self.error:
            raise self.error
        return self.details


def _anime_details(**overrides):
    return ItemDetails(**{
        'item_id': 'mal_anime_52991', 'category': 'anime', 'title': 'Sousou no Frieren',
        'image_url': 'https://img/frieren.jpg', 'year': '2023-2024', 'genres': ['Adventure', 'Drama'],
        'creators': ['Madhouse'], 'media_type': 'tv', 'description': 'After the adventure.',
        'provider_rating': 9.3, **overrides,
    })


PROVIDER_FOR_ITEM_ID = 'review.api_v3.services.provider_for_item_id'


class GetOrFetchItemTest(TestCase):
    def test_stored_item_is_returned_without_a_request(self):
        stored = store(**STORED_ROWS['anime'])
        with mock.patch(PROVIDER_FOR_ITEM_ID) as provider_for:
            self.assertEqual(get_or_fetch_item('mal_anime_52991'), stored)
        provider_for.assert_not_called()

    def test_fetched_item_is_stored(self):
        provider = _StubProvider(_anime_details())
        with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=provider):
            item = get_or_fetch_item('mal_anime_52991')

        self.assertEqual(provider.calls, ['mal_anime_52991'])
        item = ReviewItem.objects.get(item_id='mal_anime_52991')
        self.assertEqual((item.attr1, item.attr2, item.attr3, item.rating), ('Adventure, Drama', 'Madhouse', 'tv', '9.3'))
        self.assertIsNotNone(item.last_refreshed_at)
        self.assertEqual(item.last_refresh_attempt_at, item.last_refreshed_at)
        self.assertEqual(item.refresh_error_count, 0)

    def test_item_stored_meanwhile_is_returned_not_duplicated(self):
        def store_concurrently():
            store(**{**STORED_ROWS['anime'], 'title': 'Stored meanwhile'})

        provider = _StubProvider(_anime_details(), on_fetch=store_concurrently)
        with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=provider):
            item = get_or_fetch_item('mal_anime_52991')

        self.assertEqual(item.title, 'Stored meanwhile')
        self.assertEqual(ReviewItem.objects.count(), 1)

    def test_over_long_values_are_fitted_to_the_columns(self):
        crew = ['Actor Number {:03d}'.format(i) for i in range(40)]
        provider = _StubProvider(_anime_details(title='T' * 150, creators=crew))
        with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=provider):
            item = get_or_fetch_item('mal_anime_52991')

        self.assertEqual(item.title, 'T' * 100)
        self.assertLessEqual(len(item.attr2), 300)
        # Whole names only.
        self.assertEqual(item.attr2.split(', '), crew[:len(item.attr2.split(', '))])

    def test_over_long_image_url_and_year_are_left_out(self):
        provider = _StubProvider(_anime_details(image_url='https://img/' + 'x' * 200, year='2019–2020–2021'))
        with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=provider):
            item = get_or_fetch_item('mal_anime_52991')

        self.assertEqual((item.image_url, item.year), ('N/A', 'N/A'))

    def test_over_long_id_is_invalid_without_a_request(self):
        with mock.patch(PROVIDER_FOR_ITEM_ID) as provider_for:
            with self.assertRaises(InvalidItemId):
                get_or_fetch_item('omdb_tt' + '1' * 20)
        provider_for.assert_not_called()


OMDB_ENV = {'OMDB_API_KEY': 'key-123'}


@mock.patch(RECORD_USAGE, new=mock.Mock())
class V3ItemDetailTest(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('alice', password='pw')
        self.client.force_authenticate(self.user)

    def get(self, item_id):
        return self.client.get('/api/v3/items/' + item_id)

    def assertProblem(self, response, status, code):
        self.assertEqual(response.status_code, status)
        self.assertEqual(response['Content-Type'], 'application/problem+json')
        body = response.json()
        self.assertEqual(body['code'], code)
        return body

    def test_stored_item(self):
        store(**STORED_ROWS['book'])
        with mock.patch(PROVIDER_FOR_ITEM_ID) as provider_for:
            response = self.get('olib_OL27482W')
        provider_for.assert_not_called()
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['meta'], {})
        self.assertEqual(body['data']['id'], 'olib_OL27482W')
        self.assertEqual(body['data']['details'], {'pages': 310})

    def test_fetched_item_is_stored_and_served_from_then_on(self):
        mal_json = _mal_node(52991, genres=[{'id': 2, 'name': 'Adventure'}], studios=[{'id': 11, 'name': 'Madhouse'}],
                             media_type='tv', synopsis='After the adventure.', mean=9.3)
        with mock.patch.dict('os.environ', {'MAL_CLIENT_ID': 'client-123'}):
            with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=mal_json)) as get_mock:
                first = self.get('mal_anime_52991')
                second = self.get('mal_anime_52991')

        self.assertEqual(get_mock.call_count, 1)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(first.json()['data'], {
            'id': 'mal_anime_52991',
            'category': 'anime',
            'title': 'Title 52991',
            'image_url': 'https://img/52991l.jpg',
            'start_year': 2019,
            'end_year': None,
            'genres': ['Adventure'],
            'creators': ['Madhouse'],
            'languages': [],
            'description': 'After the adventure.',
            'provider_rating': 9.3,
            'details': {'media_type': 'tv'},
        })
        self.assertTrue(ReviewItem.objects.filter(item_id='mal_anime_52991').exists())

    @mock.patch.dict('os.environ', OMDB_ENV)
    def test_omdb_category_comes_from_the_type(self):
        for type_, imdb_id, category in [('series', 'tt0903747', 'series'), ('movie', 'tt5884052', 'movie')]:
            with self.subTest(type=type_):
                omdb_json = _omdb_title(type_, imdbID=imdb_id)
                with mock.patch(REQUESTS_GET, return_value=_ResponseStub(200, json_data=omdb_json)):
                    response = self.get('omdb_' + imdb_id)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['data']['category'], category)
                self.assertEqual(response.json()['data']['details'], {'media_type': type_})
                self.assertEqual(ReviewItem.objects.get(item_id='omdb_' + imdb_id).category, category)

    def test_unknown_prefix_is_not_found(self):
        with mock.patch(REQUESTS_GET) as get_mock:
            self.assertProblem(self.get('imdb_tt0903747'), 404, 'NOT_FOUND')
        get_mock.assert_not_called()

    def test_legacy_rawg_item(self):
        store(**{**STORED_ROWS['game'], 'item_id': 'rawg_3328'})
        self.assertEqual(self.get('rawg_3328').status_code, 200)
        with mock.patch(REQUESTS_GET) as get_mock:
            self.assertProblem(self.get('rawg_9999'), 404, 'NOT_FOUND')
        get_mock.assert_not_called()

    def test_provider_errors(self):
        cases = [
            (ItemNotFound('Anime not found!'), 404, 'NOT_FOUND'),
            (InvalidItemId('Invalid game id.'), 404, 'NOT_FOUND'),
            (UpstreamError('Bad response from API.', status_code=503), 502, 'UPSTREAM_ERROR'),
        ]
        for error, status, code in cases:
            with self.subTest(error=type(error).__name__):
                with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=_StubProvider(error=error)):
                    body = self.assertProblem(self.get('mal_anime_1'), status, code)
                self.assertEqual(body['detail'], error.message)
        self.assertFalse(ReviewItem.objects.exists())

    @mock.patch.dict('os.environ', {'MAL_CLIENT_ID': 'client-123', **OMDB_ENV})
    def test_malformed_mal_and_omdb_ids_are_not_found_without_a_request(self):
        for item_id in ['mal_anime_abc', 'mal_anime_052991', 'mal_manga_', 'omdb_TT0903747', 'omdb_tt1&type=series', 'omdb_x']:
            with self.subTest(item_id=item_id):
                with mock.patch(REQUESTS_GET) as get_mock:
                    self.assertProblem(self.get(item_id), 404, 'NOT_FOUND')
                get_mock.assert_not_called()

    def test_invalid_igdb_id_is_not_found(self):
        with mock.patch.dict('os.environ', {'IGDB_CLIENT_ID': 'id', 'IGDB_CLIENT_SECRET': 'secret'}):
            with mock.patch(REQUESTS_GET) as get_mock:
                self.assertProblem(self.get('igdb_abc'), 404, 'NOT_FOUND')
        get_mock.assert_not_called()

    def test_over_long_id_is_not_found(self):
        with mock.patch(PROVIDER_FOR_ITEM_ID) as provider_for:
            self.assertProblem(self.get('omdb_tt' + '1' * 20), 404, 'NOT_FOUND')
        provider_for.assert_not_called()

    def test_requires_login(self):
        self.client.force_authenticate(None)
        response = self.get('omdb_tt0903747')
        self.assertProblem(response, 401, 'UNAUTHENTICATED')
        self.assertIn('WWW-Authenticate', response)
