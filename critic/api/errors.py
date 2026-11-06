"""
Errors for API v3: RFC 9457 Problem Details (application/problem+json).

Every error a v3 view produces, including DRF's own exceptions and unhandled
ones, goes through `v3_exception_handler` and comes out as:

    {"type": "about:blank", "title": "Bad Request", "status": 400,
     "code": "VALIDATION_ERROR", "detail": "...", "errors": [...]}

Clients branch on `code`. Endpoints raise `ApiError` for their own errors.
"""

import logging
import math
from http import HTTPStatus

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.signals import got_request_exception
from django.http import Http404
from rest_framework import exceptions, serializers
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import set_rollback

logger = logging.getLogger(__name__)

PROBLEM_CONTENT_TYPE = 'application/problem+json'

VALIDATION_DETAIL = 'Some fields are invalid.'
INTERNAL_ERROR_DETAIL = 'An unexpected error occurred.'

# Checked in order with isinstance(). Authentication errors are handled
# separately, because DRF turns them into 403s when there's no auth header.
_CODES = (
    (exceptions.ValidationError, 'VALIDATION_ERROR'),
    (exceptions.ParseError, 'PARSE_ERROR'),
    (exceptions.PermissionDenied, 'PERMISSION_DENIED'),
    (exceptions.NotFound, 'NOT_FOUND'),
    (exceptions.MethodNotAllowed, 'METHOD_NOT_ALLOWED'),
    (exceptions.UnsupportedMediaType, 'UNSUPPORTED_MEDIA_TYPE'),
    (exceptions.Throttled, 'RATE_LIMITED'),
)


class ApiError(exceptions.APIException):
    """An endpoint's own error, e.g. ApiError(409, 'DUPLICATE_REVIEW', '...')."""

    def __init__(self, status, code, detail):
        if not isinstance(detail, str):
            raise TypeError('ApiError detail must be a string')
        self.status_code = status
        self.code = code
        super().__init__(detail=detail, code=code)


def _error_code(exc):
    if isinstance(exc, ApiError):
        return exc.code
    if isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
        return 'UNAUTHENTICATED' if exc.status_code == 401 else 'PERMISSION_DENIED'
    for exc_class, code in _CODES:
        if isinstance(exc, exc_class):
            return code
    return exc.default_code.upper()


def _field_errors(detail, path=()):
    """Flatten a ValidationError detail into [{field, code, message}, ...].

    Nested fields use dotted paths (`items.0.name`). Non-field errors and a
    bare list or string detail have `field: None`.
    """
    if isinstance(detail, dict):
        for key, value in detail.items():
            sub_path = path if key == api_settings.NON_FIELD_ERRORS_KEY else (*path, str(key))
            yield from _field_errors(value, sub_path)
    elif isinstance(detail, list):
        for index, value in enumerate(detail):
            if isinstance(value, (dict, list)):
                yield from _field_errors(value, (*path, str(index)))
            else:
                yield from _field_errors(value, path)
    else:
        yield {
            'field': '.'.join(path) or None,
            'code': getattr(detail, 'code', None) or 'invalid',
            'message': str(detail),
        }


def status_title(status):
    """The HTTP status phrase, or a generic one for a status the stdlib doesn't know."""
    try:
        return HTTPStatus(status).phrase
    except ValueError:
        return 'Error'


def problem_response(status, code, detail, errors=None, headers=None):
    body = {
        'type': 'about:blank',
        'title': status_title(status),
        'status': status,
        'code': code,
        'detail': detail,
    }
    if errors is not None:
        body['errors'] = errors
    return Response(body, status=status, headers=headers, content_type=PROBLEM_CONTENT_TYPE)


def v3_exception_handler(exc, context):
    """Map any exception raised in a v3 view to a problem+json response."""
    if isinstance(exc, Http404):
        exc = exceptions.NotFound(*exc.args)
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied(*exc.args)

    set_rollback()

    if not isinstance(exc, exceptions.APIException):
        request = context.get('request')
        view = context.get('view')
        logger.error(
            'Unhandled exception in %s for %s',
            type(view).__name__ if view is not None else 'unknown view',
            request.path if request is not None else 'unknown path',
            exc_info=exc,
        )
        # What Django does for an exception it turns into a 500, so the test
        # client still re-raises it and error hooks still hear about it.
        got_request_exception.send(sender=None, request=getattr(request, '_request', request))
        return problem_response(500, 'INTERNAL_ERROR', INTERNAL_ERROR_DETAIL)

    headers = {}
    if getattr(exc, 'auth_header', None):
        headers['WWW-Authenticate'] = exc.auth_header
    if getattr(exc, 'wait', None) is not None:
        headers['Retry-After'] = str(math.ceil(exc.wait))

    if isinstance(exc, exceptions.ValidationError):
        return problem_response(
            exc.status_code, 'VALIDATION_ERROR', VALIDATION_DETAIL,
            errors=list(_field_errors(exc.detail)), headers=headers,
        )

    # Dict/list details (e.g. simplejwt's token internals) stay out of the body.
    detail = str(exc.detail) if isinstance(exc.detail, str) else str(exc.default_detail)
    return problem_response(exc.status_code, _error_code(exc), detail, headers=headers)


# Schema only (class docstrings would become schema descriptions).
class FieldErrorSerializer(serializers.Serializer):
    field = serializers.CharField(allow_null=True)
    code = serializers.CharField()
    message = serializers.CharField()


# Schema only: the problem body every v3 error uses.
class ProblemSerializer(serializers.Serializer):
    type = serializers.CharField()
    title = serializers.CharField()
    status = serializers.IntegerField()
    code = serializers.CharField()
    detail = serializers.CharField()
    errors = FieldErrorSerializer(many=True, required=False)
