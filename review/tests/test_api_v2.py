from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from review.models import Review, ReviewItem


class _FakeLookupAPI:
    def search(self, query):
        return {
            'response': 'True',
            'results': [
                {
                    'item_id': 'fake_1',
                    'title': query,
                    'image_url': 'https://example.com/image.png',
                    'year': '2024',
                }
            ],
        }

    def get_details(self, item_id):
        return {
            'response': 'True',
            'item_id': item_id,
            'title': 'Title',
            'image_url': 'https://example.com/image.png',
            'year': '2024',
            'attr1': 'A',
            'attr2': 'B',
            'attr3': 'C',
            'description': 'D',
            'rating': '8.0',
        }


class ReviewV2Phase2Test(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='phase2_user', password='pass12345')
        self.client.login(username='phase2_user', password='pass12345')

        self.movie_item = ReviewItem.objects.create(
            item_id='omdb_1111111',
            category='movie',
            title='Movie One',
            image_url='https://example.com/movie.png',
            year='2020',
            attr1='Action',
            attr2='Crew',
            attr3='Movie',
            description='Movie description',
            rating='8.0',
        )
        self.game_item = ReviewItem.objects.create(
            item_id='rawg_1111111',
            category='game',
            title='Game One',
            image_url='https://example.com/game.png',
            year='2021',
            attr1='RPG',
            attr2='Studio',
            attr3='PC',
            description='Game description',
            rating='7.0',
        )

        Review.objects.create(user=self.user, review_item=self.movie_item, review_rating=Decimal('8.5'))
        Review.objects.create(user=self.user, review_item=self.game_item, review_rating=Decimal('7.5'))
        second_user = get_user_model().objects.create_user(username='phase2_user_2', password='pass12345')
        Review.objects.create(user=second_user, review_item=self.movie_item, review_rating=Decimal('9.0'))

    def test_v2_review_list_returns_pagination_meta(self):
        response = self.client.get('/api/v2/reviews/', {'limit': 1, 'offset': 0})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        json_data = response.json()
        self.assertIn('data', json_data)
        self.assertIn('meta', json_data)
        self.assertIn('pagination', json_data['meta'])
        self.assertEqual(json_data['meta']['version'], '2.0')
        self.assertEqual(json_data['meta']['pagination']['limit'], 1)
        self.assertEqual(json_data['meta']['pagination']['offset'], 0)
        self.assertEqual(len(json_data['data']), 1)

    def test_v2_review_list_without_limit_offset(self):
        response = self.client.get('/api/v2/reviews/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        json_data = response.json()
        self.assertIn('data', json_data)
        self.assertIn('meta', json_data)
        self.assertIn('pagination', json_data['meta'])
        self.assertEqual(json_data['meta']['version'], '2.0')
        self.assertEqual(json_data['meta']['pagination']['limit'], 20)
        self.assertEqual(json_data['meta']['pagination']['offset'], 0)

    def test_v2_categories_filter_uses_include_semantics(self):
        response = self.client.get('/api/v2/reviews/', {'categories': 'movie'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        json_data = response.json()
        categories = {row['review_item']['category'] for row in json_data['data']}
        self.assertEqual(categories, {'movie'})

    # --- item_id filter (replaces get_user_review) ---

    def test_v2_review_list_filter_by_item_id(self):
        response = self.client.get('/api/v2/reviews/', {'item_id': 'omdb_1111111'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertEqual(len(json_data['data']), 2)  # both users reviewed this movie
        for row in json_data['data']:
            self.assertEqual(row['review_item']['item_id'], 'omdb_1111111')

    def test_v2_review_list_filter_by_item_id_and_username(self):
        response = self.client.get('/api/v2/reviews/', {
            'item_id': 'omdb_1111111',
            'username': 'phase2_user',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertEqual(len(json_data['data']), 1)
        self.assertEqual(json_data['data'][0]['review_item']['item_id'], 'omdb_1111111')
        self.assertEqual(json_data['data'][0]['user'], 'phase2_user')

    def test_v2_review_list_filter_by_nonexistent_item_id(self):
        response = self.client.get('/api/v2/reviews/', {'item_id': 'nonexistent_999'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertEqual(len(json_data['data']), 0)

    # --- Removed v2 endpoints return 404 ---

    def test_v2_get_user_review_removed(self):
        response = self.client.get('/api/v2/reviews/get_user_review/omdb_1111111/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_v2_post_review_removed(self):
        response = self.client.post('/api/v2/reviews/post_review/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_v2_create_review_removed(self):
        response = self.client.post('/api/v2/reviews/create/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Create review via POST /api/v2/reviews/ ---

    def test_v2_create_review_success(self):
        new_item = ReviewItem.objects.create(
            item_id='omdb_9999999',
            category='movie',
            title='New Movie',
            image_url='https://example.com/new.png',
            year='2025',
            attr1='Drama',
            attr2='Cast',
            attr3='Movie',
            description='A new movie',
            rating='7.0',
        )
        response = self.client.post('/api/v2/reviews/', {
            'review_item': new_item.pk,
            'review_rating': '8.0',
            'review_data': 'Great film!',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        json_data = response.json()
        self.assertIn('data', json_data)
        self.assertIn('meta', json_data)
        self.assertEqual(json_data['meta']['version'], '2.0')
        self.assertEqual(json_data['data']['user'], 'phase2_user')

    def test_v2_create_review_duplicate(self):
        response = self.client.post('/api/v2/reviews/', {
            'review_item': self.movie_item.pk,
            'review_rating': '6.0',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        json_data = response.json()
        self.assertIn('error', json_data)
        self.assertEqual(json_data['error']['code'], 'DUPLICATE_REVIEW')

    def test_v2_create_review_unauthenticated(self):
        self.client.logout()
        response = self.client.post('/api/v2/reviews/', {
            'review_item': self.movie_item.pk,
            'review_rating': '6.0',
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class LookupV2Test(APITestCase):
    """Tests for v2 external lookup endpoints."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(username='lookup_user', password='pass12345')
        self.client.login(username='lookup_user', password='pass12345')
        self._original_category_to_api = None

    def tearDown(self):
        if self._original_category_to_api is not None:
            from review import views
            views.CATEGORY_TO_API.update(self._original_category_to_api)

    def _patch_category_api(self):
        from review import views
        self._original_category_to_api = dict(views.CATEGORY_TO_API)
        views.CATEGORY_TO_API['movie'] = _FakeLookupAPI()
        views.CATEGORY_TO_API['game'] = _FakeLookupAPI()

    # --- SearchItemV2 ---

    def test_search_v2_returns_envelope(self):
        self._patch_category_api()
        response = self.client.get('/api/v2/lookup/search/movie/test/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertIn('data', json_data)
        self.assertIn('meta', json_data)
        self.assertEqual(json_data['meta']['version'], '2.0')
        self.assertIsInstance(json_data['data'], list)
        self.assertTrue(len(json_data['data']) > 0)

    def test_search_v2_invalid_category(self):
        response = self.client.get('/api/v2/lookup/search/invalid/test/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        json_data = response.json()
        self.assertIn('error', json_data)
        self.assertEqual(json_data['error']['code'], 'INVALID_CATEGORY')

    def test_search_v2_unauthenticated(self):
        self.client.logout()
        response = self.client.get('/api/v2/lookup/search/movie/test/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- GetItemInfoV2 ---

    def test_get_item_info_v2_returns_envelope(self):
        self._patch_category_api()
        response = self.client.get('/api/v2/lookup/item/movie/omdb_tt9999999/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertIn('data', json_data)
        self.assertIn('meta', json_data)
        self.assertEqual(json_data['meta']['version'], '2.0')
        self.assertIn('title', json_data['data'])

    def test_get_item_info_v2_returns_cached_item(self):
        ReviewItem.objects.create(
            item_id='omdb_cached',
            category='movie',
            title='Cached Movie',
            image_url='https://example.com/img.png',
            year='2020',
            attr1='A', attr2='B', attr3='C',
            description='Desc',
            rating='7.0',
        )
        response = self.client.get('/api/v2/lookup/item/movie/omdb_cached/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertEqual(json_data['data']['title'], 'Cached Movie')

    def test_get_item_info_v2_persists_new_item(self):
        self._patch_category_api()
        self.assertFalse(ReviewItem.objects.filter(item_id='omdb_tt8888888').exists())
        response = self.client.get('/api/v2/lookup/item/movie/omdb_tt8888888/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ReviewItem.objects.filter(item_id='omdb_tt8888888').exists())

    def test_get_item_info_v2_invalid_category(self):
        response = self.client.get('/api/v2/lookup/item/invalid/test_id/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        json_data = response.json()
        self.assertEqual(json_data['error']['code'], 'INVALID_CATEGORY')

    def test_get_item_info_v2_unauthenticated(self):
        self.client.logout()
        response = self.client.get('/api/v2/lookup/item/movie/omdb_tt1111111/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

