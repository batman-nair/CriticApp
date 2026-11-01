from django.test import TestCase
from django.contrib.auth import get_user_model

from model_bakery import baker

from review.models import Review, ReviewItem
from review.utils import review_utils
from review.tests.factories import create_review_item


class ReviewQueryTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='testuser', password='123test123')
        self.review_item1 = create_review_item()
        self.review1 = Review(user=self.user, review_item=self.review_item1, review_rating=9.5)
        self.review1.save()
        self.fake_reviews = [baker.make(Review) for _ in range(10)]

    def test_basic_review_query(self):
        reviews = review_utils.get_filtered_review_objects()
        self.assertGreaterEqual(len(reviews), 10)
        json_data = review_utils.convert_reviews_to_json(reviews)
        self.assertTrue("results" in json_data)
        self.assertGreaterEqual(len(json_data["results"]), 10)
        review_json = json_data["results"][0]
        self.assertTrue(all(field in review_json for field in ["review_data", "review_rating", "modified_date", "review_item"]))

    def test_query_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='Cool')
        self.assertTrue(len(reviews))
        reviews = review_utils.get_filtered_review_objects(query='This should not hopefull match any random string')
        self.assertFalse(len(reviews))

    def test_advanced_query_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='title cool attr1 attr2')
        self.assertTrue(len(reviews), 'Multiple field matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='attr1')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='attr2')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='desc')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='Cool but not title')
        self.assertFalse(len(reviews), 'Partial match shouldnt show up')

    def test_language_query_filter(self):
        item = create_review_item(item_id='test_lang', title='Other title', language='Japanese, English')
        Review.objects.create(user=self.user, review_item=item, review_rating=8)
        reviews = review_utils.get_filtered_review_objects(query='japanese')
        self.assertEqual([review.review_item.item_id for review in reviews], ['test_lang'])

    def test_username_filter(self):
        reviews = review_utils.get_filtered_review_objects(username='testuser')
        self.assertTrue(len(reviews))
        reviews = review_utils.get_filtered_review_objects(username='Please dont match a random string')
        self.assertFalse(len(reviews))

    def test_category_filter(self):
        reviews = review_utils.get_filtered_review_objects(filter_categories=['movie'])
        self.assertTrue(all([review.review_item.category != 'movie' for review in reviews]))

    def test_book_category_filter(self):
        item = create_review_item(item_id='olib_OL27482W', category='book', title='The Hobbit')
        Review.objects.create(user=self.user, review_item=item, review_rating=8)
        reviews = review_utils.get_filtered_review_objects(categories=['book'])
        self.assertEqual([review.review_item.item_id for review in reviews], ['olib_OL27482W'])

    def test_ordering_filter(self):
        reviews = review_utils.get_filtered_review_objects(ordering='alpha')
        reviews = list(reviews)
        self.assertTrue(all(val[0].review_item.title <= val[1].review_item.title for val in zip(reviews[:-1], reviews[1:])))

    def test_multi_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='Cool', username='testuser', filter_categories=['random'])
        self.assertEqual(len(reviews), 1)
        self.assertEqual(reviews[0].review_rating, 9.5)


class AnimeSubcategoryFilterTest(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username='animefan', password='123test123')
        items = [
            ('jikan_anime_1', 'anime', 'tv'),
            ('jikan_anime_2', 'anime', 'movie'),
            ('jikan_anime_3', 'anime', 'Movie'),  # stored by the old Jikan API
            ('jikan_anime_4', 'anime', 'ova'),
            ('omdb_tt1', 'movie', 'movie'),
        ]
        for item_id, category, attr3 in items:
            item = create_review_item(item_id=item_id, category=category, attr3=attr3)
            Review.objects.create(user=user, review_item=item, review_rating=8)

    def _item_ids(self, **kwargs):
        return sorted(review.review_item.item_id for review in review_utils.get_filtered_review_objects(**kwargs))

    def test_include_anime_movies(self):
        self.assertEqual(self._item_ids(categories=['anime:movie']), ['jikan_anime_2', 'jikan_anime_3'])

    def test_include_anime_series(self):
        self.assertEqual(self._item_ids(categories=['anime:series']), ['jikan_anime_1', 'jikan_anime_4'])

    def test_include_mixes_categories_and_subcategories(self):
        self.assertEqual(self._item_ids(categories=['movie,anime:movie']), ['jikan_anime_2', 'jikan_anime_3', 'omdb_tt1'])

    def test_exclude_anime_movies(self):
        self.assertEqual(self._item_ids(exclude_categories=['anime:movie']), ['jikan_anime_1', 'jikan_anime_4', 'omdb_tt1'])

    def test_exclude_anime_series_and_movie_category(self):
        self.assertEqual(self._item_ids(exclude_categories=['anime:series', 'movie']), ['jikan_anime_2', 'jikan_anime_3'])

    def test_unknown_subcategory_matches_nothing(self):
        self.assertEqual(self._item_ids(categories=['anime:musical']), [])
        self.assertEqual(len(self._item_ids(exclude_categories=['anime:musical'])), 5)


class LanguageFilterTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='polyglot', password='123test123')
        other_user = get_user_model().objects.create_user(username='other', password='123test123')
        items = [
            ('omdb_ja_first', 'movie', 'Japanese, English', self.user),
            ('omdb_ja_last', 'series', 'English, Japanese', self.user),
            ('omdb_ko', 'movie', 'Korean', self.user),
            ('omdb_old_en', 'movie', 'Old English', self.user),
            ('rawg_game', 'game', '', self.user),
            ('omdb_de', 'series', 'German', other_user),
        ]
        for item_id, category, language, user in items:
            item = create_review_item(item_id=item_id, title=item_id, category=category, language=language)
            Review.objects.create(user=user, review_item=item, review_rating=8)

    def _item_ids(self, **kwargs):
        return sorted(review.review_item.item_id for review in review_utils.get_filtered_review_objects(**kwargs))

    def test_matches_language_in_any_position(self):
        self.assertEqual(self._item_ids(languages=['Japanese']), ['omdb_ja_first', 'omdb_ja_last'])

    def test_multiple_languages_match_any(self):
        self.assertEqual(self._item_ids(languages=['Korean', 'German']), ['omdb_de', 'omdb_ko'])
        self.assertEqual(self._item_ids(languages=['Korean,German']), ['omdb_de', 'omdb_ko'])

    def test_matches_whole_entries_only(self):
        self.assertEqual(self._item_ids(languages=['English']), ['omdb_ja_first', 'omdb_ja_last'])
        self.assertEqual(self._item_ids(languages=['Old English']), ['omdb_old_en'])
        # Every picked language is matched as a whole entry, not just the first one.
        self.assertEqual(self._item_ids(languages=['Korean', 'English']), ['omdb_ja_first', 'omdb_ja_last', 'omdb_ko'])

    def test_case_insensitive(self):
        self.assertEqual(self._item_ids(languages=['japanese']), ['omdb_ja_first', 'omdb_ja_last'])

    def test_items_without_language(self):
        self.assertNotIn('rawg_game', self._item_ids(languages=['English']))
        self.assertIn('rawg_game', self._item_ids())

    def test_combines_with_categories(self):
        self.assertEqual(self._item_ids(languages=['Japanese'], categories=['series']), ['omdb_ja_last'])

    def test_works_with_alpha_ordering(self):
        reviews = review_utils.get_filtered_review_objects(languages=['Japanese', 'Korean'], ordering='alpha')
        self.assertEqual([review.review_item.item_id for review in reviews], ['omdb_ja_first', 'omdb_ja_last', 'omdb_ko'])

    def test_review_languages_sorted_by_count_then_name(self):
        self.assertEqual(
            review_utils.get_review_languages(),
            ['English', 'Japanese', 'German', 'Korean', 'Old English'],
        )

    def test_review_languages_count_every_review_of_an_item(self):
        korean_item = ReviewItem.objects.get(item_id='omdb_ko')
        for username in ('ko1', 'ko2'):
            user = get_user_model().objects.create_user(username=username, password='123test123')
            Review.objects.create(user=user, review_item=korean_item, review_rating=7)
        self.assertEqual(review_utils.get_review_languages()[0], 'Korean')

    def test_review_languages_for_user(self):
        self.assertEqual(
            review_utils.get_review_languages('polyglot'),
            ['English', 'Japanese', 'Korean', 'Old English'],
        )
        self.assertEqual(review_utils.get_review_languages('other'), ['German'])
