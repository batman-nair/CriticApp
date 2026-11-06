from django.test import Client, TestCase

from users.models import User


class TestV3CatchAll(TestCase):
    def assertNotFoundProblem(self, response):
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response['Content-Type'], 'application/problem+json')
        body = response.json()
        self.assertEqual(body['code'], 'NOT_FOUND')
        self.assertEqual(body['type'], 'about:blank')

    def test_unknown_path(self):
        self.assertNotFoundProblem(self.client.get('/api/v3/does-not-exist'))
        self.assertNotFoundProblem(self.client.get('/api/v3/nested/does/not/exist'))

    def test_unknown_path_any_method(self):
        self.assertNotFoundProblem(self.client.post('/api/v3/does-not-exist', {}, content_type='application/json'))
        self.assertNotFoundProblem(self.client.delete('/api/v3/does-not-exist'))

    def test_logged_in_post_without_csrf_token_is_still_404(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(User.objects.create_user(username='someone', password='pw'))
        self.assertNotFoundProblem(client.post('/api/v3/does-not-exist', {}, content_type='application/json'))

    def test_trailing_slash_is_unknown(self):
        self.assertNotFoundProblem(self.client.get('/api/v3/categories/'))

    def test_v3_root(self):
        self.assertNotFoundProblem(self.client.get('/api/v3/'))
