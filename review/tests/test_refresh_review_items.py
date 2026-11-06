from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from review.models import ReviewItem
from review.providers import ItemDetails, ItemNotFound, UpstreamError


def _details(item_id, category='movie', **fields):
    return ItemDetails(item_id=item_id, category=category, **fields)


class _ProviderStub:
    def __init__(self, response_by_item_id):
        self._response_by_item_id = response_by_item_id

    def get_details(self, item_id):
        response = self._response_by_item_id[item_id]
        if isinstance(response, Exception):
            raise response
        return response


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
            'omdb_a': _details(
                'omdb_a',
                title='Fresh Title A',
                image_url='https://example.com/fresh-a.jpg',
                year='2024',
                genres=['genre'],
                creators=['crew'],
                media_type='movie',
                description='fresh description',
                provider_rating=9.2,
            ),
            'omdb_b': _details(
                'omdb_b',
                title='Fresh Title B',
                image_url='https://example.com/fresh-b.jpg',
                year='2025',
                genres=['genre'],
                creators=['crew'],
                media_type='movie',
                description='fresh description',
                provider_rating=9.5,
            ),
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
            'omdb_fail': UpstreamError('Upstream unavailable'),
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
            'omdb_push': _details(
                'omdb_push',
                title='Fresh Push Title',
                image_url='https://example.com/fresh-push.jpg',
                year='2026',
                genres=['genre'],
                creators=['crew'],
                media_type='movie',
                description='fresh description',
                provider_rating=9.8,
            ),
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

    @mock.patch.dict('os.environ', {'OMDB_API_KEY': 'key-123'})
    def test_series_items_use_series_omdb_provider(self):
        from review.management.commands.refresh_review_items import Command

        provider = Command()._build_provider('series')

        self.assertEqual(provider.category, 'series')
        self.assertEqual(Command()._provider_name_for_category('series'), 'omdb')

    def test_book_items_use_open_library_provider(self):
        from review.management.commands.refresh_review_items import Command
        from review.providers.openlibrary import OpenLibraryProvider

        self.assertIsInstance(Command()._build_provider('book'), OpenLibraryProvider)
        self.assertEqual(Command()._provider_name_for_category('book'), 'openlibrary')

    def test_refresh_fills_language(self):
        item = self._create_item('omdb_lang')
        provider = _ProviderStub({
            'omdb_lang': _details(
                'omdb_lang',
                title='Old Title',
                media_type='movie',
                languages=['Japanese', 'English'],
            ),
        })

        with mock.patch('review.management.commands.refresh_review_items.Command._build_provider', return_value=provider):
            call_command('refresh_review_items', max_items=10, stale_days=14, min_retry_hours=0, request_delay_ms=0)

        item.refresh_from_db()
        self.assertEqual(item.language, 'Japanese, English')

    def test_refresh_keeps_language_when_provider_has_none(self):
        item = self._create_item('rawg_lang', category='game', language='English')
        provider = _ProviderStub({'rawg_lang': _details('rawg_lang', category='game', title='Old Title')})

        with mock.patch('review.management.commands.refresh_review_items.Command._build_provider', return_value=provider):
            call_command('refresh_review_items', max_items=10, stale_days=14, min_retry_hours=0, request_delay_ms=0)

        item.refresh_from_db()
        self.assertEqual(item.language, 'English')

    def test_refreshed_fields_are_stored_as_the_columns_expect(self):
        item = self._create_item('omdb_fields')
        provider = _ProviderStub({
            'omdb_fields': _details(
                'omdb_fields',
                title='Fresh Title',
                year='2024',
                genres=['Crime', 'Drama'],
                creators=['Vince Gilligan', 'Bryan Cranston'],
                media_type='movie',
                description='fresh description',
                provider_rating=9.5,
            ),
        })

        with mock.patch('review.management.commands.refresh_review_items.Command._build_provider', return_value=provider):
            call_command('refresh_review_items', max_items=10, stale_days=14, min_retry_hours=0, request_delay_ms=0)

        item.refresh_from_db()
        self.assertEqual(item.image_url, 'N/A')
        self.assertEqual(item.attr1, 'Crime, Drama')
        self.assertEqual(item.attr2, 'Vince Gilligan, Bryan Cranston')
        self.assertEqual(item.attr3, 'movie')
        self.assertEqual(item.language, '')
        self.assertEqual(item.rating, '9.5')

    def test_failed_refresh_reports_upstream_status_and_reason(self):
        self._create_item('omdb_status')
        provider = _ProviderStub({
            'omdb_status': UpstreamError('Bad response from API.', status_code=503, upstream_reason='Service Unavailable'),
        })
        stderr = StringIO()

        with mock.patch('review.management.commands.refresh_review_items.Command._build_provider', return_value=provider):
            call_command('refresh_review_items', max_items=10, stale_days=14, min_retry_hours=0, request_delay_ms=0, stderr=stderr)

        self.assertIn(
            'Failed refresh for omdb_status: Bad response from API. status=503 reason=Service Unavailable.',
            stderr.getvalue(),
        )

    def test_failed_refresh_reports_status_of_a_not_found_item(self):
        self._create_item('rawg_gone', category='game')
        not_found = ItemNotFound('Bad response from API.')
        not_found.__cause__ = UpstreamError('Bad response from API.', status_code=404, upstream_reason='Not Found')
        provider = _ProviderStub({'rawg_gone': not_found})
        stderr = StringIO()

        with mock.patch('review.management.commands.refresh_review_items.Command._build_provider', return_value=provider):
            call_command('refresh_review_items', max_items=10, stale_days=14, min_retry_hours=0, request_delay_ms=0, stderr=stderr)

        self.assertIn('Failed refresh for rawg_gone: Bad response from API. status=404 reason=Not Found.', stderr.getvalue())
