import tempfile
from io import StringIO
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from django.urls import path
from drf_spectacular.generators import SchemaGenerator
from drf_spectacular.settings import patched_settings
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.mixins import ListModelMixin

from critic.api.schema import V3_SCHEMA_SETTINGS, V3_SESSION_AUTH_PATHS, wrapped
from critic.api.views import V3GenericAPIView

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


class ThingSerializer(serializers.Serializer):
    name = serializers.CharField()


class DeclaredThingList(ListModelMixin, V3GenericAPIView):
    serializer_class = ThingSerializer

    @extend_schema(responses={200: wrapped(ThingSerializer, paginated=True)})
    def get(self, request):
        return self.list(request)


class UndeclaredThingList(ListModelMixin, V3GenericAPIView):
    serializer_class = ThingSerializer

    def get(self, request):
        return self.list(request)


def ok_schema(view_class):
    # Test-only views, generated in-process: nothing is added to the real urlconf.
    with patched_settings(V3_SCHEMA_SETTINGS):
        generator = SchemaGenerator(patterns=[path('api/v3/things', view_class.as_view())])
        schema = generator.get_schema(request=None, public=True)
    content = schema['paths']['/api/v3/things']['get']['responses']['200']['content']
    return schema, content['application/json']['schema']


class TestWrappedHelper(SimpleTestCase):
    def test_equivalent_calls_share_one_class(self):
        self.assertIs(wrapped(ThingSerializer), wrapped(ThingSerializer, many=False))
        self.assertIs(wrapped(ThingSerializer, paginated=True), wrapped(ThingSerializer, many=True, paginated=True))
        self.assertIsNot(wrapped(ThingSerializer), wrapped(ThingSerializer, many=True))

    def test_declared_page_response_is_not_wrapped_again_on_list_views(self):
        _, ok = ok_schema(DeclaredThingList)
        self.assertEqual(ok, {'$ref': '#/components/schemas/ThingPageResponse'})

    def test_undeclared_list_view_gets_the_v3_envelope(self):
        schema, ok = ok_schema(UndeclaredThingList)
        component = schema['components']['schemas'][ok['$ref'].rsplit('/', 1)[1]]
        self.assertEqual(set(component['properties']), {'data', 'meta'})
        self.assertEqual(component['properties']['data']['type'], 'array')
        self.assertIn('pagination', component['properties']['meta']['properties'])


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
        paths = set(schema['paths'])
        self.assertLessEqual(V3_SESSION_AUTH_PATHS, paths)
        self.assertFalse([p for p in paths - V3_SESSION_AUTH_PATHS if not p.startswith('/api/v3/')])
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
        for path in V3_SESSION_AUTH_PATHS:
            self.assertNotIn(f'{path}:', schema)
        self.assertIn('/api/auth/me/', schema)
        self.assertIn('/api/auth/token/blacklist/', schema)
