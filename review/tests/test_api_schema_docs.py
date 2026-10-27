from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class TestAPISchemaDocs(TestCase):
    def test_schema_generates_without_errors_or_warnings(self):
        # --fail-on-warn also fails on errors, e.g. a view whose serializer
        # can't be guessed and is silently left out of the schema.
        out = StringIO()
        call_command('spectacular', '--validate', '--fail-on-warn', stdout=out, stderr=StringIO())
        schema = out.getvalue()
        self.assertIn('/api/auth/me/', schema)
        self.assertIn('/api/auth/register/', schema)

    def test_schema_endpoint_available(self):
        response = self.client.get('/api/schema/')
        self.assertEqual(response.status_code, 200)
        payload = response.content.decode('utf-8').lower()
        self.assertIn('openapi', payload)

    def test_swagger_docs_endpoint_available(self):
        response = self.client.get('/api/docs/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('swagger', response.content.decode('utf-8').lower())
