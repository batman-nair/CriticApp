from rest_framework.pagination import LimitOffsetPagination

from .responses import api_response


class V3LimitOffsetPagination(LimitOffsetPagination):
    """Limit/offset pagination for v3, reported in `meta.pagination`.

    A limit above `max_limit` is cut down to it; an invalid limit falls back
    to `default_limit`.
    """
    default_limit = 20
    max_limit = 100

    def get_paginated_response_schema(self, schema):
        # What drf-spectacular documents for list views that don't declare
        # wrapped(..., paginated=True) themselves.
        return {
            'type': 'object',
            'required': ['data', 'meta'],
            'properties': {
                'data': schema,
                'meta': {
                    'type': 'object',
                    'required': ['pagination'],
                    'properties': {
                        'pagination': {
                            'type': 'object',
                            'required': ['count', 'limit', 'offset'],
                            'properties': {
                                'count': {'type': 'integer'},
                                'limit': {'type': 'integer'},
                                'offset': {'type': 'integer'},
                            },
                        },
                    },
                },
            },
        }

    def get_paginated_response(self, data):
        return api_response(data, meta={
            'pagination': {
                'count': self.count,
                'limit': self.limit,
                'offset': self.offset,
            },
        })
