from rest_framework import serializers

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
