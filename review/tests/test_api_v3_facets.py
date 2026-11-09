from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from review.models import Review
from review.tests.test_api_v3_reviews import add_review

URL = '/api/v3/reviews/facets'
CHIPS = ['movie', 'series', 'game', 'anime:series', 'anime:movie', 'manga', 'book']


class FacetsTestCase(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.alice = user_model.objects.create_user('alice', password='pw')
        self.bob = user_model.objects.create_user('bob', password='pw')

    def facets(self, query=''):
        response = self.client.get(f'{URL}?{query}')
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()['data']

    def chips(self, query=''):
        return {chip['id']: chip['count'] for chip in self.facets(query)['categories'] if chip['count']}

    def languages(self, query=''):
        return [(language['name'], language['count']) for language in self.facets(query)['languages']]


class CountsTest(FacetsTestCase):
    def setUp(self):
        super().setUp()
        add_review(self.alice, category='movie', title='Heat', language='English')
        add_review(self.alice, category='series', title='Dark', language='German, English')
        add_review(self.alice, category='anime', attr3='tv', title='Mushishi', language='Japanese')
        add_review(self.bob, category='game', title='Hades', language='English')

    def test_no_filters(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'data': {
                'total': 4,
                'categories': [
                    {'id': 'movie', 'count': 1},
                    {'id': 'series', 'count': 1},
                    {'id': 'game', 'count': 1},
                    {'id': 'anime:series', 'count': 1},
                    {'id': 'anime:movie', 'count': 0},
                    {'id': 'manga', 'count': 0},
                    {'id': 'book', 'count': 0},
                ],
                'languages': [
                    {'name': 'English', 'count': 3},
                    {'name': 'German', 'count': 1},
                    {'name': 'Japanese', 'count': 1},
                ],
            },
            'meta': {},
        })

    def test_q_narrows_everything(self):
        data = self.facets('q=Heat')
        self.assertEqual(data['total'], 1)
        self.assertEqual(self.chips('q=Heat'), {'movie': 1})
        self.assertEqual(self.languages('q=Heat'), [('English', 1)])

    def test_category_keeps_category_counts_and_narrows_languages(self):
        for query in ['category=movie', 'exclude_category=series,game,anime']:
            with self.subTest(query=query):
                self.assertEqual(self.facets(query)['total'], 4)
                self.assertEqual(self.chips(query), self.chips())
                self.assertEqual(self.languages(query), [('English', 1)])

    def test_language_keeps_language_counts_and_narrows_categories(self):
        query = 'language=German'
        self.assertEqual(self.languages(query), self.languages())
        self.assertEqual(self.facets(query)['total'], 1)
        self.assertEqual(self.chips(query), {'series': 1})

    def test_category_and_language_together(self):
        query = 'category=movie&language=German'
        self.assertEqual(self.chips(query), {'series': 1})
        self.assertEqual(self.languages(query), [('English', 1)])

    def test_username(self):
        self.assertEqual(self.facets('username=bob')['total'], 1)
        self.assertEqual(self.chips('username=bob'), {'game': 1})
        self.assertEqual(self.languages('username=bob'), [('English', 1)])

    def test_unknown_username_is_all_zeros(self):
        data = self.facets('username=nobody')
        self.assertEqual(data['total'], 0)
        self.assertEqual([chip['count'] for chip in data['categories']], [0] * len(CHIPS))
        self.assertEqual(data['languages'], [])


class CategoriesTest(FacetsTestCase):
    def test_anime_split(self):
        add_review(self.alice, category='anime', attr3='tv')
        add_review(self.alice, category='anime', attr3='ova')
        add_review(self.alice, category='anime', attr3='movie')
        add_review(self.alice, category='anime', attr3='Movie')
        data = self.facets()
        self.assertEqual(self.chips(), {'anime:series': 2, 'anime:movie': 2})
        self.assertEqual(data['total'], 4)
        self.assertNotIn('anime', [chip['id'] for chip in data['categories']])

    def test_every_chip_is_listed_in_order_without_reviews(self):
        data = self.facets()
        self.assertEqual(data, {'total': 0, 'categories': [{'id': chip, 'count': 0} for chip in CHIPS], 'languages': []})

    def test_chips_follow_the_categories_endpoint(self):
        expected = []
        for category in self.client.get('/api/v3/categories').json()['data']:
            expected += [subcategory['id'] for subcategory in category['subcategories']] or [category['id']]
        self.assertEqual([chip['id'] for chip in self.facets()['categories']], expected)


class LanguagesTest(FacetsTestCase):
    def test_most_common_first_then_by_name(self):
        add_review(self.alice, language='Korean')
        add_review(self.alice, language='German')
        add_review(self.alice, language='Spanish')
        add_review(self.alice, language='Spanish')
        self.assertEqual(self.languages(), [('Spanish', 2), ('German', 1), ('Korean', 1)])

    def test_tie_is_ordered_by_name_within_one_stored_string(self):
        # One row, so the database's row order can't hide a missing tiebreak.
        add_review(self.alice, language='Zulu, Arabic')
        self.assertEqual(self.languages(), [('Arabic', 1), ('Zulu', 1)])

    def test_comma_separated_entries_are_split_and_trimmed(self):
        add_review(self.alice, language='Japanese,  English ,')
        add_review(self.alice, language='English')
        self.assertEqual(self.languages(), [('English', 2), ('Japanese', 1)])

    def test_blank_language_is_left_out(self):
        add_review(self.alice, language='')
        self.assertEqual(self.languages(), [])
        self.assertEqual(self.facets()['total'], 1)

    def test_every_review_of_an_item_counts(self):
        review = add_review(self.alice, language='Korean')
        Review.objects.create(user=self.bob, review_item=review.review_item, review_rating=7)
        self.assertEqual(self.languages(), [('Korean', 2)])


class ParamsTest(FacetsTestCase):
    def assertFieldError(self, response, field, code):
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response['Content-Type'], 'application/problem+json')
        body = response.json()
        self.assertEqual(body['code'], 'VALIDATION_ERROR')
        self.assertIn((field, code), [(error['field'], error['code']) for error in body['errors']], body)

    def test_invalid_filters_are_rejected(self):
        for query, field, code in [
            ('category=nope', 'category.0', 'invalid_choice'),
            ('category=movie,nope', 'category.1', 'invalid_choice'),
            ('exclude_category=nope', 'exclude_category.0', 'invalid_choice'),
        ]:
            with self.subTest(query=query):
                self.assertFieldError(self.client.get(f'{URL}?{query}'), field, code)

    def test_nul_in_q_is_rejected(self):
        self.assertFieldError(self.client.get(URL, {'q': 'a\x00b'}), 'q', 'null_characters_not_allowed')

    def test_sort_limit_and_offset_are_ignored(self):
        add_review(self.alice)
        self.assertEqual(self.facets('sort=nope&limit=x&offset=y')['total'], 1)

    def test_filters_accept_repeated_and_comma_forms(self):
        add_review(self.alice, language='Korean')
        add_review(self.alice, language='German')
        add_review(self.alice, language='Spanish')
        self.assertEqual(self.facets('language=Korean,German&language=Spanish')['total'], 3)
        self.assertEqual(self.facets('language=Korean,German')['total'], 2)


class AccessTest(FacetsTestCase):
    def test_anonymous_can_read(self):
        self.assertEqual(self.client.get(URL).status_code, 200)

    def test_invalid_token_does_not_affect_it(self):
        response = self.client.get(URL, HTTP_AUTHORIZATION='Bearer not-a-token')
        self.assertEqual(response.status_code, 200, response.content)

    def test_other_methods_are_not_allowed(self):
        self.assertEqual(self.client.post(URL, {}, format='json').status_code, 405)


class QueryCountTest(FacetsTestCase):
    def test_same_number_of_queries_for_one_and_five_reviews(self):
        add_review(self.alice, language='English')
        with self.assertNumQueries(2):
            self.assertEqual(self.facets()['total'], 1)
        for language in ['German', 'Korean', 'Spanish', 'French']:
            add_review(self.alice, language=language)
        with self.assertNumQueries(2):
            self.assertEqual(self.facets()['total'], 5)


class SchemaTest(SimpleTestCase):
    # The served schema; test_schema.py checks the committed file is the same.
    def test_documents_only_the_filter_params(self):
        schema = self.client.get('/api/v3/schema', {'format': 'json'}).json()
        parameters = schema['paths']['/api/v3/reviews/facets']['get']['parameters']
        self.assertEqual(
            {parameter['name'] for parameter in parameters if parameter['in'] == 'query'},
            {'username', 'q', 'category', 'exclude_category', 'language'},
        )

    def test_description_is_the_endpoints_own(self):
        schema = self.client.get('/api/v3/schema', {'format': 'json'}).json()
        self.assertIn('no effect', schema['paths']['/api/v3/reviews/facets']['get']['description'])
