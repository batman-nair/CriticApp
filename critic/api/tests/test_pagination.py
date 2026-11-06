import json

from django.test import SimpleTestCase
from rest_framework import permissions
from rest_framework.test import APIRequestFactory

from critic.api.views import V3GenericAPIView

factory = APIRequestFactory()
ITEMS = list(range(150))


class NumbersView(V3GenericAPIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return self.get_paginated_response(self.paginate_queryset(ITEMS))


def get(params=None):
    response = NumbersView.as_view()(factory.get('/x', params or {}))
    response.render()
    return response.status_code, json.loads(response.content)


class TestV3Pagination(SimpleTestCase):
    def test_default_limit(self):
        status, body = get()
        self.assertEqual(status, 200)
        self.assertEqual(body['data'], ITEMS[:20])
        self.assertEqual(body['meta'], {'pagination': {'count': 150, 'limit': 20, 'offset': 0}})

    def test_limit_is_capped_at_100(self):
        _, body = get({'limit': 500})
        self.assertEqual(len(body['data']), 100)
        self.assertEqual(body['meta']['pagination']['limit'], 100)

    def test_offset_near_the_end(self):
        _, body = get({'limit': 20, 'offset': 140})
        self.assertEqual(body['data'], ITEMS[140:])
        self.assertEqual(body['meta']['pagination'], {'count': 150, 'limit': 20, 'offset': 140})

    def test_invalid_limit_falls_back_to_default(self):
        _, body = get({'limit': 'abc'})
        self.assertEqual(len(body['data']), 20)
        self.assertEqual(body['meta']['pagination']['limit'], 20)
