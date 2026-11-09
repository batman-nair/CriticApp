"""drf-spectacular helpers for API v3.

The v3 schema is generated from `critic.api.schema_urls` with
`V3_SCHEMA_SETTINGS`, by the /api/v3/schema view, `make schema` (which writes
openapi/v3.yaml) and the snapshot test alike.
"""

from functools import cache

from drf_spectacular.utils import OpenApiResponse, extend_schema_field, extend_schema_serializer
from rest_framework import serializers

from .errors import PROBLEM_CONTENT_TYPE, ProblemSerializer, status_title

V3_PATH_PREFIX = '/api/v3/'
# Unversioned, but part of the v3 schema. By exact path: the JWT endpoints
# under /api/auth/ stay in v2.
V3_SESSION_AUTH_PATHS = frozenset({
    '/api/auth/csrf',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/session',
})

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
        {'name': 'tags', 'description': "A user's most-used review tags"},
        {'name': 'search', 'description': "Search a category's data source"},
        {'name': 'items', 'description': 'Items (titles) by id'},
        {'name': 'reviews', 'description': "Users' reviews of items"},
        {'name': 'auth', 'description': 'Browser sessions: CSRF cookie, login, logout, current user'},
    ],
}


def exclude_v3_paths(endpoints, **kwargs):
    """Preprocessing hook for the v2 schema: leave out what's in the v3 schema."""
    return [
        endpoint for endpoint in endpoints
        if not endpoint[0].startswith(V3_PATH_PREFIX) and endpoint[0] not in V3_SESSION_AUTH_PATHS
    ]


class PaginationSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    limit = serializers.IntegerField()
    offset = serializers.IntegerField()


class PaginatedMetaSerializer(serializers.Serializer):
    pagination = PaginationSerializer()


@extend_schema_field({'type': 'object', 'additionalProperties': False})
class EmptyMetaField(serializers.DictField):
    # `meta` is always {} without pagination. An empty serializer would be
    # dropped from the schema, so this is a field typed as an empty object.
    pass


def _empty_meta():
    return EmptyMetaField(help_text='Always empty for responses without pagination')


def wrapped(serializer_class, *, many=False, paginated=False):
    """The response component {data: <serializer>, meta: <meta>}.

    Named <Name>Response, <Name>ListResponse or <Name>PageResponse after the
    serializer.
    """
    kind = 'page' if paginated else 'list' if many else 'one'
    return _wrapped(serializer_class, kind)


# Memoised on normalised arguments: two classes with one component name make
# spectacular warn, and `--fail-on-warn` fails.
@cache
def _wrapped(serializer_class, kind):
    name = serializer_class.__name__.removesuffix('Serializer')
    # DRF orders fields by creation, so create `data` before `meta`.
    data = serializer_class(many=kind != 'one')
    if kind == 'page':
        suffix, meta = 'PageResponse', PaginatedMetaSerializer()
    elif kind == 'list':
        suffix, meta = 'ListResponse', _empty_meta()
    else:
        suffix, meta = 'Response', _empty_meta()
    envelope = type(f'{name}{suffix}Serializer', (serializers.Serializer,), {'data': data, 'meta': meta})
    # The envelope is the whole body: spectacular must not wrap it in a list
    # or in a paginator schema again (it would on ListModelMixin views).
    return extend_schema_serializer(many=False)(envelope)


def problem_responses(*statuses):
    """Problem responses for the given statuses, plus 500, which any v3
    endpoint can return. Merge into extend_schema's `responses`."""
    return {
        (status, PROBLEM_CONTENT_TYPE): OpenApiResponse(ProblemSerializer, description=status_title(status))
        for status in sorted({*statuses, 500})
    }
