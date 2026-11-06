"""GET /api/v3/categories and the category table behind it.

v2's FILTER_CATEGORIES (review/views.py) stays as it is for the old pages.
"""

from dataclasses import dataclass

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny

from critic.api.responses import api_response
from critic.api.schema import problem_responses, wrapped
from critic.api.views import V3APIView


@dataclass(frozen=True)
class Subcategory:
    id: str
    label: str


@dataclass(frozen=True)
class Category:
    id: str
    label: str
    source: str
    rating_label: str
    subcategories: tuple[Subcategory, ...] = ()


CATEGORIES: tuple[Category, ...] = (
    Category('movie', 'Movies', source='OMDb', rating_label='IMDb'),
    Category('series', 'Series', source='OMDb', rating_label='IMDb'),
    Category('game', 'Games', source='RAWG', rating_label='RAWG'),
    Category('anime', 'Anime', source='MyAnimeList', rating_label='MyAnimeList', subcategories=(
        Subcategory('anime:series', 'Anime series'),
        Subcategory('anime:movie', 'Anime movies'),
    )),
    Category('manga', 'Manga', source='MyAnimeList', rating_label='MyAnimeList'),
    Category('book', 'Books', source='Open Library', rating_label='Open Library'),
)


class SubcategorySerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField()


class CategorySerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField()
    subcategories = SubcategorySerializer(many=True)
    source = serializers.CharField(help_text='Where item data comes from')
    rating_label = serializers.CharField(help_text="Name of the source's rating, e.g. IMDb")


class CategoryListView(V3APIView):
    # Public and the same for everyone: no authentication, so a stale token
    # can't turn this read into a 401.
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['categories'],
        operation_id='categories_list',
        summary='List categories',
        description='Every category with its filter subcategories, data source and rating label.',
        responses={200: wrapped(CategorySerializer, many=True), **problem_responses()},
    )
    def get(self, request):
        return api_response(CategorySerializer(CATEGORIES, many=True).data)
