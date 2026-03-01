from datetime import timedelta
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from review.models import ReviewItem


class _ProviderStub:
    def __init__(self, response_by_item_id):
        self._response_by_item_id = response_by_item_id

    def get_details(self, item_id):
        return self._response_by_item_id[item_id]


class _ProviderExceptionStub:
    def get_details(self, item_id):
        raise RuntimeError(f'boom-{item_id}')


class RefreshReviewItemsCommandTest(TestCase):
    def _create_item(self, item_id, **kwargs):
        defaults = {
            'category': 'movie',
            'title': 'Old Title',
            'image_url': 'https://example.com/old.jpg',
            'year': '2000',
            'attr1': 'old1',
            'attr2': 'old2',
            'attr3': 'old3',
            'description': 'old description',
            'rating': '5',
        }
        defaults.update(kwargs)
        return ReviewItem.objects.create(item_id=item_id, **defaults)

    def test_refreshes_stale_items_up_to_max_items(self):
        stale_oldest = self._create_item('omdb_a')
        stale_next = self._create_item('omdb_b')
        stale_oldest.last_refreshed_at = timezone.now() - timedelta(days=30)
        stale_oldest.save(update_fields=['last_refreshed_at'])
        stale_next.last_refreshed_at = timezone.now() - timedelta(days=30)
        stale_next.save(update_fields=['last_refreshed_at'])

        provider = _ProviderStub({
            'omdb_a': {
                'response': 'True',
                'title': 'Fresh Title A',
                'image_url': 'https://example.com/fresh-a.jpg',
                'year': '2024',
                'attr1': 'genre',
                'attr2': 'crew',
                'attr3': 'movie',
                'description': 'fresh description',
                'rating': '9.2',
            },
            'omdb_b': {
                'response': 'True',
                'title': 'Fresh Title B',
                'image_url': 'https://example.com/fresh-b.jpg',
                'year': '2025',
                'attr1': 'genre',
                'attr2': 'crew',
                'attr3': 'movie',
                'description': 'fresh description',
                'rating': '9.5',
            },
        })

        with mock.patch('review.management.commands.refresh_review_items.Command._build_provider', return_value=provider):
            call_command('refresh_review_items', max_items=1, stale_days=14)

        stale_oldest.refresh_from_db()
        stale_next.refresh_from_db()

        self.assertEqual(stale_oldest.title, 'Fresh Title A')
        self.assertEqual(stale_oldest.image_url, 'https://example.com/fresh-a.jpg')
        self.assertIsNotNone(stale_oldest.last_refreshed_at)
        self.assertEqual(stale_oldest.refresh_error_count, 0)

        self.assertEqual(stale_next.title, 'Old Title')
        self.assertEqual(stale_next.image_url, 'https://example.com/old.jpg')

    def test_failed_refresh_keeps_existing_data_and_increments_errors(self):
        item = self._create_item('omdb_fail')
        item.last_refreshed_at = timezone.now() - timedelta(days=30)
        item.last_refresh_attempt_at = timezone.now() - timedelta(days=30)
        item.save(update_fields=['last_refreshed_at', 'last_refresh_attempt_at'])

        provider = _ProviderStub({
            'omdb_fail': {
                'response': 'False',
                'error': 'Upstream unavailable',
            },
        })

        with mock.patch('review.management.commands.refresh_review_items.Command._build_provider', return_value=provider):
            call_command('refresh_review_items', max_items=10, stale_days=14, min_retry_hours=0)

        item.refresh_from_db()

        self.assertEqual(item.title, 'Old Title')
        self.assertEqual(item.image_url, 'https://example.com/old.jpg')
        self.assertEqual(item.refresh_error_count, 1)
        self.assertIsNotNone(item.last_refresh_attempt_at)

    def test_emits_pushgateway_run_metrics_with_provider_totals(self):
        item = self._create_item('omdb_push')
        item.last_refreshed_at = timezone.now() - timedelta(days=30)
        item.last_refresh_attempt_at = timezone.now() - timedelta(days=30)
        item.save(update_fields=['last_refreshed_at', 'last_refresh_attempt_at'])

        provider = _ProviderStub({
            'omdb_push': {
                'response': 'True',
                'title': 'Fresh Push Title',
                'image_url': 'https://example.com/fresh-push.jpg',
                'year': '2026',
                'attr1': 'genre',
                'attr2': 'crew',
                'attr3': 'movie',
                'description': 'fresh description',
                'rating': '9.8',
            },
        })

        with mock.patch('review.management.commands.refresh_review_items.Command._build_provider', return_value=provider):
            with mock.patch('review.management.commands.refresh_review_items.push_refresh_run_metrics') as push_mock:
                call_command('refresh_review_items', max_items=10, stale_days=14, min_retry_hours=0)

        self.assertTrue(push_mock.called)
        kwargs = push_mock.call_args.kwargs
        self.assertTrue(kwargs['success'])
        self.assertEqual(kwargs['processed'], 1)
        self.assertEqual(kwargs['refreshed'], 1)
        self.assertEqual(kwargs['failed'], 0)
        self.assertEqual(kwargs['skipped'], 0)
        self.assertIn('omdb', kwargs['provider_totals'])
        self.assertEqual(kwargs['provider_totals']['omdb']['processed'], 1)
        self.assertEqual(kwargs['provider_totals']['omdb']['refreshed'], 1)

    def test_emits_failed_pushgateway_run_metrics_when_provider_crashes(self):
        item = self._create_item('omdb_exception')
        item.last_refreshed_at = timezone.now() - timedelta(days=30)
        item.last_refresh_attempt_at = timezone.now() - timedelta(days=30)
        item.save(update_fields=['last_refreshed_at', 'last_refresh_attempt_at'])

        with mock.patch(
            'review.management.commands.refresh_review_items.Command._build_provider',
            return_value=_ProviderExceptionStub(),
        ):
            with mock.patch('review.management.commands.refresh_review_items.push_refresh_run_metrics') as push_mock:
                with self.assertRaises(RuntimeError):
                    call_command('refresh_review_items', max_items=10, stale_days=14, min_retry_hours=0)

        self.assertTrue(push_mock.called)
        kwargs = push_mock.call_args.kwargs
        self.assertFalse(kwargs['success'])
        self.assertEqual(kwargs['processed'], 1)
        self.assertEqual(kwargs['refreshed'], 0)
        self.assertEqual(kwargs['failed'], 0)
        self.assertEqual(kwargs['skipped'], 0)
        self.assertIn('omdb', kwargs['provider_totals'])
        self.assertEqual(kwargs['provider_totals']['omdb']['processed'], 1)
