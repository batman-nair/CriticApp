from django.test import TestCase


class TestV2ErrorShapeUnchanged(TestCase):
    """API v3 adds its own exception handler; v2 errors keep DRF's shape."""

    def test_v2_not_found_uses_drf_default_shape(self):
        response = self.client.get('/api/v2/reviews/999999/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertEqual(set(response.json()), {'detail'})
