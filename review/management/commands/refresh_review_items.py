from datetime import timedelta
import time

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from review.models import ReviewItem
from review.utils import api_utils


class Command(BaseCommand):
    help = 'Refresh stale ReviewItem metadata from external providers with per-run rate limiting.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--stale-days',
            type=int,
            default=14,
            help='Refresh items older than this many days (default: 14).',
        )
        parser.add_argument(
            '--max-items',
            type=int,
            default=25,
            help='Maximum number of stale items to refresh in one run (default: 25).',
        )
        parser.add_argument(
            '--min-retry-hours',
            type=int,
            default=6,
            help='Minimum hours between refresh attempts for the same item (default: 6).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Select and report items but do not persist updates.',
        )
        parser.add_argument(
            '--request-delay-ms',
            type=int,
            default=400,
            help='Delay between external refresh requests in milliseconds (default: 400).',
        )

    def handle(self, *args, **options):
        stale_days = options['stale_days']
        max_items = options['max_items']
        min_retry_hours = options['min_retry_hours']
        dry_run = options['dry_run']
        request_delay_ms = options['request_delay_ms']

        if stale_days < 0:
            self.stderr.write(self.style.ERROR('--stale-days must be >= 0'))
            return
        if max_items <= 0:
            self.stderr.write(self.style.ERROR('--max-items must be > 0'))
            return
        if min_retry_hours < 0:
            self.stderr.write(self.style.ERROR('--min-retry-hours must be >= 0'))
            return
        if request_delay_ms < 0:
            self.stderr.write(self.style.ERROR('--request-delay-ms must be >= 0'))
            return

        now = timezone.now()
        stale_cutoff = now - timedelta(days=stale_days)
        retry_cutoff = now - timedelta(hours=min_retry_hours)

        stale_items = (
            ReviewItem.objects.filter(
                Q(last_refreshed_at__isnull=True) | Q(last_refreshed_at__lte=stale_cutoff),
                Q(last_refresh_attempt_at__isnull=True) | Q(last_refresh_attempt_at__lte=retry_cutoff),
            )
            .order_by('last_refreshed_at', 'item_id')[:max_items]
        )

        providers = {}
        processed = 0
        refreshed = 0
        failed = 0
        skipped = 0

        for item in stale_items:
            processed += 1
            provider = providers.get(item.category)
            if item.category not in providers:
                provider = self._build_provider(item.category)
                providers[item.category] = provider

            if provider is None:
                skipped += 1
                self.stderr.write(self.style.WARNING(
                    f'Skipping {item.item_id}: no provider available for category "{item.category}".'
                ))
                if not dry_run:
                    item.last_refresh_attempt_at = now
                    item.refresh_error_count += 1
                    item.save(update_fields=['last_refresh_attempt_at', 'refresh_error_count'])
                continue

            if request_delay_ms:
                time.sleep(request_delay_ms / 1000)

            details = provider.get_details(item.item_id)
            if details.get('response') != 'True':
                failed += 1
                if not dry_run:
                    item.last_refresh_attempt_at = now
                    item.refresh_error_count += 1
                    item.save(update_fields=['last_refresh_attempt_at', 'refresh_error_count'])
                err_message = details.get("error", "Unknown error")
                status_code = details.get("status_code")
                upstream_reason = details.get("upstream_reason")
                if status_code:
                    err_message = f'{err_message} status={status_code}'
                if upstream_reason:
                    err_message = f'{err_message} reason={upstream_reason}'
                self.stderr.write(self.style.WARNING(
                    f'Failed refresh for {item.item_id}: {err_message}.'
                ))
                continue

            refreshed += 1
            if dry_run:
                continue

            item.title = details.get('title', item.title)
            item.image_url = details.get('image_url', item.image_url)
            item.year = details.get('year', item.year)
            item.attr1 = details.get('attr1', item.attr1)
            item.attr2 = details.get('attr2', item.attr2)
            item.attr3 = details.get('attr3', item.attr3)
            item.description = details.get('description', item.description)
            item.rating = str(details.get('rating', item.rating))
            item.last_refreshed_at = now
            item.last_refresh_attempt_at = now
            item.refresh_error_count = 0
            item.save()

        self.stdout.write(self.style.SUCCESS(
            f'Refresh complete. processed={processed} refreshed={refreshed} failed={failed} skipped={skipped} dry_run={dry_run}'
        ))

    def _build_provider(self, category):
        try:
            if category == 'movie':
                return api_utils.OMDBItemAPI()
            if category == 'game':
                return api_utils.RAWGItemAPI()
            if category == 'anime':
                return api_utils.JikanItemAPI('anime')
            if category == 'manga':
                return api_utils.JikanItemAPI('manga')
        except RuntimeError as ex:
            self.stderr.write(self.style.WARNING(f'Provider init failed for {category}: {ex}'))
            return None
        return None
