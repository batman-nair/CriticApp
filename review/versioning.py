"""
API versioning support for CriticApp.

Uses DRF's AcceptHeaderVersioning with a v2-only default.
"""

from rest_framework.versioning import AcceptHeaderVersioning


class URLPathAndHeaderVersioning(AcceptHeaderVersioning):
    """
    Keep header-based versioning aligned with the v2-only API surface.
    """

    def determine_version(self, request, *args, **kwargs):
        """
        Determine API version from request.
        """

        version = super().determine_version(request, *args, **kwargs)
        if version is not None:
            return version

        return '2.0'

    def reverse(self, viewname, args=None, kwargs=None, request=None, format=None, **extra):
        """Reverse URL with version handling."""
        if request.version is not None:
            kwargs = {} if kwargs is None else kwargs
            kwargs['version'] = request.version
        return super().reverse(viewname, args, kwargs, request, format, **extra)
