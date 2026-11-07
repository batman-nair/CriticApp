from .base import InvalidItemId, Provider
from .igdb import IGDBProvider
from .mal import MALProvider
from .omdb import OMDbProvider
from .openlibrary import OpenLibraryProvider

# The same category ids as review/api_v3/categories.py.
_CATEGORY_FACTORIES = {
    'movie': lambda: OMDbProvider('movie'),
    'series': lambda: OMDbProvider('series'),
    'game': IGDBProvider,
    'anime': lambda: MALProvider('anime'),
    'manga': lambda: MALProvider('manga'),
    'book': OpenLibraryProvider,
}
CATEGORIES = tuple(_CATEGORY_FACTORIES)

# omdb_ is shared by movies and series, so that provider takes the category
# from the item itself.
_PREFIX_FACTORIES = {
    'omdb_': lambda: OMDbProvider(None),
    'igdb_': IGDBProvider,
    'jikan_anime_': lambda: MALProvider('anime'),
    'jikan_manga_': lambda: MALProvider('manga'),
    'olib_': OpenLibraryProvider,
}

# Prefixes of item ids whose provider is gone. Stored items with them are
# still served, but never refreshed, and an unstored one can't be looked up.
LEGACY_PREFIXES = ('rawg_',)


def get_provider(category: str) -> Provider:
    """A new provider for the category.

    Raises ValueError for an unknown category, and RuntimeError when the
    provider's API key isn't configured.
    """
    if category not in _CATEGORY_FACTORIES:
        raise ValueError('Unknown category "{}".'.format(category))
    return _CATEGORY_FACTORIES[category]()


def provider_for_item_id(item_id: str) -> Provider:
    """A new provider for the item id's prefix. Raises InvalidItemId for an unknown prefix."""
    for prefix in sorted(_PREFIX_FACTORIES, key=len, reverse=True):
        if item_id.startswith(prefix):
            return _PREFIX_FACTORIES[prefix]()
    raise InvalidItemId("Unknown item id prefix.")
