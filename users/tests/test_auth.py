from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()

TOKEN_URL = '/api/auth/token/'
REFRESH_URL = '/api/auth/token/refresh/'
LOGOUT_URL = '/api/auth/logout/'
ME_URL = '/api/auth/me/'
REGISTER_URL = '/api/auth/register/'


class JWTLoginTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='StrongPass123!')

    def test_login_returns_tokens(self):
        response = self.client.post(TOKEN_URL, {'username': 'testuser', 'password': 'StrongPass123!'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_login_bad_credentials_rejected(self):
        response = self.client.post(TOKEN_URL, {'username': 'testuser', 'password': 'wrongpassword'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access', response.data)


class JWTRefreshTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='refreshuser', password='StrongPass123!')
        login = self.client.post(TOKEN_URL, {'username': 'refreshuser', 'password': 'StrongPass123!'})
        self.refresh_token = login.data['refresh']

    def test_refresh_returns_new_access_token(self):
        response = self.client.post(REFRESH_URL, {'refresh': self.refresh_token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)


class JWTLogoutTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='logoutuser', password='StrongPass123!')
        login = self.client.post(TOKEN_URL, {'username': 'logoutuser', 'password': 'StrongPass123!'})
        self.refresh_token = login.data['refresh']

    def test_logout_blacklists_refresh_token(self):
        response = self.client.post(LOGOUT_URL, {'refresh': self.refresh_token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_blacklisted_token_cannot_refresh(self):
        self.client.post(LOGOUT_URL, {'refresh': self.refresh_token})
        response = self.client.post(REFRESH_URL, {'refresh': self.refresh_token})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class MeViewTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='meuser', password='StrongPass123!')
        login = self.client.post(TOKEN_URL, {'username': 'meuser', 'password': 'StrongPass123!'})
        self.access_token = login.data['access']

    def test_me_returns_user_info(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'meuser')
        self.assertEqual(response.data['id'], self.user.id)

    def test_me_without_token_is_rejected(self):
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RegisterViewTest(APITestCase):
    def test_register_creates_user_and_returns_tokens(self):
        response = self.client.post(REGISTER_URL, {
            'username': 'newuser',
            'password': 'StrongPass123!',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertTrue(User.objects.filter(username='newuser').exists())

    def test_register_with_email(self):
        response = self.client.post(REGISTER_URL, {
            'username': 'emailuser',
            'password': 'StrongPass123!',
            'email': 'emailuser@example.com',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='emailuser')
        self.assertEqual(user.email, 'emailuser@example.com')

    def test_register_duplicate_username_rejected(self):
        User.objects.create_user(username='dupeuser', password='StrongPass123!')
        response = self.client.post(REGISTER_URL, {
            'username': 'dupeuser',
            'password': 'StrongPass123!',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

    def test_register_weak_password_rejected(self):
        response = self.client.post(REGISTER_URL, {
            'username': 'weakpassuser',
            'password': 'password',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_register_missing_username_rejected(self):
        response = self.client.post(REGISTER_URL, {'password': 'StrongPass123!'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_missing_password_rejected(self):
        response = self.client.post(REGISTER_URL, {'username': 'nopassuser'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
