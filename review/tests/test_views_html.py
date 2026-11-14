from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from review.models import UpstreamApiUsage

USAGE_URL = reverse('admin:review_upstreamapiusage_changelist')


class HTMLViewSmokeTest(TestCase):
    """Smoke tests for the pages Django still serves: health and the admin (with its usage page)."""

    def test_health_check(self):
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'OK')

    def test_api_usage_page_redirects_anonymous_users(self):
        response = self.client.get(USAGE_URL)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response['Location'].startswith('/api/admin/login/'))

    def test_api_usage_page_redirects_non_staff_users(self):
        get_user_model().objects.create_user(username='plainuser', password='pass12345')
        self.client.login(username='plainuser', password='pass12345')
        response = self.client.get(USAGE_URL)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response['Location'].startswith('/api/admin/login/'))

    def test_api_usage_page_shows_counts_for_staff(self):
        UpstreamApiUsage.objects.create(provider='omdb', date=timezone.now().date(), requests=812)
        get_user_model().objects.create_user(username='staffuser', password='pass12345', is_staff=True)
        self.client.login(username='staffuser', password='pass12345')
        response = self.client.get(USAGE_URL)
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'review/api_usage.html')
        self.assertTemplateUsed(response, 'admin/base_site.html')
        # The admin context: page title and the user tools (logout link).
        self.assertContains(response, '<h1>API usage</h1>', html=True)
        self.assertContains(response, 'id="user-tools"')
        self.assertContains(response, '812')
        self.assertContains(response, '1000 / today')
        self.assertContains(response, 'table-warning')

    def test_api_usage_page_is_listed_in_the_admin_and_read_only(self):
        UpstreamApiUsage.objects.create(provider='omdb', date=timezone.now().date(), requests=5)
        usage = UpstreamApiUsage.objects.get()
        get_user_model().objects.create_user(username='staffonly', password='pass12345', is_staff=True)
        self.client.login(username='staffonly', password='pass12345')
        self.assertContains(self.client.get('/api/admin/'), f'href="{USAGE_URL}"')
        for path in (
            '/api/admin/review/upstreamapiusage/add/',
            f'/api/admin/review/upstreamapiusage/{usage.pk}/change/',
            f'/api/admin/review/upstreamapiusage/{usage.pk}/delete/',
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 403)

    def test_admin_and_usage_urls_are_under_api(self):
        self.assertEqual(reverse('admin:index'), '/api/admin/')
        self.assertEqual(USAGE_URL, '/api/admin/review/upstreamapiusage/')

    def test_admin_login_page_loads(self):
        response = self.client.get('/api/admin/login/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'admin/login.html')

    def test_admin_index_loads_for_staff(self):
        get_user_model().objects.create_user(username='adminstaff', password='pass12345', is_staff=True)
        self.client.login(username='adminstaff', password='pass12345')
        response = self.client.get('/api/admin/')
        self.assertEqual(response.status_code, 200)

    def test_old_admin_and_usage_paths_are_gone(self):
        for path in ('/admin/', '/usage/', '/api/usage/'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_removed_pages_and_v2_are_gone(self):
        # The old Django UI, its login/logout and API v2 were removed in #114.
        paths = (
            '/', '/add', '/u', '/u/someone', '/profile/login', '/profile/logout',
            '/api/v2/reviews/', '/api/v2/reviews/1/', '/api/v2/lookup/search/movie/?q=x',
            '/api/v2/lookup/item/movie/omdb_tt1/', '/favicon.ico',
        )
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)
