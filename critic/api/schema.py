"""drf-spectacular helpers for API v3.

The v3 schema is generated from `critic.api.schema_urls` with
`V3_SCHEMA_SETTINGS`, by the /api/v3/schema view, `make schema` (which writes
openapi/v3.yaml) and the snapshot test alike.
"""

from functools import cache
from http import HTTPStatus

from drf_spectacular.utils import OpenApiResponse
from rest_framework import serializers

from .errors import PROBLEM_CONTENT_TYPE, ProblemSerializer

V3_PATH_PREFIX = '/api/v3/'

V3_SCHEMA_SETTINGS = {
    'TITLE': 'CriticApp API v3',
    'DESCRIPTION': (
        'API for the CriticApp frontend. Successful responses are wrapped as '
        '{"data": ..., "meta": {...}}; errors are RFC 9457 problem+json with a '
        'stable `code`. See docs/API_V3.md.'
    ),
    'VERSION': '3.0',
    # The global hook drops /api/v3/ from the v2 schema; it must not run here.
    'PREPROCESSING_HOOKS': [],
    # Separate request and response components, for the frontend's generated
    # types. Set from the start, because turning it on renames components.
    'COMPONENT_SPLIT_REQUEST': True,
    'TAGS': [
        {'name': 'categories', 'description': 'Review categories and their data sources'},
    ],
}


def exclude_v3_paths(endpoints, **kwargs):
    """Preprocessing hook for the v2 schema: leave out /api/v3/ endpoints."""
    return [endpoint for endpoint in endpoints if not endpoint[0].startswith(V3_PATH_PREFIX)]


class PaginationSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    limit = serializers.IntegerField()
    offset = serializers.IntegerField()


class PaginatedMetaSerializer(serializers.Serializer):
    pagination = PaginationSerializer()


def _empty_meta():
    # An empty serializer would be dropped from the schema; an object field stays.
    return serializers.DictField(help_text='Empty for responses without pagination')


@cache
def wrapped(serializer_class, *, many=False, paginated=False):
    """The response component {data: <serializer>, meta: <meta>}.

    Named <Name>Response, <Name>ListResponse or <Name>PageResponse after the
    serializer. Memoised, because two classes with one component name make
    spectacular warn.
    """
    name = serializer_class.__name__.removesuffix('Serializer')
    # DRF orders fields by creation, so create `data` before `meta`.
    data = serializer_class(many=many or paginated)
    if paginated:
        suffix, meta = 'PageResponse', PaginatedMetaSerializer()
    elif many:
        suffix, meta = 'ListResponse', _empty_meta()
    else:
        suffix, meta = 'Response', _empty_meta()
    return type(f'{name}{suffix}Serializer', (serializers.Serializer,), {'data': data, 'meta': meta})


def problem_responses(*statuses):
    """Problem responses for the given statuses, plus 500, which any v3
    endpoint can return. Merge into extend_schema's `responses`."""
    return {
        (status, PROBLEM_CONTENT_TYPE): OpenApiResponse(ProblemSerializer, description=HTTPStatus(status).phrase)
        for status in sorted({*statuses, 500})
    }
