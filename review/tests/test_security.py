
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from model_bakery import baker
from review.models import Review, ReviewItem

class ReviewSecurityReproTest(APITestCase):
    def setUp(self):
        self.user_a = baker.make(get_user_model(), username='victim')
        self.user_b = baker.make(get_user_model(), username='attacker')
        self.review_item = baker.make(ReviewItem)

        # Review owned by User A
        self.review_a = baker.make(
            Review,
            user=self.user_a,
            review_item=self.review_item,
            review_rating=5.0,
            review_data='Original Data'
        )

    def test_review_update_as_non_owner_is_rejected(self):
        self.client.force_authenticate(user=self.user_b)

        data = {
            'review_rating': 1.0,
            'review_data': 'Hacked',
            'review_tags': 'hacked'
        }

        response = self.client.patch(f'/api/v2/reviews/{self.review_a.id}/', data, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.review_a.refresh_from_db()

        self.assertEqual(self.review_a.review_data, 'Original Data', "VULNERABILITY: Review data was maliciously updated")
        self.assertEqual(self.review_a.user, self.user_a, "VULNERABILITY: Review ownership was stolen")
