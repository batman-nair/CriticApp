from rest_framework.pagination import LimitOffsetPagination

from .responses import api_response


class V3LimitOffsetPagination(LimitOffsetPagination):
    """Limit/offset pagination for v3, reported in `meta.pagination`.

    A limit above `max_limit` is cut down to it; an invalid limit falls back
    to `default_limit`.
    """
    default_limit = 20
    max_limit = 100

    def get_paginated_response(self, data):
        return api_response(data, meta={
            'pagination': {
                'count': self.count,
                'limit': self.limit,
                'offset': self.offset,
            },
        })
