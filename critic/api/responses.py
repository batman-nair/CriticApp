"""Successful API v3 responses: {"data": ..., "meta": {...}}."""

from rest_framework.response import Response


def api_response(data, *, meta=None, status=200, headers=None):
    """Wrap `data` in the v3 envelope. Unlike v2, `meta` has no version."""
    return Response({'data': data, 'meta': meta or {}}, status=status, headers=headers)
