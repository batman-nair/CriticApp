from datetime import date, timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase

from review.management.commands.map_rawg_to_igdb import (
    AMBIGUOUS,
    CHECK,
    MATCH,
    NOT_FOUND,
    classify,
    main_title,
    normalize_title,
    parse_year,
)
from review.models import Review, ReviewItem
from review.providers import ItemDetails, ItemNotFound, ItemSummary, UpstreamError

COMMAND_MODULE = 'review.management.commands.map_rawg_to_igdb'


def _summary(item_id, title, year=None):
    return ItemSummary(item_id=item_id, category='game', title=title, year=year)


def _details(item_id, title, year=None, **fields):
    return ItemDetails(item_id=item_id, category='game', title=title, year=year, **fields)


class _IGDBStub:
    """Answers search and get_details from tables keyed by query / item id.

    Anything missing raises ItemNotFound, like the provider.
    """

    def __init__(self, search=None, hints=None, details=None):
        self._search = search or {}
        self._hints = hints or {}
        self._details = details or {}
        self.calls = []

    def search(self, query, all_types=False):
        self.calls.append(('search_all_types' if all_types else 'search', query))
        return self._answer((self._hints if all_types else self._search).get(query))

    def get_details(self, item_id):
        self.calls.append(('get_details', item_id))
        return self._answer(self._details.get(item_id))

    @staticmethod
    def _answer(response):
        if response is None:
            raise ItemNotFound('Game not found!')
        if isinstance(response, Exception):
            raise response
        return response


class NormalizeTitleTest(SimpleTestCase):
    def test_accents_are_stripped(self):
        self.assertEqual(normalize_title('Pokémon Rubí'), 'pokemon rubi')

    def test_trademark_and_registered_signs_are_removed_before_unicode_normalization(self):
        self.assertEqual(normalize_title('DOOM™'), 'doom')
        self.assertEqual(normalize_title('Tom Clancy’s Rainbow Six® Siege'), 'tom clancy s rainbow six siege')

    def test_ampersand_becomes_and(self):
        self.assertEqual(normalize_title('Ratchet & Clank'), 'ratchet and clank')
        self.assertEqual(normalize_title('Ratchet&Clank'), normalize_title('Ratchet and Clank'))

    def test_punctuation_and_case_are_dropped(self):
        self.assertEqual(normalize_title('  Hello,   WORLD!  (Remastered) '), 'hello world remastered')
        self.assertEqual(normalize_title('Half-Life 2'), 'half life 2')

    def test_main_title_drops_the_subtitle(self):
        self.assertEqual(main_title('The Witcher 3: Wild Hunt'), 'the witcher 3')
        self.assertEqual(main_title('Doom - Eternal Edition'), 'doom')
        self.assertEqual(main_title('Halo – Reach'), 'halo')
        self.assertEqual(main_title('Halo — Reach'), 'halo')
        self.assertEqual(main_title('Half-Life 2'), 'half life 2')


class ParseYearTest(SimpleTestCase):
    def test_years(self):
        self.assertEqual(parse_year('2015'), 2015)
        self.assertEqual(parse_year('2015-05-18'), 2015)
        self.assertIsNone(parse_year('N/A'))
        self.assertIsNone(parse_year(''))
        self.assertIsNone(parse_year(None))
        self.assertIsNone(parse_year('20155'))


class ClassifyTest(SimpleTestCase):
    def test_match_same_title_and_year(self):
        witcher = _summary('igdb_1942', 'The Witcher 3: Wild Hunt', '2015')
        other = _summary('igdb_9', 'The Witcher 3: Wild Hunt - Complete Edition', '2016')
        self.assertEqual(
            classify('The Witcher 3: Wild Hunt', '2015-05-18', [other, witcher]),
            (MATCH, witcher, []),
        )

    def test_one_exact_wins_over_other_plausible_candidates(self):
        exact = _summary('igdb_1', 'Doom', '2016')
        near = _summary('igdb_2', 'Doom', '2017')
        self.assertEqual(classify('DOOM™', '2016-05-13', [near, exact]), (MATCH, exact, []))

    def test_check_when_year_is_off_by_one(self):
        candidate = _summary('igdb_1', 'Celeste', '2018')
        self.assertEqual(classify('Celeste', '2017-12-31', [candidate]), (CHECK, candidate, []))

    def test_not_found_when_year_is_off_by_two(self):
        candidate = _summary('igdb_1', 'Celeste', '2019')
        self.assertEqual(classify('Celeste', '2017-12-31', [candidate]), (NOT_FOUND, None, []))

    def test_check_when_rawg_subtitle_is_dropped(self):
        candidate = _summary('igdb_1', 'The Witcher 3', '2015')
        self.assertEqual(classify('The Witcher 3: Wild Hunt', '2015-05-18', [candidate]), (CHECK, candidate, []))

    def test_check_when_igdb_subtitle_is_dropped(self):
        candidate = _summary('igdb_1', 'Hades: Battle out of Hell', '2020')
        self.assertEqual(classify('Hades', '2020-09-17', [candidate]), (CHECK, candidate, []))

    def test_subtitles_differing_on_both_sides_do_not_match(self):
        candidate = _summary('igdb_1', 'Batman: Arkham Asylum', '2011')
        self.assertEqual(classify('Batman: Arkham City', '2011-10-18', [candidate]), (NOT_FOUND, None, []))

    def test_unknown_rawg_year_with_exact_title_is_check(self):
        candidate = _summary('igdb_1', 'Celeste', '2018')
        self.assertEqual(classify('Celeste', 'N/A', [candidate]), (CHECK, candidate, []))

    def test_unknown_igdb_year_with_exact_title_is_check(self):
        candidate = _summary('igdb_1', 'Celeste', None)
        self.assertEqual(classify('Celeste', '2018-01-25', [candidate]), (CHECK, candidate, []))

    def test_ambiguous_with_several_exact_candidates(self):
        first = _summary('igdb_1', 'Doom', '2016')
        second = _summary('igdb_2', 'DOOM', '2016')
        self.assertEqual(classify('Doom', '2016-05-13', [first, second]), (AMBIGUOUS, None, [first, second]))

    def test_ambiguous_lists_top_three_plausible_in_igdb_order(self):
        candidates = [
            _summary('igdb_1', 'Prey', '2017'),
            _summary('igdb_2', 'Prey', '2016'),
            _summary('igdb_3', 'Prey: Mooncrash', '2018'),
            _summary('igdb_4', 'Prey', None),
            _summary('igdb_5', 'Prey', '2006'),
        ]
        self.assertEqual(
            classify('Prey', 'N/A', candidates),
            (AMBIGUOUS, None, candidates[:3]),
        )

    def test_not_found_without_candidates(self):
        self.assertEqual(classify('Prey', '2017-05-05', []), (NOT_FOUND, None, []))


class MapRawgToIgdbCommandTest(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.alice = user_model.objects.create_user(username='alice', password='pw')
        self.bob = user_model.objects.create_user(username='bob', password='pw')
        sleep_patcher = mock.patch(f'{COMMAND_MODULE}.time.sleep')
        self.sleep = sleep_patcher.start()
        self.addCleanup(sleep_patcher.stop)

    def _item(self, item_id, title, year='2015-05-18', **fields):
        values = {
            'category': 'game',
            'title': title,
            'image_url': 'https://example.com/{}.jpg'.format(item_id),
            'year': year,
            'attr1': 'RPG',
            'attr2': 'Dev',
            'attr3': 'PC',
            'description': 'old',
            'rating': '4.5',
        }
        values.update(fields)
        return ReviewItem.objects.create(item_id=item_id, **values)

    def _review(self, user, item, rating='8.0'):
        return Review.objects.create(user=user, review_item=item, review_rating=rating, review_data='text')

    def _run(self, provider, *args):
        stdout, stderr = StringIO(), StringIO()
        with mock.patch(f'{COMMAND_MODULE}.get_provider', return_value=provider) as get_provider:
            call_command('map_rawg_to_igdb', *args, stdout=stdout, stderr=stderr)
        self.get_provider = get_provider
        return stdout.getvalue(), stderr.getvalue()

    def _run_failing(self, provider, *args):
        stdout, stderr = StringIO(), StringIO()
        with mock.patch(f'{COMMAND_MODULE}.get_provider', return_value=provider):
            with self.assertRaises(CommandError) as raised:
                call_command('map_rawg_to_igdb', *args, stdout=stdout, stderr=stderr)
        return raised.exception, stdout.getvalue(), stderr.getvalue()

    def _four_statuses(self):
        """One stored rawg_ item per status, with the stub that produces it."""
        self.witcher = self._item('rawg_1', 'The Witcher 3: Wild Hunt', '2015-05-18')
        self.celeste = self._item('rawg_2', 'Celeste', '2017-12-31')
        self.doom = self._item('rawg_3', 'Doom', 'N/A')
        self.wine = self._item('rawg_4', 'Blood and Wine', '2016-05-31')
        for item in (self.witcher, self.celeste, self.doom, self.wine):
            self._review(self.alice, item)
        return _IGDBStub(
            search={
                'The Witcher 3: Wild Hunt': [_summary('igdb_1942', 'The Witcher 3: Wild Hunt', '2015')],
                'Celeste': [_summary('igdb_26226', 'Celeste', '2018')],
                'Doom': [
                    _summary('igdb_7351', 'Doom', '2016'),
                    _summary('igdb_673', 'Doom', '1993'),
                    _summary('igdb_9999', 'DOOM', '2019'),
                    _summary('igdb_8888', 'Doom', '2005'),
                ],
            },
            hints={
                'Blood and Wine': [
                    _summary('igdb_12503', 'The Witcher 3: Wild Hunt - Blood and Wine', '2016'),
                    _summary('igdb_2', 'Blood & Wine Collection', None),
                    _summary('igdb_3', 'Wine and Blood', '2001'),
                    _summary('igdb_4', 'Blood Wine', '2002'),
                ],
            },
            details={
                'igdb_1942': _details('igdb_1942', 'The Witcher 3: Wild Hunt', '2015', genres=['RPG'],
                                      platforms=['PC'], provider_rating=9.3),
                'igdb_26226': _details('igdb_26226', 'Celeste', '2018'),
                'igdb_12503': _details('igdb_12503', 'The Witcher 3: Wild Hunt - Blood and Wine', '2016'),
            },
        )

    def _snapshot(self):
        return (
            list(ReviewItem.objects.order_by('item_id').values()),
            list(Review.objects.order_by('id').values()),
        )

    # Statuses and output

    def test_dry_run_prints_each_status(self):
        provider = self._four_statuses()

        stdout, _ = self._run(provider)

        lines = stdout.splitlines()
        self.assertIn(
            'rawg_1 "The Witcher 3: Wild Hunt" (2015-05-18) reviews=1 -> '
            'igdb_1942 "The Witcher 3: Wild Hunt" (2015) MATCH',
            lines,
        )
        self.assertIn('rawg_2 "Celeste" (2017-12-31) reviews=1 -> igdb_26226 "Celeste" (2018) CHECK', lines)
        self.assertIn('rawg_3 "Doom" (N/A) reviews=1 -> ? AMBIGUOUS', lines)
        self.assertIn('    candidate igdb_7351 "Doom" (2016)', lines)
        self.assertIn('    candidate igdb_673 "Doom" (1993)', lines)
        self.assertIn('    candidate igdb_9999 "DOOM" (2019)', lines)
        self.assertNotIn('igdb_8888', stdout)
        self.assertIn('rawg_4 "Blood and Wine" (2016-05-31) reviews=1 -> ? NOT_FOUND', lines)
        self.assertIn('    hint igdb_12503 "The Witcher 3: Wild Hunt - Blood and Wine" (2016)', lines)
        self.assertIn('    hint igdb_2 "Blood & Wine Collection" (N/A)', lines)
        self.assertIn('    hint igdb_3 "Wine and Blood" (2001)', lines)
        self.assertNotIn('igdb_4 ', stdout)
        self.assertEqual(lines[-2], 'MATCH=1 CHECK=1 AMBIGUOUS=1 NOT_FOUND=1 MAP=0 SKIP=0')
        self.assertIn('dry run, nothing written', lines[-1])
        # Only the NOT_FOUND row searches again without the type filter.
        self.assertEqual(provider.calls, [
            ('search', 'The Witcher 3: Wild Hunt'),
            ('search', 'Celeste'),
            ('search', 'Doom'),
            ('search', 'Blood and Wine'),
            ('search_all_types', 'Blood and Wine'),
        ])
        self.get_provider.assert_called_once_with('game')

    def test_sleeps_between_igdb_requests(self):
        provider = self._four_statuses()

        self._run(provider)

        # Five requests, a pause before each but the first.
        self.assertEqual(self.sleep.call_args_list, [mock.call(0.3)] * 4)

    def test_not_found_when_search_finds_nothing_and_no_hints(self):
        item = self._item('rawg_5', 'Obscure Thing')
        self._review(self.alice, item)
        provider = _IGDBStub()

        stdout, _ = self._run(provider)

        self.assertIn('rawg_5 "Obscure Thing" (2015-05-18) reviews=1 -> ? NOT_FOUND', stdout)
        self.assertIn('    no hints from an unfiltered search', stdout)
        self.assertEqual(provider.calls, [('search', 'Obscure Thing'), ('search_all_types', 'Obscure Thing')])

    def test_lists_only_rawg_items_with_reviews_in_id_order(self):
        reviewed_b = self._item('rawg_20', 'Second')
        reviewed_a = self._item('rawg_10', 'First')
        self._item('rawg_30', 'Unreviewed')
        igdb_item = self._item('igdb_40', 'Already IGDB')
        for item in (reviewed_b, reviewed_a, igdb_item):
            self._review(self.alice, item)
        self._review(self.bob, reviewed_a)
        provider = _IGDBStub()

        stdout, _ = self._run(provider)

        self.assertNotIn('rawg_30', stdout)
        self.assertNotIn('igdb_40', stdout)
        self.assertLess(stdout.index('rawg_10 "First" (2015-05-18) reviews=2'), stdout.index('rawg_20 "Second"'))
        self.assertEqual(
            [query for kind, query in provider.calls if kind == 'search'],
            ['First', 'Second'],
        )

    # Dry run

    def test_dry_run_writes_nothing_even_with_map(self):
        provider = self._four_statuses()
        before = self._snapshot()

        stdout, _ = self._run(provider, '--map', 'rawg_2=igdb_26226', '--skip', 'rawg_3')

        self.assertEqual(self._snapshot(), before)
        self.assertIn('rawg_2 "Celeste" (2017-12-31) reviews=1 MAP -> igdb_26226', stdout)
        self.assertIn('rawg_3 "Doom" (N/A) reviews=1 SKIP', stdout)
        self.assertIn('MATCH=1 CHECK=0 AMBIGUOUS=0 NOT_FOUND=1 MAP=1 SKIP=1', stdout)
        self.assertIn('dry run, nothing written', stdout)
        self.assertNotIn('mapped=', stdout)
        # Overridden rows don't search, and a dry run fetches no details.
        self.assertNotIn(('search', 'Celeste'), provider.calls)
        self.assertNotIn(('search', 'Doom'), provider.calls)
        self.assertFalse([call for call in provider.calls if call[0] == 'get_details'])

    # --apply

    def test_apply_maps_match_and_leaves_the_rest(self):
        provider = self._four_statuses()
        witcher_review = Review.objects.get(review_item=self.witcher)

        stdout, _ = self._run(provider, '--apply')

        witcher_review.refresh_from_db()
        self.assertEqual(witcher_review.review_item_id, 'igdb_1942')
        self.assertFalse(ReviewItem.objects.filter(item_id='rawg_1').exists())
        # CHECK, AMBIGUOUS and NOT_FOUND need a flag.
        for item in (self.celeste, self.doom, self.wine):
            self.assertEqual(Review.objects.get(user=self.alice, review_item_id=item.item_id).review_item_id,
                             item.item_id)
        self.assertFalse(ReviewItem.objects.filter(item_id='igdb_26226').exists())
        self.assertIn('    left: needs --map rawg_2=igdb_<n> or --skip rawg_2', stdout)
        self.assertIn('    moved 1 review(s) to igdb_1942', stdout)
        self.assertIn('    deleted rawg_1', stdout)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=1 skipped=0 conflicts=0 left=3')
        self.assertNotIn('dry run', stdout)

    def test_apply_stores_a_fetched_target_with_its_review_item_fields(self):
        provider = self._four_statuses()

        self._run(provider, '--apply')

        target = ReviewItem.objects.get(item_id='igdb_1942')
        expected = provider._details['igdb_1942'].to_review_item_fields()
        for field, value in expected.items():
            self.assertEqual(getattr(target, field), value, field)
        self.assertEqual(target.rating, '9.3')
        self.assertIsNotNone(target.last_refreshed_at)
        self.assertEqual(target.last_refresh_attempt_at, target.last_refreshed_at)
        self.assertEqual(target.refresh_error_count, 0)
        self.assertIn(('get_details', 'igdb_1942'), provider.calls)

    def test_apply_reuses_a_stored_target(self):
        provider = self._four_statuses()
        stored = self._item('igdb_1942', 'Stored Witcher', '2015', description='kept')

        self._run(provider, '--apply')

        stored.refresh_from_db()
        self.assertEqual(stored.title, 'Stored Witcher')
        self.assertEqual(stored.description, 'kept')
        self.assertNotIn(('get_details', 'igdb_1942'), provider.calls)
        self.assertEqual(Review.objects.get(user=self.alice, review_item=stored).review_item_id, 'igdb_1942')

    def test_map_overrides_a_match_and_maps_a_check(self):
        provider = self._four_statuses()

        stdout, _ = self._run(
            provider, '--apply',
            '--map', 'rawg_1=igdb_12503',
            '--map', 'rawg_2=igdb_26226',
            '--skip', 'rawg_3',
        )

        self.assertTrue(Review.objects.filter(user=self.alice, review_item_id='igdb_12503').exists())
        self.assertTrue(Review.objects.filter(user=self.alice, review_item_id='igdb_26226').exists())
        self.assertFalse(ReviewItem.objects.filter(item_id__in=['rawg_1', 'rawg_2', 'igdb_1942']).exists())
        # Skipped and unflagged rows stay.
        self.assertTrue(Review.objects.filter(review_item=self.doom).exists())
        self.assertTrue(Review.objects.filter(review_item=self.wine).exists())
        self.assertNotIn(('search', 'The Witcher 3: Wild Hunt'), provider.calls)
        self.assertNotIn(('search', 'Doom'), provider.calls)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=2 skipped=1 conflicts=0 left=1')

    def test_map_target_missing_on_igdb_is_left(self):
        provider = self._four_statuses()

        stdout, _ = self._run(provider, '--apply', '--map', 'rawg_2=igdb_404')

        self.assertTrue(Review.objects.filter(review_item=self.celeste).exists())
        self.assertFalse(ReviewItem.objects.filter(item_id='igdb_404').exists())
        self.assertIn('    left: --map target igdb_404 not found on IGDB (Game not found!)', stdout)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=1 skipped=0 conflicts=0 left=3')

    def test_unique_conflict_keeps_the_review_on_the_rawg_item(self):
        rawg = self._item('rawg_1', 'Celeste', '2018-01-25')
        target = self._item('igdb_26226', 'Celeste', '2018')
        conflicting = self._review(self.alice, rawg, rating='6.0')
        alice_target_review = self._review(self.alice, target, rating='9.0')
        moving = self._review(self.bob, rawg)
        provider = _IGDBStub(search={'Celeste': [_summary('igdb_26226', 'Celeste', '2018')]})

        stdout, _ = self._run(provider, '--apply')

        conflicting.refresh_from_db()
        moving.refresh_from_db()
        alice_target_review.refresh_from_db()
        self.assertEqual(conflicting.review_item_id, 'rawg_1')
        self.assertEqual(conflicting.review_rating, 6)
        self.assertEqual(moving.review_item_id, 'igdb_26226')
        self.assertEqual(alice_target_review.review_rating, 9)
        self.assertTrue(ReviewItem.objects.filter(item_id='rawg_1').exists())
        self.assertIn(
            f'    conflict: review {conflicting.id} by alice stays on rawg_1, they already reviewed igdb_26226',
            stdout,
        )
        self.assertNotIn('deleted rawg_1', stdout)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=1 skipped=0 conflicts=1 left=0')

    def test_only_conflicts_keeps_the_rawg_item_and_counts_no_mapping(self):
        rawg = self._item('rawg_1', 'Celeste', '2018-01-25')
        target = self._item('igdb_26226', 'Celeste', '2018')
        self._review(self.alice, rawg)
        self._review(self.alice, target)
        provider = _IGDBStub(search={'Celeste': [_summary('igdb_26226', 'Celeste', '2018')]})

        stdout, _ = self._run(provider, '--apply')

        self.assertTrue(ReviewItem.objects.filter(item_id='rawg_1').exists())
        self.assertIn('    moved 0 review(s) to igdb_26226', stdout)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=0 skipped=0 conflicts=1 left=0')

    def test_moving_reviews_keeps_modified_date(self):
        provider = self._four_statuses()
        self._review(self.bob, self.witcher)
        past = date(2020, 1, 2)
        Review.objects.filter(review_item=self.witcher).update(modified_date=past)

        self._run(provider, '--apply')

        moved = Review.objects.filter(review_item_id='igdb_1942')
        self.assertEqual(moved.count(), 2)
        self.assertEqual(set(moved.values_list('modified_date', flat=True)), {past})

    def test_rawg_item_deleted_only_when_no_review_points_at_it(self):
        provider = self._four_statuses()
        celeste_target = self._item('igdb_26226', 'Celeste', '2018')
        # Bob already reviewed the Witcher target; Alice and Bob both reviewed Celeste on RAWG.
        witcher_target = self._item('igdb_1942', 'The Witcher 3: Wild Hunt', '2015')
        self._review(self.bob, witcher_target)
        bob_rawg = self._review(self.bob, self.witcher)
        self._review(self.bob, self.celeste)

        stdout, _ = self._run(provider, '--apply', '--map', 'rawg_2=igdb_26226')

        # rawg_1: Alice's review moved, Bob's stays, so the item is kept.
        self.assertTrue(ReviewItem.objects.filter(item_id='rawg_1').exists())
        self.assertEqual(list(Review.objects.filter(review_item_id='rawg_1')), [bob_rawg])
        self.assertEqual(Review.objects.filter(review_item=witcher_target).count(), 2)
        # rawg_2: every review moved, so the item is gone.
        self.assertFalse(ReviewItem.objects.filter(item_id='rawg_2').exists())
        self.assertEqual(Review.objects.filter(review_item=celeste_target).count(), 2)
        self.assertNotIn('deleted rawg_1', stdout)
        self.assertIn('    deleted rawg_2', stdout)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=2 skipped=0 conflicts=1 left=2')

    def test_rerunning_is_safe(self):
        provider = self._four_statuses()
        flags = ('--map', 'rawg_2=igdb_26226', '--skip', 'rawg_3')
        self._run(provider, '--apply', *flags)
        after_apply = self._snapshot()

        stdout, stderr = self._run(provider)
        self.assertNotIn('rawg_1', stdout)
        self.assertNotIn('rawg_2', stdout)
        self.assertIn('rawg_3 "Doom"', stdout)
        self.assertIn('rawg_4 "Blood and Wine"', stdout)

        stdout, stderr = self._run(provider, '--apply', *flags)
        self.assertEqual(self._snapshot(), after_apply)
        # rawg_2 is gone, so its --map is reported and ignored.
        self.assertIn('Ignoring rawg_2: not a stored RAWG item with reviews.', stderr)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=0 skipped=1 conflicts=0 left=1')

    def test_rerunning_with_a_conflict_changes_nothing(self):
        rawg = self._item('rawg_1', 'Celeste', '2018-01-25')
        target = self._item('igdb_26226', 'Celeste', '2018')
        self._review(self.alice, rawg)
        self._review(self.alice, target)
        provider = _IGDBStub(search={'Celeste': [_summary('igdb_26226', 'Celeste', '2018')]})
        self._run(provider, '--apply')
        before = self._snapshot()

        stdout, _ = self._run(provider, '--apply')

        self.assertEqual(self._snapshot(), before)
        self.assertIn('conflict: review', stdout)

    # Arguments

    def test_invalid_overrides_raise_before_any_igdb_call(self):
        provider = self._four_statuses()
        cases = [
            (['--map', 'rawg_1'], 'Invalid --map'),
            (['--map', 'rawg_1=1942'], 'Invalid --map'),
            (['--map', 'igdb_1942=rawg_1'], 'Invalid --map'),
            (['--map', 'rawg_x=igdb_1'], 'Invalid --map'),
            (['--skip', 'igdb_1'], 'Invalid --skip'),
            (['--map', 'rawg_1=igdb_1', '--skip', 'rawg_1'], 'both mapped and skipped'),
            (['--map', 'rawg_1=igdb_1', '--map', 'rawg_1=igdb_2'], 'mapped more than once'),
        ]
        before = self._snapshot()
        for args, message in cases:
            with self.subTest(args=args):
                error, _, _ = self._run_failing(provider, '--apply', *args)
                self.assertIn(message, str(error))
        self.assertEqual(provider.calls, [])
        self.assertEqual(self._snapshot(), before)

    def test_unknown_override_ids_are_warned_about_and_ignored(self):
        provider = self._four_statuses()
        self._item('rawg_50', 'No Reviews')

        stdout, stderr = self._run(provider, '--apply', '--map', 'rawg_999=igdb_1', '--skip', 'rawg_50')

        self.assertIn('Ignoring rawg_50: not a stored RAWG item with reviews.', stderr)
        self.assertIn('Ignoring rawg_999: not a stored RAWG item with reviews.', stderr)
        self.assertNotIn(('get_details', 'igdb_1'), provider.calls)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=1 skipped=0 conflicts=0 left=3')

    # Failures

    def test_upstream_error_stops_with_command_error_and_summary(self):
        provider = self._four_statuses()
        provider._search['Celeste'] = UpstreamError('Bad response from API.', source='IGDB API', status_code=500)

        error, stdout, _ = self._run_failing(provider, '--apply')

        self.assertIn('Bad response from API.', str(error))
        # The row before the failure stays applied; nothing after it ran.
        self.assertEqual(Review.objects.get(user=self.alice, review_item_id='igdb_1942').review_item_id, 'igdb_1942')
        self.assertNotIn(('search', 'Doom'), provider.calls)
        self.assertEqual(stdout.splitlines()[-1], 'mapped=1 skipped=0 conflicts=0 left=0')

    def test_upstream_error_fetching_target_stops_before_writing(self):
        provider = self._four_statuses()
        provider._details['igdb_1942'] = UpstreamError('Request failure to upstream API.', source='IGDB API')
        before = self._snapshot()

        error, stdout, _ = self._run_failing(provider, '--apply')

        self.assertIn('Request failure to upstream API.', str(error))
        self.assertEqual(self._snapshot(), before)
        self.assertIn('MATCH=1 CHECK=0', stdout)

    def test_upstream_error_in_dry_run_prints_counts(self):
        provider = self._four_statuses()
        provider._hints['Blood and Wine'] = UpstreamError('Exhausted retries calling upstream API.')

        error, stdout, _ = self._run_failing(provider)

        self.assertIn('Exhausted retries', str(error))
        self.assertIn('MATCH=1 CHECK=1 AMBIGUOUS=1 NOT_FOUND=1 MAP=0 SKIP=0', stdout)
        self.assertIn('dry run, nothing written', stdout)

    def test_missing_igdb_keys_raise_command_error(self):
        self._four_statuses()
        stdout = StringIO()
        with mock.patch(f'{COMMAND_MODULE}.get_provider', side_effect=RuntimeError('IGDB_CLIENT_ID and IGDB_CLIENT_SECRET required.')):
            with self.assertRaises(CommandError) as raised:
                call_command('map_rawg_to_igdb', stdout=stdout, stderr=StringIO())

        self.assertIn('IGDB_CLIENT_ID', str(raised.exception))
        self.assertIn('MATCH=0 CHECK=0 AMBIGUOUS=0 NOT_FOUND=0 MAP=0 SKIP=0', stdout.getvalue())

    def test_no_rows_needs_no_igdb(self):
        stdout = StringIO()
        with mock.patch(f'{COMMAND_MODULE}.get_provider', side_effect=RuntimeError('no keys')):
            call_command('map_rawg_to_igdb', '--apply', stdout=stdout, stderr=StringIO())

        self.assertEqual(stdout.getvalue().splitlines()[-1], 'mapped=0 skipped=0 conflicts=0 left=0')
