from django.contrib.auth import get_user_model
from django.test import TestCase


class HTMLViewSmokeTest(TestCase):
    """Smoke tests for template-rendering views: verify 200 status and correct template."""

    def test_view_reviews_page(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'review/view_reviews.html')

    def test_add_review_requires_login(self):
        response = self.client.get('/add')
        self.assertEqual(response.status_code, 302)

    def test_profile_page(self):
        get_user_model().objects.create_user(username='profileuser', password='pass12345')
        response = self.client.get('/u/profileuser')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'review/view_reviews.html')

    def test_profile_redirect_requires_login(self):
        response = self.client.get('/u')
        self.assertEqual(response.status_code, 302)

    def test_profile_redirect_authenticated(self):
        get_user_model().objects.create_user(username='rediruser', password='pass12345')
        self.client.login(username='rediruser', password='pass12345')
        response = self.client.get('/u')
        self.assertRedirects(response, '/u/rediruser', fetch_redirect_response=False)

    def test_health_check(self):
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'OK')
