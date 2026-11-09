import sys
from importlib import import_module, reload
from unittest import mock

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.signals import user_logged_out
from django.contrib.sessions.models import Session
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()

CSRF_URL = '/api/auth/csrf'
LOGIN_URL = '/api/auth/login'
LOGOUT_URL = '/api/auth/logout'
SESSION_URL = '/api/auth/session'
REGISTER_URL = '/api/auth/register/'

PASSWORD = 'StrongPass123!'
CREDENTIALS = {'username': 'alice', 'password': PASSWORD}


class SessionAuthTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', password=PASSWORD)
        self.csrf_client = APIClient(enforce_csrf_checks=True)

    def assert_problem(self, response, status_code, code):
        self.assertEqual(response.status_code, status_code)
        self.assertEqual(response['Content-Type'], 'application/problem+json')
        self.assertEqual(response.json()['code'], code)

    def session_user(self, client=None):
        return (client or self.client).get(SESSION_URL).json()['data']['user']

    def csrf_token(self, client):
        client.get(CSRF_URL)
        return client.cookies['csrftoken'].value


class CsrfTest(SessionAuthTestCase):
    def test_csrf_endpoint_sets_the_cookie(self):
        response = self.client.get(CSRF_URL)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(response.cookies['csrftoken'].value)

    def test_login_without_token_is_rejected(self):
        response = self.csrf_client.post(LOGIN_URL, CREDENTIALS, format='json')
        self.assert_problem(response, status.HTTP_403_FORBIDDEN, 'PERMISSION_DENIED')
        self.assertIsNone(self.session_user(self.csrf_client))

    def test_login_with_token_from_csrf_endpoint_succeeds(self):
        token = self.csrf_token(self.csrf_client)
        response = self.csrf_client.post(LOGIN_URL, CREDENTIALS, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_logged_in_logout_without_token_is_rejected(self):
        self.csrf_client.force_login(self.user)
        response = self.csrf_client.post(LOGOUT_URL)
        self.assert_problem(response, status.HTTP_403_FORBIDDEN, 'PERMISSION_DENIED')
        self.assertEqual(self.session_user(self.csrf_client)['username'], 'alice')

    def test_login_rotates_the_csrf_token(self):
        old_token = self.csrf_token(self.csrf_client)
        self.csrf_client.post(LOGIN_URL, CREDENTIALS, format='json', HTTP_X_CSRFTOKEN=old_token)
        new_token = self.csrf_client.cookies['csrftoken'].value
        self.assertNotEqual(new_token, old_token)

        response = self.csrf_client.post(LOGOUT_URL, HTTP_X_CSRFTOKEN=old_token)
        self.assert_problem(response, status.HTTP_403_FORBIDDEN, 'PERMISSION_DENIED')

        response = self.csrf_client.post(LOGOUT_URL, HTTP_X_CSRFTOKEN=new_token)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class LoginTest(SessionAuthTestCase):
    def test_success_starts_a_session(self):
        response = self.client.post(LOGIN_URL, CREDENTIALS, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {'data': {'user': {'id': self.user.id, 'username': 'alice'}}, 'meta': {}})
        self.assertEqual(self.session_user()['username'], 'alice')

    def test_password_whitespace_is_kept(self):
        User.objects.create_user(username='spaced', password=' spaced pass ')
        response = self.client.post(LOGIN_URL, {'username': 'spaced', 'password': ' spaced pass '}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_wrong_password(self):
        response = self.client.post(LOGIN_URL, {'username': 'alice', 'password': 'wrong'}, format='json')
        self.assert_problem(response, status.HTTP_401_UNAUTHORIZED, 'INVALID_CREDENTIALS')
        self.assertIsNone(self.session_user())

    def test_unknown_user(self):
        response = self.client.post(LOGIN_URL, {'username': 'nobody', 'password': PASSWORD}, format='json')
        self.assert_problem(response, status.HTTP_401_UNAUTHORIZED, 'INVALID_CREDENTIALS')

    def test_inactive_user(self):
        User.objects.create_user(username='inactive', password=PASSWORD, is_active=False)
        response = self.client.post(LOGIN_URL, {'username': 'inactive', 'password': PASSWORD}, format='json')
        self.assert_problem(response, status.HTTP_401_UNAUTHORIZED, 'INVALID_CREDENTIALS')

    def test_missing_fields(self):
        response = self.client.post(LOGIN_URL, {'username': 'alice'}, format='json')
        self.assert_problem(response, status.HTTP_400_BAD_REQUEST, 'VALIDATION_ERROR')
        self.assertEqual([error['field'] for error in response.json()['errors']], ['password'])

    def test_session_key_rotates(self):
        # login() only cycles a key that exists, so start with an anonymous session.
        session = self.client.session
        session['seeded'] = True
        session.save()
        old_key = session.session_key
        self.assertEqual(self.client.cookies['sessionid'].value, old_key)

        self.client.post(LOGIN_URL, CREDENTIALS, format='json')

        self.assertNotEqual(self.client.cookies['sessionid'].value, old_key)
        self.assertFalse(Session.objects.filter(session_key=old_key).exists())

    def test_stale_bearer_token_does_not_break_login(self):
        response = self.client.post(LOGIN_URL, CREDENTIALS, format='json', HTTP_AUTHORIZATION='Bearer junk')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @mock.patch.object(ScopedRateThrottle, 'THROTTLE_RATES', {'login': '1/min'})
    def test_throttled(self):
        self.client.post(LOGIN_URL, {'username': 'alice', 'password': 'wrong'}, format='json')
        response = self.client.post(LOGIN_URL, CREDENTIALS, format='json')
        self.assert_problem(response, status.HTTP_429_TOO_MANY_REQUESTS, 'RATE_LIMITED')
        self.assertIn('Retry-After', response)

    @mock.patch.object(ScopedRateThrottle, 'THROTTLE_RATES', {'login': '1/min'})
    def test_csrf_rejection_does_not_use_up_the_throttle(self):
        response = self.csrf_client.post(LOGIN_URL, CREDENTIALS, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        token = self.csrf_token(self.csrf_client)
        response = self.csrf_client.post(LOGIN_URL, CREDENTIALS, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        token = self.csrf_client.cookies['csrftoken'].value
        response = self.csrf_client.post(LOGIN_URL, CREDENTIALS, format='json', HTTP_X_CSRFTOKEN=token)
        self.assert_problem(response, status.HTTP_429_TOO_MANY_REQUESTS, 'RATE_LIMITED')


class LogoutTest(SessionAuthTestCase):
    def test_old_session_no_longer_authenticates(self):
        self.client.post(LOGIN_URL, CREDENTIALS, format='json')
        old_session = self.client.cookies['sessionid'].value

        response = self.client.post(LOGOUT_URL)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        replay = APIClient()
        replay.cookies['sessionid'] = old_session
        self.assertIsNone(self.session_user(replay))

    def test_signal_gets_the_real_user(self):
        receiver = mock.Mock()
        user_logged_out.connect(receiver)
        self.addCleanup(user_logged_out.disconnect, receiver)
        self.client.force_login(self.user)

        self.client.post(LOGOUT_URL)

        receiver.assert_called_once()
        self.assertEqual(receiver.call_args.kwargs['user'], self.user)

    def test_anonymous_needs_no_csrf_token(self):
        response = self.csrf_client.post(LOGOUT_URL)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class SessionTest(SessionAuthTestCase):
    def test_logged_in(self):
        self.client.force_login(self.user)
        response = self.client.get(SESSION_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['data']['user'], {'id': self.user.id, 'username': 'alice'})

    def test_logged_out(self):
        response = self.client.get(SESSION_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {'data': {'user': None}, 'meta': {}})

    def test_stale_bearer_token_is_not_a_401(self):
        response = self.client.get(SESSION_URL, HTTP_AUTHORIZATION='Bearer junk')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.json()['data']['user'])


class RegistrationGateTest(SessionAuthTestCase):
    @override_settings(REGISTRATION_ENABLED=False)
    def test_disabled(self):
        response = self.client.post(REGISTER_URL, {'username': 'newuser', 'password': PASSWORD})
        self.assert_problem(response, status.HTTP_403_FORBIDDEN, 'REGISTRATION_DISABLED')
        self.assertFalse(User.objects.filter(username='newuser').exists())


class PathsTest(SessionAuthTestCase):
    def test_old_jwt_logout_path_is_gone(self):
        response = self.client.post('/api/auth/logout/', {'refresh': 'x'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_trailing_slash_is_not_a_session_path(self):
        response = self.client.post('/api/auth/login/', CREDENTIALS, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CookieFlagsTest(SessionAuthTestCase):
    def test_session_cookie(self):
        cookie = self.client.post(LOGIN_URL, CREDENTIALS, format='json').cookies['sessionid']
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Lax')

    def test_csrf_cookie_is_readable_by_the_frontend(self):
        cookie = self.client.get(CSRF_URL).cookies['csrftoken']
        self.assertFalse(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Lax')


@pytest.mark.parametrize('value, expected', [(None, False), ('False', False), ('True', True)])
def test_registration_enabled_setting(monkeypatch, value, expected):
    # common.py calls load_dotenv on import, which would bring back a local .env.
    monkeypatch.setattr('dotenv.load_dotenv', lambda *args, **kwargs: None)
    if value is None:
        monkeypatch.delenv('REGISTRATION_ENABLED', raising=False)
    else:
        monkeypatch.setenv('REGISTRATION_ENABLED', value)
    monkeypatch.delitem(sys.modules, 'critic.settings.common')

    assert import_module('critic.settings.common').REGISTRATION_ENABLED is expected


def test_production_cookies_are_secure_by_default(production_settings, monkeypatch):
    monkeypatch.delenv('SESSION_COOKIE_SECURE', raising=False)
    monkeypatch.delenv('CSRF_COOKIE_SECURE', raising=False)

    reload(production_settings)

    assert production_settings.SESSION_COOKIE_SECURE is True
    assert production_settings.CSRF_COOKIE_SECURE is True
