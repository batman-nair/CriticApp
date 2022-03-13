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
    review_item = ReviewItemSerializer()

    class Meta:
        model = Review
        fields = '__all__'

    def create(self, validated_data):
        # Create review item if it doesn't exist
        review_item_json = validated_data.pop('review_item')
        try:
            review_item_obj = ReviewItem.objects.get(item_id=review_item_json['item_id'])
        except ReviewItem.DoesNotExist:
            item_serializer = ReviewItemSerializer(data=review_item_json)
            item_serializer.is_valid(raise_exception=True)
            review_item_obj = item_serializer.save()
        review_obj = Review.objects.create(review_item=review_item_obj, **validated_data)
        return review_obj

