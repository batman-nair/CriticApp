"""The v3 item representation, and GET /api/v3/items/{item_id}.

Stored items only have the old ReviewItem columns (attr1-3, "N/A" for
missing values, year as text), so the representation is parsed from them.
"""

import math
import re

from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema, extend_schema_field
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated

from critic.api.responses import api_response
from critic.api.schema import problem_responses, wrapped
from critic.api.views import V3APIView
from review.providers import CATEGORIES, ProviderError

from .services import get_or_fetch_item, provider_api_error

# A full date, as RAWG's release dates were stored.
_DATE_RE = re.compile(r'(\d{4})-\d{2}-\d{2}')
# "2019", "2018–2021" and "2018–" (OMDb), "2019-2020" (MAL).
_YEARS_RE = re.compile(r'(\d{4})(?:\s*[-–]\s*(\d{4})?)?')
_PAGES_RE = re.compile(r'(\d+) pages')


def parse_years(text):
    """(start_year, end_year) from year text; None for what isn't known.

    A single year, a range within one year (MAL's "2023-2023") and an open
    range ("2018–") have no end year.
    """
    text = (text or '').strip()
    match = _DATE_RE.fullmatch(text)
    if match:
        return int(match.group(1)), None
    match = _YEARS_RE.fullmatch(text)
    if match:
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else None
        return start, end if end != start else None
    return None, None


def _text(value):
    value = (value or '').strip()
    return None if not value or value == 'N/A' else value


def _list(value):
    parts = (part.strip() for part in (_text(value) or '').split(','))
    return [part for part in parts if part and part != 'N/A']


def _rating(value):
    try:
        rating = float(value)
    except (TypeError, ValueError):
        return None
    return rating if math.isfinite(rating) else None


def _pages(value):
    match = _PAGES_RE.fullmatch(_text(value) or '')
    return int(match.group(1)) if match else None


def item_details(item):
    """The category's own fields, from attr3."""
    if item.category == 'game':
        return {'platforms': _list(item.attr3)}
    if item.category == 'book':
        return {'pages': _pages(item.attr3)}
    # Movies and series keep OMDb's type, anime and manga MAL's media type.
    return {'media_type': _text(item.attr3)}


# Schema only: what `details` holds per category.
class MediaTypeDetailsSerializer(serializers.Serializer):
    media_type = serializers.CharField(allow_null=True, help_text='OMDb type for movies and series, MAL media type for anime and manga')


class GameDetailsSerializer(serializers.Serializer):
    platforms = serializers.ListField(child=serializers.CharField())


class BookDetailsSerializer(serializers.Serializer):
    pages = serializers.IntegerField(allow_null=True, help_text='Median page count of the editions')


_DETAILS_SERIALIZERS = {
    'movie': MediaTypeDetailsSerializer,
    'series': MediaTypeDetailsSerializer,
    'game': GameDetailsSerializer,
    'anime': MediaTypeDetailsSerializer,
    'manga': MediaTypeDetailsSerializer,
    'book': BookDetailsSerializer,
}


def _item_schema_serializer(category):
    # Fields are created here, per call, so they keep this order in the schema.
    fields = {
        'id': serializers.CharField(),
        'category': serializers.ChoiceField(choices=[category]),
        'title': serializers.CharField(),
        'image_url': serializers.URLField(allow_null=True),
        'start_year': serializers.IntegerField(allow_null=True),
        'end_year': serializers.IntegerField(allow_null=True, help_text='Null for a single year and for ongoing titles'),
        'genres': serializers.ListField(child=serializers.CharField()),
        'creators': serializers.ListField(child=serializers.CharField(), help_text='Crew, studios, developers or authors'),
        'languages': serializers.ListField(child=serializers.CharField()),
        'description': serializers.CharField(allow_null=True),
        'provider_rating': serializers.FloatField(allow_null=True, help_text="The source's rating, 0-10"),
        'details': _DETAILS_SERIALIZERS[category](),
    }
    name = '{}ItemSerializer'.format(category.capitalize())
    return type(name, (serializers.Serializer,), {**fields, '__module__': __name__})


# Schema only: the item per category. A dict, so the discriminator mapping is
# keyed by category (with a list, spectacular maps them all to null).
ITEM_SCHEMA_SERIALIZERS = {category: _item_schema_serializer(category) for category in CATEGORIES}


@extend_schema_field(PolymorphicProxySerializer(
    component_name='Item',
    serializers=ITEM_SCHEMA_SERIALIZERS,
    resource_type_field_name='category',
))
class ItemSerializer(serializers.BaseSerializer):
    """A stored ReviewItem in the v3 shape. Read only."""

    def to_representation(self, item):
        start_year, end_year = parse_years(item.year)
        return {
            'id': item.item_id,
            'category': item.category,
            'title': item.title,
            'image_url': _text(item.image_url),
            'start_year': start_year,
            'end_year': end_year,
            'genres': _list(item.attr1),
            'creators': _list(item.attr2),
            'languages': _list(item.language),
            'description': _text(item.description),
            'provider_rating': _rating(item.rating),
            'details': item_details(item),
        }


class ItemDetailView(V3APIView):
    # Fetching an unknown item spends upstream quota, as in v2.
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['items'],
        operation_id='items_retrieve',
        summary='Get an item',
        description=(
            'The stored item, or else the item fetched from its provider (picked by the id prefix) '
            'and stored. 404 when the prefix is unknown or the provider has no such item; 502 when '
            'the provider fails.'
        ),
        responses={200: wrapped(ItemSerializer), **problem_responses(401, 404, 502)},
    )
    def get(self, request, item_id):
        try:
            item = get_or_fetch_item(item_id)
        except ProviderError as ex:
            raise provider_api_error(ex) from ex
        return api_response(ItemSerializer(item).data)
