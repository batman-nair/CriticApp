from django.db import models
from django.contrib.auth.models import AbstractUser

class ReviewItem(models.Model):
    item_id = models.CharField(max_length=20, primary_key=True)
    category = models.CharField(max_length=10)
    title = models.CharField(max_length=100)
    image_url = models.URLField()
    year = models.CharField(max_length=10)
    attr1 = models.CharField(max_length=120)
    attr2 = models.CharField(max_length=120)
    attr3 = models.CharField(max_length=120)
    description = models.TextField()
    rating = models.CharField(max_length=5)

    @classmethod
    def from_review_json(cls, Category, ItemID, Title, ImageURL, Year, Attr1, Attr2, Attr3, Description, Rating, Response):
        review_item = cls(item_id=ItemID, category=Category, title=Title, image_url=ImageURL, year=Year, attr1=Attr1, attr2=Attr2, attr3=Attr3, description=Description, rating=Rating)
        return review_item

    def to_review_json(self):
        review_json = {
            'ItemID': self.item_id,
            'Category': self.category,
            'Title': self.title,
            'ImageURL': self.image_url,
            'Year': self.year,
            'Attr1': self.attr1,
            'Attr2': self.attr2,
            'Attr3': self.attr3,
            'Description': self.description,
            'Rating': self.rating,
            'Response': "True",
         }
        return review_json


class ReviewUser(AbstractUser):
    pass