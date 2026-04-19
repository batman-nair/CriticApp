from django.contrib.auth import get_user_model
from django.test import TestCase


User = get_user_model()


class UserModelTest(TestCase):
    def test_create_user(self):
        user = User.objects.create_user(username='testuser', password='pass12345')
        self.assertEqual(user.username, 'testuser')
        self.assertTrue(user.check_password('pass12345'))
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_superuser(self):
        admin = User.objects.create_superuser(username='admin', password='admin12345')
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)

    def test_str_representation(self):
        user = User.objects.create_user(username='struser', password='pass12345')
        self.assertEqual(str(user), 'struser')

    def test_duplicate_username_rejected(self):
        User.objects.create_user(username='dupe', password='pass12345')
        with self.assertRaises(Exception):
            User.objects.create_user(username='dupe', password='pass12345')


class UserLogoutViewTest(TestCase):
    def test_logout_redirects(self):
        User.objects.create_user(username='logoutuser', password='pass12345')
        self.client.login(username='logoutuser', password='pass12345')
        response = self.client.get('/profile/logout')
        self.assertEqual(response.status_code, 302)
