from django.test import TestCase

from review.utils.review_utils import SUBCATEGORY_FILTERS

SOURCES = {
    'movie': ('OMDb', 'IMDb'),
    'series': ('OMDb', 'IMDb'),
    'game': ('RAWG', 'RAWG'),
    'anime': ('MyAnimeList', 'MyAnimeList'),
    'manga': ('MyAnimeList', 'MyAnimeList'),
    'book': ('Open Library', 'Open Library'),
}


class TestV3Categories(TestCase):
    def setUp(self):
        self.response = self.client.get('/api/v3/categories')
        self.categories = {c['id']: c for c in self.response.json()['data']}

    def test_shape(self):
        self.assertEqual(self.response.status_code, 200)
        self.assertEqual(self.response['Content-Type'], 'application/json')
        body = self.response.json()
        self.assertEqual(set(body), {'data', 'meta'})
        self.assertEqual(body['meta'], {})
        for category in body['data']:
            self.assertEqual(set(category), {'id', 'label', 'subcategories', 'source', 'rating_label'})

    def test_ids_in_order(self):
        ids = [c['id'] for c in self.response.json()['data']]
        self.assertEqual(ids, ['movie', 'series', 'game', 'anime', 'manga', 'book'])

    def test_labels(self):
        labels = {id_: c['label'] for id_, c in self.categories.items()}
        self.assertEqual(labels, {
            'movie': 'Movies', 'series': 'Series', 'game': 'Games',
            'anime': 'Anime', 'manga': 'Manga', 'book': 'Books',
        })

    def test_sources_and_rating_labels(self):
        actual = {id_: (c['source'], c['rating_label']) for id_, c in self.categories.items()}
        self.assertEqual(actual, SOURCES)

    def test_subcategories(self):
        self.assertEqual(self.categories['anime']['subcategories'], [
            {'id': 'anime:series', 'label': 'Anime series'},
            {'id': 'anime:movie', 'label': 'Anime movies'},
        ])
        for id_, category in self.categories.items():
            if id_ != 'anime':
                self.assertEqual(category['subcategories'], [], id_)

    def test_subcategory_ids_match_the_review_filter(self):
        ids = {s['id'] for c in self.categories.values() for s in c['subcategories']}
        self.assertEqual(ids, set(SUBCATEGORY_FILTERS))

    def test_public_and_read_only(self):
        response = self.client.post('/api/v3/categories', {}, content_type='application/json')
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json()['code'], 'METHOD_NOT_ALLOWED')
