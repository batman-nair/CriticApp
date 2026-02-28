from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('review', '0006_alter_reviewitem_attr1_alter_reviewitem_attr2_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='reviewitem',
            name='last_refreshed_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='reviewitem',
            name='last_refresh_attempt_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='reviewitem',
            name='refresh_error_count',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
