from django.db import migrations


JIKAN_TO_MAL_PREFIXES = {
    'jikan_anime_': 'mal_anime_',
    'jikan_manga_': 'mal_manga_',
}


def _rename_prefixes(apps, prefixes):
    ReviewItem = apps.get_model('review', 'ReviewItem')
    Review = apps.get_model('review', 'Review')
    for old_prefix, new_prefix in prefixes.items():
        old_ids = list(
            ReviewItem.objects.filter(item_id__startswith=old_prefix).values_list('item_id', flat=True)
        )
        for old_id in old_ids:
            new_id = new_prefix + old_id[len(old_prefix):]
            # A copy of the row under the new id. An existing row with that id
            # raises IntegrityError, so nothing is merged.
            item = ReviewItem.objects.get(pk=old_id)
            item.item_id = new_id
            item.save(force_insert=True)
            # A queryset update leaves modified_date (auto_now) as it was.
            Review.objects.filter(review_item_id=old_id).update(review_item_id=new_id)
            # By exact id, so a row added under the old prefix meanwhile isn't
            # deleted, with its reviews, by the CASCADE.
            ReviewItem.objects.filter(pk=old_id).delete()


def rename_jikan_to_mal(apps, schema_editor):
    _rename_prefixes(apps, JIKAN_TO_MAL_PREFIXES)


def rename_mal_to_jikan(apps, schema_editor):
    _rename_prefixes(apps, {new: old for old, new in JIKAN_TO_MAL_PREFIXES.items()})


class Migration(migrations.Migration):

    dependencies = [
        ('review', '0010_upstreamapiusage'),
    ]

    operations = [
        migrations.RunPython(rename_jikan_to_mal, rename_mal_to_jikan),
    ]
