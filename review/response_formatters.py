"""
Response formatting helpers for versioned API responses.

Provides utilities for consistent response formatting across API versions.
"""

from typing import Any, Dict, Optional


def success_response(
    data: Any,
    meta: Optional[Dict[str, Any]] = None,
    version: str = "2.0"
) -> Dict[str, Any]:
    """
    Format a successful API response (v2 format).

    Args:
        data: Response payload (can be dict, list, or single object)
        meta: Optional metadata dict (pagination, versioning, etc.)
        version: API version string

    Returns:
        Formatted response dict: {"data": ..., "meta": {...}}

    Example:
        >>> success_response({"id": 1, "title": "Movie"}, meta={"version": "2.0"})
        {"data": {"id": 1, "title": "Movie"}, "meta": {"version": "2.0"}}
    """
    if meta is None:
        meta = {}

    if "version" not in meta:
        meta["version"] = version

    return {
        "data": data,
        "meta": meta
    }


def error_response(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    version: str = "2.0"
) -> Dict[str, Any]:
    """
    Format an error API response (v2 format).

    Args:
        code: Machine-readable error code (e.g., "INVALID_CATEGORY", "RATE_LIMITED")
        message: Human-readable error message
        details: Optional details dict (field validation errors, etc.)
        version: API version string

    Returns:
        Formatted error response dict: {"error": {...}, "meta": {...}}

    Example:
        >>> error_response("INVALID_CATEGORY", "Category 'book' not supported")
        {
            "error": {
                "code": "INVALID_CATEGORY",
                "message": "Category 'book' not supported",
                "details": {}
            },
            "meta": {"version": "2.0"}
        }
    """
    if details is None:
        details = {}

    return {
        "error": {
            "code": code,
            "message": message,
            "details": details
        },
        "meta": {
            "version": version
        }
    }


def paginated_response(
    data: list,
    count: int,
    limit: int,
    offset: int,
    version: str = "2.0"
) -> Dict[str, Any]:
    """
    Format a paginated successful response (v2 format).

    Args:
        data: List of result items
        count: Total count of items (across all pages)
        limit: Page size
        offset: Current offset
        version: API version string

    Returns:
        Formatted paginated response

    Example:
        >>> paginated_response([{"id": 1}], count=100, limit=20, offset=0)
        {
            "data": [{"id": 1}],
            "meta": {
                "version": "2.0",
                "pagination": {"count": 100, "limit": 20, "offset": 0}
            }
        }
    """
    return {
        "data": data,
        "meta": {
            "version": version,
            "pagination": {
                "count": count,
                "limit": limit,
                "offset": offset
            }
        }
    }
