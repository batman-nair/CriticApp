from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator

class ReviewItem(models.Model):
    item_id = models.CharField(max_length=20, primary_key=True)
    category = models.CharField(max_length=20)
    title = models.CharField(max_length=100)
    image_url = models.URLField()
    year = models.CharField(max_length=10)
    attr1 = models.CharField(max_length=300)
    attr2 = models.CharField(max_length=300)
    attr3 = models.CharField(max_length=300)
    description = models.TextField()
    rating = models.CharField(max_length=5)

    def __str__(self):
        return '{}({})'.format(self.title, self.item_id)

class Review(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    review_item = models.ForeignKey(ReviewItem, on_delete=models.CASCADE)
    review_rating = models.DecimalField(max_digits=4, decimal_places=2, validators=[MinValueValidator(0.0), MaxValueValidator(10.0)])
    review_data = models.TextField(null=True)
    review_tags = models.CharField(max_length=100, null=True)
    modified_date = models.DateField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'review_item'], name='unique review')
            ]

    def __str__(self):
        return '{}'.format(self.review_item.title)
