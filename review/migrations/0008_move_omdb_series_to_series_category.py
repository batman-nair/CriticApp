from django.db import migrations


def move_series_to_series_category(apps, schema_editor):
    ReviewItem = apps.get_model('review', 'ReviewItem')
    # OMDb items keep the OMDb "Type" in attr3.
    ReviewItem.objects.filter(category='movie', attr3='series').update(category='series')


def move_series_back_to_movie_category(apps, schema_editor):
    ReviewItem = apps.get_model('review', 'ReviewItem')
    ReviewItem.objects.filter(category='series').update(category='movie')


class Migration(migrations.Migration):

    dependencies = [
        ('review', '0007_reviewitem_refresh_tracking'),
    ]

    operations = [
        migrations.RunPython(move_series_to_series_category, move_series_back_to_movie_category),
    ]
