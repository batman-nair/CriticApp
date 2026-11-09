"""Base classes for API v3 views."""

from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.generics import GenericAPIView
from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .errors import v3_exception_handler
from .pagination import V3LimitOffsetPagination


class V3ViewMixin:
    """Settings shared by every v3 view.

    - No versioning class: the global one only allows v2, and v3 is
      versioned by its URL.
    - Errors go through the v3 problem+json handler instead of the global one.
    - JSON only, no browsable API.
    - Throttled by `throttle_scope` ('search', 'login'); views without a
      scope aren't throttled.

    Views that use the logged-in user keep the default authentication
    classes: DRF returns 401 with a WWW-Authenticate header only when the
    first one (JWT) provides that header, and turns 401s into 403s otherwise.
    Public views whose response is the same for everyone may set
    `authentication_classes = []` (their throttles then count per IP).
    The session auth views set their own classes, without JWT, so a stale
    token can't turn them into 401s.
    """
    versioning_class = None
    renderer_classes = [JSONRenderer]
    parser_classes = [JSONParser]
    pagination_class = V3LimitOffsetPagination
    throttle_classes = [ScopedRateThrottle]

    def get_exception_handler(self):
        return v3_exception_handler


class V3APIView(V3ViewMixin, APIView):
    pass


class V3GenericAPIView(V3ViewMixin, GenericAPIView):
    pass


@extend_schema(exclude=True)
class V3NotFoundView(V3APIView):
    """Catch-all for unknown /api/v3/ paths: a 404 problem for every method.

    No authentication, so a session POST without a CSRF token still gets
    404 rather than a CSRF 403.
    """
    authentication_classes = []
    permission_classes = []

    def not_found(self, request, *args, **kwargs):
        raise NotFound()

    get = post = put = patch = delete = head = options = trace = not_found
