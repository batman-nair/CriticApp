from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from review.models import Review, ReviewItem


class ReviewDetailV2Test(APITestCase):
    """Tests for v2 retrieve/update/destroy endpoints."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(username='detail_user', password='pass12345')
        self.other_user = get_user_model().objects.create_user(username='other_user', password='pass12345')
        self.client.login(username='detail_user', password='pass12345')

        self.item = ReviewItem.objects.create(
            item_id='omdb_detail_1',
            category='movie',
            title='Detail Movie',
            image_url='https://example.com/img.png',
            year='2024',
            attr1='A', attr2='B', attr3='C',
            description='Description',
            rating='8.0',
        )
        self.review = Review.objects.create(
            user=self.user,
            review_item=self.item,
            review_rating=Decimal('7.5'),
            review_data='Original review text',
        )

    def test_retrieve_review(self):
        response = self.client.get(f'/api/v2/reviews/{self.review.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertIn('data', json_data)
        self.assertEqual(json_data['meta']['version'], '2.0')
        self.assertEqual(json_data['data']['review_data'], 'Original review text')

    def test_retrieve_review_unauthenticated(self):
        self.client.logout()
        response = self.client.get(f'/api/v2/reviews/{self.review.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_review_as_owner(self):
        response = self.client.put(
            f'/api/v2/reviews/{self.review.pk}/',
            {'review_item': self.item.pk, 'review_rating': '9.0', 'review_data': 'Updated text'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        json_data = response.json()
        self.assertIn('data', json_data)
        self.assertEqual(json_data['meta']['version'], '2.0')
        self.review.refresh_from_db()
        self.assertEqual(self.review.review_rating, Decimal('9.0'))
        self.assertEqual(self.review.review_data, 'Updated text')

    def test_update_review_as_non_owner_forbidden(self):
        self.client.logout()
        self.client.login(username='other_user', password='pass12345')
        response = self.client.put(
            f'/api/v2/reviews/{self.review.pk}/',
            {'review_item': self.item.pk, 'review_rating': '1.0', 'review_data': 'Hacked'},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.review.refresh_from_db()
        self.assertEqual(self.review.review_data, 'Original review text')

    def test_delete_review_as_owner(self):
        response = self.client.delete(f'/api/v2/reviews/{self.review.pk}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Review.objects.filter(pk=self.review.pk).exists())

    def test_delete_review_as_non_owner_forbidden(self):
        self.client.logout()
        self.client.login(username='other_user', password='pass12345')
        response = self.client.delete(f'/api/v2/reviews/{self.review.pk}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Review.objects.filter(pk=self.review.pk).exists())

    def test_retrieve_nonexistent_review(self):
        response = self.client.get('/api/v2/reviews/99999/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
