"""Items by id, for the v3 item endpoint and (later) creating a review by item id."""

from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound

from critic.api.errors import ApiError
from review.models import ReviewItem
from review.providers import InvalidItemId, ItemNotFound, ProviderError, provider_for_item_id
from review.providers.base import fit_joined

# The ReviewItem column each list is joined into.
_LIST_COLUMNS = {'genres': 'attr1', 'creators': 'attr2', 'platforms': 'attr3', 'languages': 'language'}


def _max_length(column):
    return ReviewItem._meta.get_field(column).max_length


def get_or_fetch_item(item_id: str) -> ReviewItem:
    """The stored item, or else the provider's, fetched and stored now.

    The provider comes from the id's prefix. Raises ProviderError:
    InvalidItemId for an id no provider takes (including legacy rawg_ ids
    that aren't stored), ItemNotFound, or UpstreamError.
    """
    item = ReviewItem.objects.filter(item_id=item_id).first()
    if item is not None:
        return item
    # Such an id can't have been stored; don't spend an upstream request on it.
    if len(item_id) > _max_length('item_id'):
        raise InvalidItemId('Invalid item id.')
    details = provider_for_item_id(item_id).get_details(item_id)

    # Not every provider fits its values to the columns, and an over-long
    # value would fail the insert.
    details.title = details.title[:_max_length('title')]
    for name, column in _LIST_COLUMNS.items():
        setattr(details, name, fit_joined(getattr(details, name), _max_length(column)))

    fields = details.to_review_item_fields()
    now = timezone.now()
    fields.update(last_refreshed_at=now, last_refresh_attempt_at=now, refresh_error_count=0)
    # Another request may have stored the same item meanwhile.
    item, _ = ReviewItem.objects.get_or_create(item_id=fields.pop('item_id'), defaults=fields)
    return item


def provider_api_error(exc: ProviderError) -> APIException:
    """The v3 error for a failed item lookup: 404 NOT_FOUND when the item
    doesn't exist, otherwise 502 UPSTREAM_ERROR. Provider messages are
    user-facing."""
    if isinstance(exc, (InvalidItemId, ItemNotFound)):
        return NotFound(exc.message)
    return ApiError(502, 'UPSTREAM_ERROR', exc.message)
