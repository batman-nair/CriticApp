"""External item providers (OMDb, IGDB, MyAnimeList, Open Library)."""

from .base import (
    InvalidItemId,
    ItemDetails,
    ItemNotFound,
    ItemSummary,
    Provider,
    ProviderError,
    UpstreamError,
    WrongCategory,
)
from .registry import CATEGORIES, LEGACY_PREFIXES, get_provider, provider_for_item_id

__all__ = [
    'CATEGORIES',
    'InvalidItemId',
    'ItemDetails',
    'ItemNotFound',
    'ItemSummary',
    'LEGACY_PREFIXES',
    'Provider',
    'ProviderError',
    'UpstreamError',
    'WrongCategory',
    'get_provider',
    'provider_for_item_id',
]
