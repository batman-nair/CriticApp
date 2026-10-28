from importlib import import_module

from django.apps import apps
from django.test import TestCase

from review.models import ReviewItem


series_migration = import_module('review.migrations.0008_move_omdb_series_to_series_category')


class MoveSeriesToSeriesCategoryTest(TestCase):
    def _create_item(self, item_id, category, attr3):
        return ReviewItem.objects.create(
            item_id=item_id, category=category, title=item_id, image_url='https://example.com/i.png',
            year='2000', attr1='a', attr2='b', attr3=attr3, description='d', rating='5',
        )

    def test_moves_only_omdb_series(self):
        self._create_item('omdb_series', 'movie', 'series')
        self._create_item('omdb_movie', 'movie', 'movie')
        self._create_item('jikan_anime_1', 'anime', 'series')

        series_migration.move_series_to_series_category(apps, None)

        categories = dict(ReviewItem.objects.values_list('item_id', 'category'))
        self.assertEqual(categories, {
            'omdb_series': 'series',
            'omdb_movie': 'movie',
            'jikan_anime_1': 'anime',
        })

    def test_reverse_moves_series_back_to_movie(self):
        self._create_item('omdb_series', 'series', 'series')

        series_migration.move_series_back_to_movie_category(apps, None)

        self.assertEqual(ReviewItem.objects.get(item_id='omdb_series').category, 'movie')
