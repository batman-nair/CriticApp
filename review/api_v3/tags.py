"""GET /api/v3/tags: a user's most-used review tags, for one-tap suggestions."""

from collections import Counter, defaultdict

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny

from critic.api.pagination import V3LimitOffsetPagination
from critic.api.responses import api_response
from critic.api.schema import problem_responses, wrapped
from critic.api.views import V3APIView
from review.models import Review

DEFAULT_LIMIT = 10
MAX_LIMIT = 50


class TagLimit(V3LimitOffsetPagination):
    # Only get_limit() is used, so `limit` behaves like v3 pagination: larger
    # values are cut down, invalid ones fall back to the default.
    default_limit = DEFAULT_LIMIT
    max_limit = MAX_LIMIT


def most_used_tags(username, limit):
    """The user's tags as [{name, count}], most used first, then by name.

    Tags are grouped case-insensitively and named by their most frequent
    spelling (ties go to the spelling that sorts first). Empty entries and
    surrounding whitespace are ignored.
    """
    spellings = defaultdict(Counter)
    tag_lists = Review.objects.filter(user__username=username).values_list('review_tags', flat=True)
    for tag_list in tag_lists:
        if not tag_list:
            continue
        for tag in tag_list.split(','):
            tag = tag.strip()
            if tag:
                spellings[tag.casefold()][tag] += 1

    groups = [
        (key, min(counts, key=lambda spelling: (-counts[spelling], spelling)), sum(counts.values()))
        for key, counts in spellings.items()
    ]
    groups.sort(key=lambda group: (-group[2], group[0]))
    return [{'name': name, 'count': count} for _, name, count in groups[:limit]]


class TagSerializer(serializers.Serializer):
    name = serializers.CharField()
    count = serializers.IntegerField(help_text='Number of reviews with this tag')


class TagListView(V3APIView):
    # Keeps the default authentication classes: without `username` the
    # response depends on who is logged in.
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['tags'],
        operation_id='tags_list',
        summary="List a user's most-used tags",
        description=(
            'Tags from the user\'s reviews, most used first, then by name. Tags are '
            'grouped case-insensitively and returned in their most frequent spelling.'
        ),
        parameters=[
            OpenApiParameter(
                'username', OpenApiTypes.STR, OpenApiParameter.QUERY, required=False,
                description='Whose tags to count. Defaults to the logged-in user; required when not logged in.',
            ),
            OpenApiParameter(
                'limit', OpenApiTypes.INT, OpenApiParameter.QUERY, required=False,
                description=(
                    f'Maximum number of tags. Default {DEFAULT_LIMIT}; values above {MAX_LIMIT} '
                    f'are cut down to {MAX_LIMIT}, and invalid values fall back to the default.'
                ),
            ),
        ],
        responses={200: wrapped(TagSerializer, many=True), **problem_responses(400, 401)},
    )
    def get(self, request):
        username = request.query_params.get('username', '').strip()
        if not username:
            if not request.user.is_authenticated:
                raise serializers.ValidationError(
                    {'username': ['This parameter is required when not logged in.']}, code='required',
                )
            username = request.user.username
        tags = most_used_tags(username, TagLimit().get_limit(request))
        return api_response(TagSerializer(tags, many=True).data)
