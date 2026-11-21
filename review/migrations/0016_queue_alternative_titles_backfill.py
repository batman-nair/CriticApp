from datetime import datetime, timezone

from django.db import migrations

# Older than any real refresh, so refresh_review_items (which picks the
# oldest last_refreshed_at first) takes these items before anything else.
# NULL would also make them due, but Postgres sorts NULLs last.
BACKFILL_QUEUED_AT = datetime(2000, 1, 1, tzinfo=timezone.utc)


def queue_alternative_titles_backfill(apps, schema_editor):
    """Mark anime and manga items still missing alternative titles as due for a refresh.

    Otherwise each one waits until it's 14 days stale before the hourly
    refresh job fetches its other titles.
    """
    ReviewItem = apps.get_model('review', 'ReviewItem')
    ReviewItem.objects.filter(
        category__in=('anime', 'manga'),
        item_id__startswith='mal_',
        alternative_titles='',
    ).update(last_refreshed_at=BACKFILL_QUEUED_AT)


class Migration(migrations.Migration):

    dependencies = [
        ('review', '0015_reviewitem_alternative_titles'),
    ]

    operations = [
        # The reverse leaves the dates alone: the old ones are gone, and an
        # early refresh does no harm.
        migrations.RunPython(queue_alternative_titles_backfill, migrations.RunPython.noop),
    ]
