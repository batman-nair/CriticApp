from django.test import TestCase


class TestAPISchemaDocs(TestCase):
    def test_schema_endpoint_available(self):
        response = self.client.get('/api/schema/')
        self.assertEqual(response.status_code, 200)
        payload = response.content.decode('utf-8').lower()
        self.assertIn('openapi', payload)

    def test_swagger_docs_endpoint_available(self):
        response = self.client.get('/api/docs/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('swagger', response.content.decode('utf-8').lower())
