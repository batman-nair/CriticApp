from django.contrib import admin

from .models import ReviewItem, ReviewUser

admin.site.register(ReviewItem)
admin.site.register(ReviewUser)