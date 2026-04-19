from unittest.mock import Mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase

from review.permissions import IsOwnerOrReadOnly


class IsOwnerOrReadOnlyTest(SimpleTestCase):
    def setUp(self):
        self.permission = IsOwnerOrReadOnly()

    def _make_request(self, method):
        request = Mock()
        request.method = method
        return request

    def _make_obj(self, owner):
        obj = Mock()
        obj.user = owner
        return obj

    def test_safe_methods_allowed_for_anyone(self):
        request = self._make_request('GET')
        request.user = Mock()
        obj = self._make_obj(owner=Mock())
        self.assertTrue(self.permission.has_object_permission(request, None, obj))

    def test_head_allowed(self):
        request = self._make_request('HEAD')
        request.user = Mock()
        self.assertTrue(self.permission.has_object_permission(request, None, self._make_obj(Mock())))

    def test_options_allowed(self):
        request = self._make_request('OPTIONS')
        request.user = Mock()
        self.assertTrue(self.permission.has_object_permission(request, None, self._make_obj(Mock())))

    def test_owner_can_write(self):
        user = Mock()
        request = self._make_request('PUT')
        request.user = user
        obj = self._make_obj(owner=user)
        self.assertTrue(self.permission.has_object_permission(request, None, obj))

    def test_non_owner_cannot_write(self):
        request = self._make_request('DELETE')
        request.user = Mock()
        obj = self._make_obj(owner=Mock())
        self.assertFalse(self.permission.has_object_permission(request, None, obj))

    def test_post_blocked_for_non_owner(self):
        request = self._make_request('POST')
        request.user = Mock()
        obj = self._make_obj(owner=Mock())
        self.assertFalse(self.permission.has_object_permission(request, None, obj))
