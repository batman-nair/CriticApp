from rest_framework import serializers
import re

from .models import Review, ReviewItem

class ReviewItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewItem
        fields = '__all__'
        extra_kwargs = {
            'item_id': {
                'validators': []
            }
        }

class ReviewSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Review
        fields = '__all__'
        extra_kwargs = {
            'review_tags': {
                'required': False,
                'allow_null': True,
                'allow_blank': True,
            }
        }

    def validate_review_data(self, value):
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError('Review text cannot be blank when provided.')
        if len(cleaned) > 5000:
            raise serializers.ValidationError('Review text must be 5000 characters or fewer.')
        return cleaned

    def validate_review_tags(self, value):
        if value is None:
            return value
        tags = [tag.strip() for tag in value.split(',') if tag.strip()]
        if len(tags) > 10:
            raise serializers.ValidationError('You can provide at most 10 tags.')
        for tag in tags:
            if len(tag) > 50:
                raise serializers.ValidationError('Each tag must be 50 characters or fewer.')
            if not re.fullmatch(r'[A-Za-z0-9-]+', tag):
                raise serializers.ValidationError('Tags may contain only letters, numbers, and hyphens.')
        return ','.join(tags)


class ExternalLookupSerializer(serializers.Serializer):
    item_id = serializers.CharField(required=False, min_length=1, max_length=100)
    search_term = serializers.CharField(required=False, min_length=1, max_length=100)

    def validate_search_term(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Search term cannot be empty.')
        return value
