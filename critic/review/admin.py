from django.contrib import admin

from .models import ReviewItem, ReviewUser, Review

admin.site.register(ReviewItem)
admin.site.register(ReviewUser)
admin.site.register(Review)