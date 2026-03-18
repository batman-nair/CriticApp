from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings


class MetricsEndpointTest(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.staff_user = user_model.objects.create_user(
            username='metrics_admin',
            password='test-pass-123',
            is_staff=True,
        )
        self.normal_user = user_model.objects.create_user(
            username='metrics_user',
            password='test-pass-123',
            is_staff=False,
        )

    def test_metrics_endpoint_default_open_for_scrape(self):
        response = self.client.get('/metrics/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/plain', response.headers['Content-Type'])

    @override_settings(METRICS_REQUIRE_AUTH=True)
    def test_metrics_endpoint_honors_auth_toggle(self):
        blocked_response = self.client.get('/metrics/')
        self.assertEqual(blocked_response.status_code, 403)

        self.client.login(username='metrics_user', password='test-pass-123')
        non_staff_response = self.client.get('/metrics/')
        self.assertEqual(non_staff_response.status_code, 403)

        self.client.logout()
        self.client.login(username='metrics_admin', password='test-pass-123')
        allowed_response = self.client.get('/metrics/')
        self.assertEqual(allowed_response.status_code, 200)
