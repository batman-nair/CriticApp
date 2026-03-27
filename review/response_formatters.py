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
    status_code: int = 400,
    version: str = "2.0"
) -> Dict[str, Any]:
    """
    Format an error API response (v2 format).
    
    Args:
        code: Machine-readable error code (e.g., "INVALID_CATEGORY", "RATE_LIMITED")
        message: Human-readable error message
        details: Optional details dict (field validation errors, etc.)
        status_code: HTTP status code
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


def legacy_success_response(response: bool = True, results: list = None, **kwargs) -> Dict[str, Any]:
    """
    Format response in v1 legacy format.
    
    Used for backwards compatibility with existing v1 clients.
    Returns string boolean ("True"/"False") to maintain upstream API contract.
    
    Args:
        response: Success boolean (True/False)
        results: Optional list of results
        **kwargs: Additional fields to include in response
    
    Returns:
        Legacy formatted response dict
    
    Example:
        >>> legacy_success_response(True, results=[{"id": 1}])
        {"response": "True", "results": [{"id": 1}]}
    """
    result = {
        "response": "True" if response else "False"
    }
    
    if results is not None:
        result["results"] = results
    
    result.update(kwargs)
    return result


def legacy_error_response(error: str, source: str = None) -> Dict[str, Any]:
    """
    Format error response in v1 legacy format.
    
    Used for backwards compatibility with existing v1 clients.
    
    Args:
        error: Error message
        source: Optional upstream API source (e.g., "OMDB API")
    
    Returns:
        Legacy formatted error response dict
    
    Example:
        >>> legacy_error_response("Invalid category", source="OMDB API")
        {"response": "False", "error": "Invalid category", "source": "OMDB API"}
    """
    result = {
        "response": "False",
        "error": error
    }
    
    if source:
        result["source"] = source
    
    return result
