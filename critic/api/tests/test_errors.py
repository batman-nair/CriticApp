import json
from unittest import mock

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.signals import got_request_exception
from django.http import Http404
from django.test import SimpleTestCase
from django.utils.translation import gettext_lazy
from rest_framework import permissions, serializers
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.throttling import ScopedRateThrottle

from critic.api.errors import ApiError
from critic.api.responses import api_response
from critic.api.views import V3APIView
from users.models import User

factory = APIRequestFactory()


class RatingSerializer(serializers.Serializer):
    rating = serializers.DecimalField(max_digits=4, decimal_places=2, max_value=10)


class NameSerializer(serializers.Serializer):
    name = serializers.CharField()


class NestedSerializer(serializers.Serializer):
    items = NameSerializer(many=True)


class EitherSerializer(serializers.Serializer):
    a = serializers.CharField(required=False)
    b = serializers.CharField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError('Give a or b.')
        return attrs


class EchoView(V3APIView):
    """GET answers 200; POST validates `serializer_class`."""
    permission_classes = [permissions.AllowAny]
    serializer_class = RatingSerializer

    def get(self, request):
        return api_response({'ok': True})

    def post(self, request):
        self.serializer_class(data=request.data).is_valid(raise_exception=True)
        return api_response({'ok': True})


class RaisingView(V3APIView):
    permission_classes = [permissions.AllowAny]
    exc = None

    def get(self, request):
        raise self.exc


class AuthView(V3APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return api_response({'ok': True})


class DenyAll(permissions.BasePermission):
    def has_permission(self, request, view):
        return False


class DenyView(V3APIView):
    permission_classes = [DenyAll]

    def get(self, request):
        return api_response({'ok': True})


class SearchView(EchoView):
    throttle_scope = 'search'


def call(view, request):
    response = view(request)
    response.render()
    return response


class ProblemAssertions:
    def assertProblem(self, response, status, code):
        self.assertEqual(response.status_code, status)
        self.assertEqual(response['Content-Type'], 'application/problem+json')
        body = json.loads(response.content)
        self.assertEqual(body['type'], 'about:blank')
        self.assertEqual(body['status'], status)
        self.assertEqual(body['code'], code)
        self.assertIsInstance(body['title'], str)
        self.assertIsInstance(body['detail'], str)
        return body


class TestValidationErrors(ProblemAssertions, SimpleTestCase):
    def test_field_error(self):
        response = call(EchoView.as_view(), factory.post('/x', {'rating': '11'}, format='json'))
        body = self.assertProblem(response, 400, 'VALIDATION_ERROR')
        self.assertEqual(body['title'], 'Bad Request')
        self.assertEqual(body['detail'], 'Some fields are invalid.')
        self.assertEqual(body['errors'], [{
            'field': 'rating',
            'code': 'max_value',
            'message': 'Ensure this value is less than or equal to 10.',
        }])

    def test_nested_field_uses_dotted_path(self):
        view = EchoView.as_view(serializer_class=NestedSerializer)
        response = call(view, factory.post('/x', {'items': [{'name': 'a'}, {}]}, format='json'))
        body = self.assertProblem(response, 400, 'VALIDATION_ERROR')
        self.assertEqual(body['errors'], [
            {'field': 'items.1.name', 'code': 'required', 'message': 'This field is required.'},
        ])

    def test_non_field_error_has_no_field(self):
        view = EchoView.as_view(serializer_class=EitherSerializer)
        body = self.assertProblem(call(view, factory.post('/x', {}, format='json')), 400, 'VALIDATION_ERROR')
        self.assertEqual(body['errors'], [{'field': None, 'code': 'invalid', 'message': 'Give a or b.'}])

    def test_bare_validation_error_has_no_field(self):
        view = RaisingView.as_view(exc=ValidationError('Bad thing.'))
        body = self.assertProblem(call(view, factory.get('/x')), 400, 'VALIDATION_ERROR')
        self.assertEqual(body['errors'], [{'field': None, 'code': 'invalid', 'message': 'Bad thing.'}])

    def test_other_errors_have_no_errors_list(self):
        view = RaisingView.as_view(exc=NotFound())
        body = self.assertProblem(call(view, factory.get('/x')), 404, 'NOT_FOUND')
        self.assertNotIn('errors', body)


class TestRequestErrors(ProblemAssertions, SimpleTestCase):
    def test_malformed_json(self):
        request = factory.post('/x', '{"rating": ', content_type='application/json')
        self.assertProblem(call(EchoView.as_view(), request), 400, 'PARSE_ERROR')

    def test_unsupported_media_type(self):
        request = factory.post('/x', {'rating': '5'}, format='multipart')
        body = self.assertProblem(call(EchoView.as_view(), request), 415, 'UNSUPPORTED_MEDIA_TYPE')
        self.assertEqual(body['title'], 'Unsupported Media Type')

    def test_method_not_allowed(self):
        response = call(EchoView.as_view(), factory.put('/x', {}, format='json'))
        self.assertProblem(response, 405, 'METHOD_NOT_ALLOWED')
        self.assertIn('GET', response['Allow'])
        self.assertIn('POST', response['Allow'])

    def test_not_acceptable(self):
        response = call(EchoView.as_view(), factory.get('/x', HTTP_ACCEPT='text/html'))
        self.assertProblem(response, 406, 'NOT_ACCEPTABLE')


class TestAuthErrors(ProblemAssertions, SimpleTestCase):
    def test_not_logged_in(self):
        response = call(AuthView.as_view(), factory.get('/x'))
        body = self.assertProblem(response, 401, 'UNAUTHENTICATED')
        self.assertEqual(body['title'], 'Unauthorized')
        self.assertEqual(response['WWW-Authenticate'], 'Bearer realm="api"')

    def test_invalid_token_has_no_internals(self):
        request = factory.get('/x', HTTP_AUTHORIZATION='Bearer not-a-token')
        response = call(AuthView.as_view(), request)
        self.assertProblem(response, 401, 'UNAUTHENTICATED')
        self.assertIn('WWW-Authenticate', response)
        content = response.content.decode()
        self.assertNotIn('token_class', content)
        self.assertNotIn('messages', content)

    def test_permission_denied(self):
        request = factory.get('/x')
        force_authenticate(request, user=User(username='someone'))
        self.assertProblem(call(DenyView.as_view(), request), 403, 'PERMISSION_DENIED')

    def test_django_and_drf_permission_denied(self):
        for exc in (DjangoPermissionDenied(), PermissionDenied()):
            with self.subTest(exc=type(exc).__module__):
                view = RaisingView.as_view(exc=exc)
                self.assertProblem(call(view, factory.get('/x')), 403, 'PERMISSION_DENIED')


class TestNotFound(ProblemAssertions, SimpleTestCase):
    def test_django_http404_and_drf_not_found(self):
        for exc in (Http404(), NotFound()):
            with self.subTest(exc=type(exc).__name__):
                view = RaisingView.as_view(exc=exc)
                body = self.assertProblem(call(view, factory.get('/x')), 404, 'NOT_FOUND')
                self.assertEqual(body['title'], 'Not Found')


@mock.patch.object(ScopedRateThrottle, 'THROTTLE_RATES', {'search': '1/min'})
class TestRateLimit(ProblemAssertions, SimpleTestCase):
    def test_second_request_is_rate_limited(self):
        view = SearchView.as_view()
        self.assertEqual(call(view, factory.get('/x')).status_code, 200)
        response = call(view, factory.get('/x'))
        body = self.assertProblem(response, 429, 'RATE_LIMITED')
        self.assertEqual(body['title'], 'Too Many Requests')
        self.assertGreater(int(response['Retry-After']), 0)

    def test_forged_forwarded_for_prefix_shares_the_bucket(self):
        view = SearchView.as_view()
        first = factory.get('/x', HTTP_X_FORWARDED_FOR='1.1.1.1, 10.0.0.9')
        forged = factory.get('/x', HTTP_X_FORWARDED_FOR='2.2.2.2, 10.0.0.9')
        self.assertEqual(call(view, first).status_code, 200)
        self.assertProblem(call(view, forged), 429, 'RATE_LIMITED')

    def test_different_clients_have_separate_buckets(self):
        view = SearchView.as_view()
        one = factory.get('/x', HTTP_X_FORWARDED_FOR='10.0.0.8')
        two = factory.get('/x', HTTP_X_FORWARDED_FOR='10.0.0.9')
        self.assertEqual(call(view, one).status_code, 200)
        self.assertEqual(call(view, two).status_code, 200)

    def test_views_without_scope_are_not_throttled(self):
        view = EchoView.as_view()
        for _ in range(3):
            self.assertEqual(call(view, factory.get('/x')).status_code, 200)


class TestApiError(ProblemAssertions, SimpleTestCase):
    def test_endpoint_code_and_detail(self):
        view = RaisingView.as_view(exc=ApiError(409, 'DUPLICATE_REVIEW', 'You already reviewed this item.'))
        body = self.assertProblem(call(view, factory.get('/x')), 409, 'DUPLICATE_REVIEW')
        self.assertEqual(body['title'], 'Conflict')
        self.assertEqual(body['detail'], 'You already reviewed this item.')

    def test_nonstandard_status_gets_a_generic_title(self):
        view = RaisingView.as_view(exc=ApiError(499, 'CLIENT_CLOSED', 'Gone.'))
        body = self.assertProblem(call(view, factory.get('/x')), 499, 'CLIENT_CLOSED')
        self.assertEqual(body['title'], 'Error')

    def test_detail_must_be_a_string(self):
        with self.assertRaises(TypeError):
            ApiError(409, 'DUPLICATE_REVIEW', {'review_id': 12})

    def test_lazy_translated_detail_is_accepted(self):
        view = RaisingView.as_view(exc=ApiError(409, 'DUPLICATE_REVIEW', gettext_lazy('Already reviewed.')))
        body = self.assertProblem(call(view, factory.get('/x')), 409, 'DUPLICATE_REVIEW')
        self.assertEqual(body['detail'], 'Already reviewed.')


class TestUnhandledException(ProblemAssertions, SimpleTestCase):
    def test_returns_500_problem_without_internals_and_logs(self):
        view = RaisingView.as_view(exc=RuntimeError('secret-internals'))
        with self.assertLogs('critic.api.errors', 'ERROR') as logs:
            response = call(view, factory.get('/x'))
        body = self.assertProblem(response, 500, 'INTERNAL_ERROR')
        self.assertEqual(body['detail'], 'An unexpected error occurred.')
        content = response.content.decode()
        self.assertNotIn('secret-internals', content)
        self.assertNotIn('Traceback', content)
        self.assertEqual(len(logs.records), 1)
        self.assertIsNotNone(logs.records[0].exc_info)
        self.assertIn('RaisingView', logs.output[0])

    def test_sends_got_request_exception(self):
        received = []

        def receiver(sender, request, **kwargs):
            received.append(request.path)

        got_request_exception.connect(receiver)
        self.addCleanup(got_request_exception.disconnect, receiver)
        view = RaisingView.as_view(exc=RuntimeError('boom'))
        with self.assertLogs('critic.api.errors', 'ERROR'):
            call(view, factory.get('/broken'))
        self.assertEqual(received, ['/broken'])
