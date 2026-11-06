import tempfile
from io import StringIO
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase

COMMITTED_SCHEMA = Path(settings.BASE_DIR) / 'openapi' / 'v3.yaml'


def generate_v3_schema():
    # The same command `make schema` runs.
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'v3.yaml'
        call_command(
            'spectacular',
            '--urlconf', 'critic.api.schema_urls',
            '--custom-settings', 'critic.api.schema.V3_SCHEMA_SETTINGS',
            '--validate', '--fail-on-warn',
            '--file', str(path),
            stderr=StringIO(),
        )
        return path.read_text()


class TestV3Schema(TestCase):
    def test_committed_schema_is_up_to_date(self):
        self.assertEqual(
            generate_v3_schema(),
            COMMITTED_SCHEMA.read_text(),
            'openapi/v3.yaml is stale. Run `make schema` and commit the result.',
        )

    def test_served_schema(self):
        response = self.client.get('/api/v3/schema', {'format': 'json'})
        self.assertEqual(response.status_code, 200)
        schema = response.json()
        # Without versioning_class=None the global versioning reports "3.0 (2.0)".
        self.assertEqual(schema['info']['version'], '3.0')
        self.assertIn('/api/v3/categories', schema['paths'])
        self.assertFalse([p for p in schema['paths'] if not p.startswith('/api/v3/')])
        responses = schema['paths']['/api/v3/categories']['get']['responses']
        self.assertIn('application/json', responses['200']['content'])
        self.assertIn('application/problem+json', responses['500']['content'])

    def test_swagger_docs(self):
        response = self.client.get('/api/v3/docs')
        self.assertEqual(response.status_code, 200)
        self.assertIn('swagger', response.content.decode().lower())

    def test_v2_schema_leaves_out_v3(self):
        out = StringIO()
        call_command('spectacular', stdout=out, stderr=StringIO())
        schema = out.getvalue()
        self.assertIn('/api/v2/reviews/', schema)
        self.assertNotIn('/api/v3/', schema)
