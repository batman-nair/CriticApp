from datetime import date, datetime, timezone
from decimal import Decimal
from importlib import import_module

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from review.models import Review, ReviewItem


series_migration = import_module('review.migrations.0008_move_omdb_series_to_series_category')
mal_prefix_migration = import_module('review.migrations.0011_rename_jikan_item_ids_to_mal')


class MoveSeriesToSeriesCategoryTest(TestCase):
    def _create_item(self, item_id, category, attr3):
        return ReviewItem.objects.create(
            item_id=item_id, category=category, title=item_id, image_url='https://example.com/i.png',
            year='2000', attr1='a', attr2='b', attr3=attr3, description='d', rating='5',
        )

    def test_moves_only_omdb_series(self):
        self._create_item('omdb_series', 'movie', 'series')
        self._create_item('omdb_movie', 'movie', 'movie')
        self._create_item('mal_anime_1', 'anime', 'series')

        series_migration.move_series_to_series_category(apps, None)

        categories = dict(ReviewItem.objects.values_list('item_id', 'category'))
        self.assertEqual(categories, {
            'omdb_series': 'series',
            'omdb_movie': 'movie',
            'mal_anime_1': 'anime',
        })

    def test_reverse_moves_series_back_to_movie(self):
        self._create_item('omdb_series', 'series', 'series')

        series_migration.move_series_back_to_movie_category(apps, None)

        self.assertEqual(ReviewItem.objects.get(item_id='omdb_series').category, 'movie')


class RenameJikanItemIdsToMalTest(TestCase):
    REFRESHED_AT = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    OLD_DATE = date(2020, 5, 6)

    def setUp(self):
        User = get_user_model()
        self.alice = User.objects.create_user(username='alice', password='123test123')
        self.bob = User.objects.create_user(username='bob', password='123test123')

    def _create_item(self, item_id, category):
        return ReviewItem.objects.create(
            item_id=item_id, category=category, title='Title ' + item_id, image_url='https://example.com/i.png',
            year='2001-2003', attr1='Genre', attr2='Studio', attr3='tv', language='Japanese',
            description='About ' + item_id, rating='8.5',
            last_refreshed_at=self.REFRESHED_AT, last_refresh_attempt_at=self.REFRESHED_AT,
            refresh_error_count=2,
        )

    def _create_review(self, user, item_id, rating):
        Review.objects.create(
            user=user, review_item_id=item_id, review_rating=Decimal(rating),
            review_data='Notes', review_tags='tag1,tag2',
        )

    def _create_data(self, anime_id, manga_id):
        for item_id, category in ((anime_id, 'anime'), (manga_id, 'manga'), ('omdb_tt1', 'movie'),
                                  ('igdb_5', 'game'), ('rawg_9', 'game')):
            self._create_item(item_id, category)
        self._create_review(self.alice, anime_id, '9.0')
        self._create_review(self.bob, anime_id, '7.5')
        self._create_review(self.alice, manga_id, '8.0')
        self._create_review(self.alice, 'omdb_tt1', '6.0')
        # Reviews keep their dates; auto_now would set today on a save().
        Review.objects.update(modified_date=self.OLD_DATE)

    def _items(self):
        """Every item's fields, by item id, without the id itself."""
        return {
            row.pop('item_id'): row
            for row in ReviewItem.objects.values()
        }

    def _reviews(self):
        return sorted(
            Review.objects.values_list(
                'user__username', 'review_item_id', 'review_rating', 'review_data', 'review_tags', 'modified_date',
            )
        )

    def _expected_reviews(self, anime_id, manga_id):
        return sorted([
            ('alice', anime_id, Decimal('9.00'), 'Notes', 'tag1,tag2', self.OLD_DATE),
            ('bob', anime_id, Decimal('7.50'), 'Notes', 'tag1,tag2', self.OLD_DATE),
            ('alice', manga_id, Decimal('8.00'), 'Notes', 'tag1,tag2', self.OLD_DATE),
            ('alice', 'omdb_tt1', Decimal('6.00'), 'Notes', 'tag1,tag2', self.OLD_DATE),
        ])

    def test_forward_renames_anime_and_manga_items_and_keeps_reviews(self):
        self._create_data('jikan_anime_1', 'jikan_manga_2')
        items_before = self._items()

        mal_prefix_migration.rename_jikan_to_mal(apps, None)

        items_after = self._items()
        self.assertEqual(set(items_after), {'mal_anime_1', 'mal_manga_2', 'omdb_tt1', 'igdb_5', 'rawg_9'})
        self.assertEqual(items_after['mal_anime_1'], items_before['jikan_anime_1'])
        self.assertEqual(items_after['mal_manga_2'], items_before['jikan_manga_2'])
        for item_id in ('omdb_tt1', 'igdb_5', 'rawg_9'):
            self.assertEqual(items_after[item_id], items_before[item_id])
        self.assertEqual(self._reviews(), self._expected_reviews('mal_anime_1', 'mal_manga_2'))

    def test_reverse_restores_jikan_ids(self):
        self._create_data('mal_anime_1', 'mal_manga_2')
        items_before = self._items()

        mal_prefix_migration.rename_mal_to_jikan(apps, None)

        items_after = self._items()
        self.assertEqual(set(items_after), {'jikan_anime_1', 'jikan_manga_2', 'omdb_tt1', 'igdb_5', 'rawg_9'})
        self.assertEqual(items_after['jikan_anime_1'], items_before['mal_anime_1'])
        self.assertEqual(items_after['jikan_manga_2'], items_before['mal_manga_2'])
        self.assertEqual(self._reviews(), self._expected_reviews('jikan_anime_1', 'jikan_manga_2'))

    def test_forward_then_reverse_restores_the_data(self):
        self._create_data('jikan_anime_1', 'jikan_manga_2')
        items_before = self._items()
        reviews_before = self._reviews()

        mal_prefix_migration.rename_jikan_to_mal(apps, None)
        mal_prefix_migration.rename_mal_to_jikan(apps, None)

        self.assertEqual(self._items(), items_before)
        self.assertEqual(self._reviews(), reviews_before)

    def test_existing_mal_id_fails_without_renaming(self):
        self._create_data('jikan_anime_1', 'jikan_manga_2')
        # Manga is renamed after anime, so anime's rename has to roll back too.
        self._create_item('mal_manga_2', 'manga')
        reviews_before = self._reviews()

        with self.assertRaises(IntegrityError), transaction.atomic():
            mal_prefix_migration.rename_jikan_to_mal(apps, None)

        self.assertEqual(
            set(ReviewItem.objects.values_list('item_id', flat=True)),
            {'jikan_anime_1', 'jikan_manga_2', 'mal_manga_2', 'omdb_tt1', 'igdb_5', 'rawg_9'},
        )
        self.assertEqual(self._reviews(), reviews_before)
