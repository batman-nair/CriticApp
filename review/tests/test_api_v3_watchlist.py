from datetime import timedelta
from unittest import mock

from django.db import connection
from django.db.models.query import QuerySet
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework_simplejwt.tokens import AccessToken

from review.models import ReviewItem, WatchlistEntry
from review.providers import InvalidItemId, ItemNotFound, UpstreamError
from review.tests.test_api_v3_items import PROVIDER_FOR_ITEM_ID, _anime_details, _StubProvider
from review.tests.test_api_v3_reviews import ReviewsApiTestCase, add_review, new_item

LIST_URL = '/api/v3/watchlist'
FACETS_URL = '/api/v3/watchlist/facets'
CHIPS = ['movie', 'series', 'game', 'anime:series', 'anime:movie', 'manga', 'book']


def entry_url(item_id):
    return f'{LIST_URL}/{item_id}'


def add_entry(user, added_at=None, **item_fields):
    return add_entry_for(user, new_item(**item_fields), added_at)


def add_entry_for(user, item, added_at=None):
    fields = {'added_at': added_at} if added_at is not None else {}
    return WatchlistEntry.objects.create(user=user, review_item=item, **fields)


class WatchlistApiTestCase(ReviewsApiTestCase):
    def list_item_ids(self, query=''):
        response = self.client.get(f'{LIST_URL}?{query}')
        self.assertEqual(response.status_code, 200, response.content)
        return [entry['item']['id'] for entry in response.json()['data']]

    def post(self, item_id, **fields):
        return self.client.post(LIST_URL, {'item_id': item_id, **fields}, format='json')


class ListTest(WatchlistApiTestCase):
    def test_shape(self):
        entry = add_entry(self.alice, title='Heat')
        body = self.client.get(LIST_URL).json()
        self.assertEqual(body['meta'], {'pagination': {'count': 1, 'limit': 20, 'offset': 0}})
        [data] = body['data']
        self.assertEqual(set(data), {'item', 'added_at'})
        self.assertEqual(data['item']['id'], entry.review_item_id)
        self.assertEqual(data['item']['title'], 'Heat')
        self.assertEqual(parse_datetime(data['added_at']), entry.added_at)

    def test_newest_first_then_newest_id(self):
        now = timezone.now()
        older = add_entry(self.alice, added_at=now - timedelta(days=2))
        tie_first = add_entry(self.alice, added_at=now - timedelta(days=1))
        tie_second = add_entry(self.alice, added_at=now - timedelta(days=1))
        newest = add_entry(self.alice, added_at=now)
        self.assertEqual(
            self.list_item_ids(),
            [newest.review_item_id, tie_second.review_item_id, tie_first.review_item_id, older.review_item_id],
        )

    def test_only_the_users_entries(self):
        mine = add_entry(self.alice)
        add_entry(self.bob)
        # Bob's entry for the same item isn't listed twice.
        add_entry_for(self.bob, mine.review_item)
        self.assertEqual(self.list_item_ids(), [mine.review_item_id])

    def test_category_filter(self):
        movie = add_entry(self.alice, category='movie').review_item_id
        series = add_entry(self.alice, category='series').review_item_id
        game = add_entry(self.alice, category='game').review_item_id
        manga = add_entry(self.alice, category='manga').review_item_id
        anime_tv = add_entry(self.alice, category='anime', attr3='tv').review_item_id
        anime_movie = add_entry(self.alice, category='anime', attr3='Movie').review_item_id
        cases = [
            ('category=movie', {movie}),
            ('category=series', {series}),
            ('category=game', {game}),
            ('category=manga', {manga}),
            ('category=book', set()),
            ('category=anime', {anime_tv, anime_movie}),
            ('category=anime:series', {anime_tv}),
            ('category=anime:movie', {anime_movie}),
            ('category=movie,game', {movie, game}),
            ('category=movie&category=anime:movie', {movie, anime_movie}),
        ]
        for query, expected in cases:
            with self.subTest(query=query):
                self.assertEqual(set(self.list_item_ids(query)), expected)

    def test_unknown_category_is_rejected(self):
        self.assertFieldError(self.client.get(f'{LIST_URL}?category=podcast'), 'category.0', 'invalid_choice')

    def test_q_matches_title_people_genre_and_year(self):
        title = add_entry(self.alice, title='Heat').review_item_id
        person = add_entry(self.alice, attr1='Michael Mann').review_item_id
        genre = add_entry(self.alice, attr2='Crime, Drama').review_item_id
        year = add_entry(self.alice, year='1995').review_item_id
        cases = [
            ('q=heat', [title]),
            ('q=MANN', [person]),
            ('q=crime', [genre]),
            ('q=1995', [year]),
            ('q=nothing', []),
            ('q=', [year, genre, person, title]),
        ]
        for query, expected in cases:
            with self.subTest(query=query):
                self.assertEqual(self.list_item_ids(query), expected)

    def test_q_matches_alternative_titles(self):
        match = add_entry(self.alice, category='anime', title='Shingeki no Kyojin',
                          alternative_titles='Attack on Titan\n進撃の巨人').review_item_id
        add_entry(self.alice, category='anime', title='Sousou no Frieren')
        for query in ('q=attack titan', 'q=進撃', 'q=shingeki'):
            with self.subTest(query=query):
                self.assertEqual(self.list_item_ids(query), [match])

    def test_q_matches_every_word(self):
        both = add_entry(self.alice, title='Blue Planet').review_item_id
        add_entry(self.alice, title='Blue Velvet')
        split = add_entry(self.alice, title='Blue', attr2='Planet').review_item_id
        self.assertCountEqual(self.list_item_ids('q=blue planet'), [both, split])
        self.assertEqual(self.list_item_ids('q=blue planet velvet'), [])

    def test_language_matches_whole_entries(self):
        match = add_entry(self.alice, language='Korean, English').review_item_id
        add_entry(self.alice, language='Old English')
        add_entry(self.alice, language='')
        french = add_entry(self.alice, language='French').review_item_id
        self.assertEqual(self.list_item_ids('language=English'), [match])
        self.assertEqual(self.list_item_ids('language=Eng'), [])
        self.assertCountEqual(self.list_item_ids('language=English,French'), [match, french])

    def test_filters_combine(self):
        match = add_entry(self.alice, title='Heat', category='movie', language='English').review_item_id
        add_entry(self.alice, title='Heat', category='series', language='English')
        add_entry(self.alice, title='Heat', category='movie', language='French')
        add_entry(self.alice, title='Cold', category='movie', language='English')
        self.assertEqual(self.list_item_ids('q=heat&category=movie&language=English'), [match])

    def test_sort_title(self):
        now = timezone.now()
        banana = add_entry(self.alice, title='Banana', added_at=now - timedelta(days=3)).review_item_id
        cherry = add_entry(self.alice, title='cherry', added_at=now - timedelta(days=2)).review_item_id
        apple_old = add_entry(self.alice, title='Apple', added_at=now - timedelta(days=1)).review_item_id
        apple_new = add_entry(self.alice, title='apple', added_at=now).review_item_id
        self.assertEqual(self.list_item_ids('sort=title'), [apple_new, apple_old, banana, cherry])

    def test_sort_rating_puts_missing_ratings_last_both_ways(self):
        now = timezone.now()

        def add(rating, days_ago):
            return add_entry(self.alice, rating=rating, added_at=now - timedelta(days=days_ago)).review_item_id

        not_rated = add('N/A', 6)
        seven_old = add('7', 5)
        ten = add('10', 4)
        blank = add('', 3)
        eight = add('8.5', 2)
        seven_new = add('7.0', 1)
        cases = [
            ('sort=-rating', [ten, eight, seven_new, seven_old, blank, not_rated]),
            ('sort=rating', [seven_new, seven_old, eight, ten, blank, not_rated]),
        ]
        for query, expected in cases:
            with self.subTest(query=query):
                self.assertEqual(self.list_item_ids(query), expected)

    def test_sort_year_newest_release_first(self):
        now = timezone.now()

        def add(year, days_ago):
            return add_entry(self.alice, year=year, added_at=now - timedelta(days=days_ago)).review_item_id

        tba = add('TBA', 6)
        range_ = add('2018–2021', 5)
        date = add('2019-05-01', 4)
        blank = add('', 3)
        plain = add('2019', 2)
        open_range = add('2020–', 1)
        self.assertEqual(self.list_item_ids('sort=-year'), [open_range, plain, date, range_, blank, tba])

    def test_sort_added_is_the_default(self):
        now = timezone.now()
        older = add_entry(self.alice, title='A', added_at=now - timedelta(days=1)).review_item_id
        newer = add_entry(self.alice, title='B', added_at=now).review_item_id
        self.assertEqual(self.list_item_ids('sort=-added'), [newer, older])
        self.assertEqual(self.list_item_ids(), [newer, older])

    def test_unknown_sort_is_rejected(self):
        self.assertFieldError(self.client.get(f'{LIST_URL}?sort=-updated'), 'sort', 'invalid_choice')

    def test_other_users_entries_stay_out_under_every_filter(self):
        mine = add_entry(self.alice, title='Heat', category='movie', language='English').review_item_id
        add_entry(self.bob, title='Heat', category='movie', language='English')
        queries = [
            'q=heat', 'category=movie', 'language=English', 'q=heat&category=movie&language=English',
            'sort=title', 'sort=-rating', 'sort=rating', 'sort=-year',
        ]
        for query in queries:
            with self.subTest(query=query):
                self.assertEqual(self.list_item_ids(query), [mine])

    def test_pagination(self):
        now = timezone.now()
        entries = [add_entry(self.alice, added_at=now - timedelta(minutes=minutes)) for minutes in range(5)]
        walked = []
        for offset in range(5):
            body = self.client.get(f'{LIST_URL}?limit=2&offset={offset}').json()
            self.assertEqual(body['meta']['pagination'], {'count': 5, 'limit': 2, 'offset': offset})
            walked.append(body['data'][0]['item']['id'])
        self.assertEqual(walked, [entry.review_item_id for entry in entries])

    def test_same_number_of_queries_for_one_and_five_entries(self):
        add_entry(self.alice)
        with self.assertNumQueries(2):
            self.assertEqual(len(self.list_item_ids()), 1)
        for _ in range(4):
            add_entry(self.alice)
        with self.assertNumQueries(2):
            self.assertEqual(len(self.list_item_ids()), 5)


class FacetsTest(WatchlistApiTestCase):
    def get_facets(self, query=''):
        response = self.client.get(f'{FACETS_URL}?{query}')
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()['data']

    def category_counts(self, data):
        return {chip['id']: chip['count'] for chip in data['categories'] if chip['count']}

    def test_empty_watchlist(self):
        self.assertEqual(self.get_facets(), {
            'total': 0, 'categories': [{'id': chip, 'count': 0} for chip in CHIPS], 'languages': [],
        })

    def test_counts_every_chip_in_order(self):
        add_entry(self.alice, category='movie')
        add_entry(self.alice, category='movie')
        add_entry(self.alice, category='book')
        add_entry(self.alice, category='anime', attr3='tv')
        add_entry(self.alice, category='anime', attr3='ova')
        add_entry(self.alice, category='anime', attr3='Movie')
        expected = {'movie': 2, 'book': 1, 'anime:series': 2, 'anime:movie': 1}
        self.assertEqual(self.get_facets(), {
            'total': 6, 'categories': [{'id': chip, 'count': expected.get(chip, 0)} for chip in CHIPS], 'languages': [],
        })

    def test_other_users_entries_are_not_counted(self):
        add_entry(self.alice, category='game')
        add_entry(self.bob, category='game')
        add_entry(self.bob, category='movie')
        data = self.get_facets()
        self.assertEqual(data['total'], 1)
        self.assertEqual({chip['id']: chip['count'] for chip in data['categories'] if chip['count']}, {'game': 1})

    def test_languages_most_common_first(self):
        add_entry(self.alice, language='Korean, English')
        add_entry(self.alice, language='English')
        add_entry(self.alice, language='French')
        add_entry(self.alice, language='')
        add_entry(self.bob, language='French, German')
        self.assertEqual(self.get_facets()['languages'], [
            {'name': 'English', 'count': 2}, {'name': 'French', 'count': 1}, {'name': 'Korean', 'count': 1},
        ])

    def test_q_and_language_narrow_total_and_category_counts(self):
        add_entry(self.alice, title='Heat', category='movie', language='English')
        add_entry(self.alice, title='Heat', category='series', language='French')
        add_entry(self.alice, title='Heat', category='movie', language='French')
        add_entry(self.alice, title='Cold', category='game', language='English')
        cases = [
            ('q=heat', 3, {'movie': 2, 'series': 1}),
            ('language=English', 2, {'movie': 1, 'game': 1}),
            ('q=heat&language=French', 2, {'movie': 1, 'series': 1}),
            ('q=nothing', 0, {}),
        ]
        for query, total, categories in cases:
            with self.subTest(query=query):
                data = self.get_facets(query)
                self.assertEqual(data['total'], total)
                self.assertEqual(self.category_counts(data), categories)

    def test_category_does_not_change_total_or_category_counts(self):
        add_entry(self.alice, category='movie', language='English')
        add_entry(self.alice, category='game', language='French')
        data = self.get_facets('category=movie')
        self.assertEqual(data['total'], 2)
        self.assertEqual(self.category_counts(data), {'movie': 1, 'game': 1})

    def test_category_and_q_narrow_languages_but_language_does_not(self):
        add_entry(self.alice, title='Heat', category='movie', language='English')
        add_entry(self.alice, title='Heat', category='game', language='French')
        add_entry(self.alice, title='Cold', category='movie', language='German')
        cases = [
            ('language=English', ['English', 'French', 'German']),
            ('category=movie', ['English', 'German']),
            ('q=heat&language=German', ['English', 'French']),
        ]
        for query, names in cases:
            with self.subTest(query=query):
                self.assertEqual([language['name'] for language in self.get_facets(query)['languages']], names)

    def test_unknown_category_is_rejected(self):
        self.assertFieldError(self.client.get(f'{FACETS_URL}?category=podcast'), 'category.0', 'invalid_choice')


class AddTest(WatchlistApiTestCase):
    def test_stored_item_is_added(self):
        item = new_item(title='Heat')
        with mock.patch(PROVIDER_FOR_ITEM_ID) as provider_for:
            response = self.post(item.item_id)
        provider_for.assert_not_called()

        self.assertEqual(response.status_code, 201, response.content)
        entry = WatchlistEntry.objects.get()
        self.assertEqual((entry.user, entry.review_item), (self.alice, item))
        self.assertLess(abs(timezone.now() - entry.added_at), timedelta(seconds=10))
        body = response.json()
        self.assertEqual(body['meta'], {})
        self.assertEqual(body['data']['item']['title'], 'Heat')
        self.assertEqual(parse_datetime(body['data']['added_at']), entry.added_at)

    def test_past_added_at_is_kept(self):
        added_at = timezone.now() - timedelta(days=3)
        response = self.post(new_item().item_id, added_at=added_at.isoformat())
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(WatchlistEntry.objects.get().added_at, added_at)
        self.assertEqual(parse_datetime(response.json()['data']['added_at']), added_at)

    def test_future_added_at_is_rejected(self):
        added_at = timezone.now() + timedelta(hours=1)
        self.assertFieldError(self.post(new_item().item_id, added_at=added_at.isoformat()), 'added_at', 'future')
        self.assertFalse(WatchlistEntry.objects.exists())

    def test_missing_item_id(self):
        self.assertFieldError(self.client.post(LIST_URL, {}, format='json'), 'item_id', 'required')

    def test_already_on_the_list_returns_the_entry_unchanged(self):
        added_at = timezone.now() - timedelta(days=5)
        entry = add_entry(self.alice, added_at=added_at)
        response = self.post(entry.review_item_id, added_at=(added_at + timedelta(days=1)).isoformat())

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(parse_datetime(response.json()['data']['added_at']), added_at)
        self.assertEqual(WatchlistEntry.objects.get().added_at, added_at)

    def test_unstored_item_is_fetched_and_stored(self):
        provider = _StubProvider(_anime_details())
        with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=provider):
            response = self.post('mal_anime_52991')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(provider.calls, ['mal_anime_52991'])
        self.assertEqual(response.json()['data']['item']['title'], 'Sousou no Frieren')
        self.assertEqual(WatchlistEntry.objects.get().review_item, ReviewItem.objects.get(item_id='mal_anime_52991'))

    def test_provider_errors(self):
        cases = [
            (ItemNotFound('Anime not found!'), 404, 'NOT_FOUND'),
            (InvalidItemId('Invalid game id.'), 404, 'NOT_FOUND'),
            (UpstreamError('Bad response from API.', status_code=503), 502, 'UPSTREAM_ERROR'),
        ]
        for error, status, code in cases:
            with self.subTest(error=type(error).__name__):
                with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=_StubProvider(error=error)):
                    body = self.assertProblem(self.post('mal_anime_1'), status, code)
                self.assertEqual(body['detail'], error.message)
        self.assertFalse(WatchlistEntry.objects.exists())

    def test_reviewed_item_is_a_conflict(self):
        review = add_review(self.alice)
        with mock.patch(PROVIDER_FOR_ITEM_ID) as provider_for:
            body = self.assertProblem(self.post(review.review_item_id), 409, 'ALREADY_REVIEWED')
        provider_for.assert_not_called()
        self.assertEqual(body['detail'], "You've already reviewed this item.")
        self.assertFalse(WatchlistEntry.objects.exists())

    def test_reviewed_under_an_alias_is_a_conflict(self):
        add_review(self.alice, item_id='mal_anime_52991')
        # The provider answers with its own id, the stored one.
        with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=_StubProvider(_anime_details())):
            self.assertProblem(self.post('mal_anime_052991'), 409, 'ALREADY_REVIEWED')
        self.assertFalse(WatchlistEntry.objects.exists())

    def test_on_the_list_under_an_alias(self):
        entry = add_entry(self.alice, item_id='mal_anime_52991')
        with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=_StubProvider(_anime_details())):
            response = self.post('mal_anime_052991')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['data']['item']['id'], 'mal_anime_52991')
        self.assertEqual(WatchlistEntry.objects.get(), entry)

    def test_other_users_review_or_entry_does_not_matter(self):
        reviewed_by_bob = add_review(self.bob).review_item_id
        listed_by_bob = add_entry(self.bob).review_item_id
        for item_id in (reviewed_by_bob, listed_by_bob):
            with self.subTest(item_id=item_id):
                self.assertEqual(self.post(item_id).status_code, 201)
        self.assertEqual(WatchlistEntry.objects.filter(user=self.alice).count(), 2)

    def test_concurrent_add_returns_the_existing_entry(self):
        entry = add_entry(self.alice)
        real_get = QuerySet.get
        missed = []

        # The first lookup misses the concurrent insert, so the create hits
        # the unique constraint and get_or_create reads the row again.
        def get(queryset, *args, **kwargs):
            if queryset.model is WatchlistEntry and not missed:
                missed.append(True)
                raise WatchlistEntry.DoesNotExist
            return real_get(queryset, *args, **kwargs)

        with mock.patch.object(QuerySet, 'get', autospec=True, side_effect=get):
            response = self.post(entry.review_item_id)

        self.assertEqual(missed, [True])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(WatchlistEntry.objects.get(), entry)


    def test_locks_the_item_before_checking_for_a_review(self):
        item = add_review(self.alice).review_item
        locked = []
        # The test's own transaction counts too.
        outer = len(connection.atomic_blocks)

        def lock(locked_item):
            # In the transaction that checks, so a review committed while the
            # lock waits is seen.
            locked.append((locked_item, len(connection.atomic_blocks) > outer))

        with mock.patch('review.api_v3.watchlist.lock_item', side_effect=lock):
            self.assertProblem(self.post(item.item_id), 409, 'ALREADY_REVIEWED')
        self.assertEqual(locked, [(item, True)])


class RemoveTest(WatchlistApiTestCase):
    def test_removed(self):
        entry = add_entry(self.alice)
        response = self.client.delete(entry_url(entry.review_item_id))
        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(WatchlistEntry.objects.exists())
        self.assertTrue(ReviewItem.objects.filter(pk=entry.review_item_id).exists())

        self.assertProblem(self.client.delete(entry_url(entry.review_item_id)), 404, 'NOT_FOUND')

    def test_other_users_entry_is_not_removed(self):
        entry = add_entry(self.bob)
        self.assertProblem(self.client.delete(entry_url(entry.review_item_id)), 404, 'NOT_FOUND')
        self.assertTrue(WatchlistEntry.objects.filter(pk=entry.pk).exists())

    def test_only_the_users_entry_is_removed(self):
        entry = add_entry(self.alice)
        bobs = add_entry_for(self.bob, entry.review_item)
        self.assertEqual(self.client.delete(entry_url(entry.review_item_id)).status_code, 204)
        self.assertEqual(list(WatchlistEntry.objects.all()), [bobs])

    def test_unknown_item(self):
        self.assertProblem(self.client.delete(entry_url('nope_123')), 404, 'NOT_FOUND')


class PermissionsTest(WatchlistApiTestCase):
    def setUp(self):
        super().setUp()
        self.entry = add_entry(self.alice)

    def requests(self):
        return [
            ('list', lambda: self.client.get(LIST_URL)),
            ('facets', lambda: self.client.get(FACETS_URL)),
            ('add', lambda: self.post(new_item().item_id)),
            ('remove', lambda: self.client.delete(entry_url(self.entry.review_item_id))),
        ]

    def assertUnauthenticated(self, response):
        self.assertProblem(response, 401, 'UNAUTHENTICATED')
        self.assertIn('WWW-Authenticate', response)

    def test_anonymous(self):
        self.client.force_authenticate(None)
        for name, send in self.requests():
            with self.subTest(request=name):
                self.assertUnauthenticated(send())
        self.assertEqual(list(WatchlistEntry.objects.all()), [self.entry])

    def test_invalid_token(self):
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
        for name, send in self.requests():
            with self.subTest(request=name):
                self.assertUnauthenticated(send())

    def test_valid_token(self):
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.alice)}')
        self.assertEqual(self.list_item_ids(), [self.entry.review_item_id])

    def test_other_user_sees_nothing(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.list_item_ids(), [])
        facets = self.client.get(FACETS_URL).json()['data']
        self.assertEqual(facets['total'], 0)
        self.assertEqual([chip['count'] for chip in facets['categories']], [0] * len(CHIPS))
