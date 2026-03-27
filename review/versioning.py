"""
API versioning support for CriticApp.

Supports both URL-path versioning (/api/v1/, /api/v2/) and header-based versioning.
Uses DRF's AcceptHeaderVersioning with custom fallback to URL path.
"""

from rest_framework.versioning import AcceptHeaderVersioning


class URLPathAndHeaderVersioning(AcceptHeaderVersioning):
    """
    Custom versioning class that supports both:
    1. Header-based versioning: Accept: application/vnd.criticapp.v2+json
    2. URL-path versioning: /api/v1/, /api/v2/
    
    Defaults to v1 if no version is specified.
    """
    
    def determine_version(self, request, *args, **kwargs):
        """
        Determine API version from request.
        
        Priority:
        1. Accept header (e.g., Accept: application/vnd.criticapp.v2+json)
        2. URL path (e.g., /api/v2/)
        3. Default to v1
        """
        
        # Try header-based versioning first
        version = super().determine_version(request, *args, **kwargs)
        if version is not None:
            return version
        
        # Fall back to URL path version from kwargs (set by views/urls)
        version = request.resolver_match.kwargs.get('version') if request.resolver_match else None
        
        # Default to v1 if no version found
        return version or '1.0'
    
    def reverse(self, viewname, args=None, kwargs=None, request=None, format=None, **extra):
        """Reverse URL with version handling."""
        if request.version is not None:
            kwargs = {} if kwargs is None else kwargs
            kwargs['version'] = request.version
        return super().reverse(viewname, args, kwargs, request, format, **extra)
