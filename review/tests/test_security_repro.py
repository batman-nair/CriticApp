
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

    def test_review_post_idor_vulnerability(self):
        # User B logs in
        self.client.force_authenticate(user=self.user_b)

        # User B attempts to update User A's review
        data = {
            'id': self.review_a.id,
            'review_item': self.review_item.pk,
            'review_rating': 1.0,
            'review_data': 'Hacked',
            'review_tags': 'hacked'
        }

        # This endpoint redirects on success/failure
        response = self.client.post('/api/reviews/post_review/', data, format='json')

        # Expect redirect
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)

        # Reload review_a from DB
        self.review_a.refresh_from_db()

        # SECURITY CHECKS:
        # The data should NOT be updated
        self.assertEqual(self.review_a.review_data, 'Original Data', "VULNERABILITY: Review data was maliciously updated")
        # The user should NOT be changed
        self.assertEqual(self.review_a.user, self.user_a, "VULNERABILITY: Review ownership was stolen")
