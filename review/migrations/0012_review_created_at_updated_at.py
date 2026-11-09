from datetime import datetime, time, timezone

from django.db import migrations, models


def backfill_updated_at(apps, schema_editor):
    Review = apps.get_model('review', 'Review')
    days = Review.objects.order_by().values_list('modified_date', flat=True).distinct()
    for day in list(days):
        # A queryset update leaves modified_date (auto_now) as it was.
        Review.objects.filter(modified_date=day).update(
            updated_at=datetime.combine(day, time.min, tzinfo=timezone.utc)
        )


class Migration(migrations.Migration):

    dependencies = [
        ('review', '0011_rename_jikan_item_ids_to_mal'),
    ]

    operations = [
        # Plain fields first: adding them with auto_now* would make Django fill
        # every existing row with now().
        migrations.AddField(
            model_name='review',
            name='created_at',
            field=models.DateTimeField(null=True),
        ),
        migrations.AddField(
            model_name='review',
            name='updated_at',
            field=models.DateTimeField(null=True),
        ),
        migrations.RunPython(backfill_updated_at, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='review',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AlterField(
            model_name='review',
            name='updated_at',
            field=models.DateTimeField(auto_now=True, null=True),
        ),
    ]
