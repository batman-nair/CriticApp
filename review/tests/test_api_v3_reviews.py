from datetime import timedelta
from itertools import count
from unittest import mock

import yaml
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from critic.api.tests.test_schema import COMMITTED_SCHEMA
from review.api_v3 import reviews as reviews_module
from review.models import Review, ReviewItem
from review.providers import InvalidItemId, ItemNotFound, UpstreamError
from review.tests.factories import create_review_item
from review.tests.test_api_v3_items import PROVIDER_FOR_ITEM_ID, _anime_details, _StubProvider

LIST_URL = '/api/v3/reviews'
GET_OR_FETCH_ITEM = 'review.api_v3.reviews.get_or_fetch_item'

_item_ids = count()


def detail_url(pk):
    return f'{LIST_URL}/{pk}'


def new_item(**fields):
    fields.setdefault('item_id', f'rev{next(_item_ids)}')
    return create_review_item(**fields)


def add_review(user, rating=7, text=None, tags=None, **item_fields):
    return Review.objects.create(
        user=user, review_item=new_item(**item_fields), review_rating=rating, review_data=text, review_tags=tags,
    )


def set_updated_at(review, value):
    # A queryset update: save() would set it to now (auto_now).
    Review.objects.filter(pk=review.pk).update(updated_at=value)


class ReviewsApiTestCase(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.alice = user_model.objects.create_user('alice', password='pw')
        self.bob = user_model.objects.create_user('bob', password='pw')
        self.client.force_authenticate(self.alice)

    def assertProblem(self, response, status, code):
        self.assertEqual(response.status_code, status, response.content)
        self.assertEqual(response['Content-Type'], 'application/problem+json')
        body = response.json()
        self.assertEqual(body['code'], code)
        return body

    def assertFieldError(self, response, field, code):
        body = self.assertProblem(response, 400, 'VALIDATION_ERROR')
        self.assertIn((field, code), [(error['field'], error['code']) for error in body['errors']], body)

    def list_ids(self, query=''):
        response = self.client.get(f'{LIST_URL}?{query}')
        self.assertEqual(response.status_code, 200, response.content)
        return [review['id'] for review in response.json()['data']]


class RepresentationTest(ReviewsApiTestCase):
    def get_data(self, review):
        return self.client.get(detail_url(review.pk)).json()['data']

    def test_shape(self):
        review = add_review(self.alice, rating='7.50', text='Great', tags='drama,rewatch', title='Heat')
        data = self.get_data(review)
        self.assertEqual(set(data), {'id', 'user', 'item', 'rating', 'text', 'tags', 'created_at', 'updated_at'})
        self.assertEqual(data['id'], review.pk)
        self.assertEqual(data['user'], {'username': 'alice'})
        self.assertEqual(data['item']['id'], review.review_item_id)
        self.assertEqual(data['item']['title'], 'Heat')
        self.assertEqual(data['text'], 'Great')
        self.assertEqual(data['tags'], ['drama', 'rewatch'])

    def test_rating_is_a_json_number(self):
        data = self.get_data(add_review(self.alice, rating='7.50'))
        self.assertIsInstance(data['rating'], float)
        self.assertEqual(data['rating'], 7.5)

    def test_text_is_null_when_stored_empty(self):
        for stored in [None, '', '  \n ']:
            with self.subTest(stored=stored):
                self.assertIsNone(self.get_data(add_review(self.alice, text=stored))['text'])

    def test_text_is_stripped_and_keeps_a_literal_na(self):
        self.assertEqual(self.get_data(add_review(self.alice, text='  Great \n'))['text'], 'Great')
        self.assertEqual(self.get_data(add_review(self.alice, text='N/A'))['text'], 'N/A')

    def test_tags(self):
        cases = [
            (None, []),
            ('', []),
            ('drama,rewatch', ['drama', 'rewatch']),
            # As v2 has stored them.
            (' drama, old favourite ,, ', ['drama', 'old favourite']),
        ]
        for stored, expected in cases:
            with self.subTest(stored=stored):
                self.assertEqual(self.get_data(add_review(self.alice, tags=stored))['tags'], expected)

    def test_old_row_has_null_timestamps(self):
        review = add_review(self.alice)
        Review.objects.filter(pk=review.pk).update(created_at=None, updated_at=None)
        data = self.get_data(review)
        self.assertIsNone(data['created_at'])
        self.assertIsNone(data['updated_at'])


class ListFilterTest(ReviewsApiTestCase):
    def test_empty(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'data': [], 'meta': {'pagination': {'count': 0, 'limit': 20, 'offset': 0}}})

    def test_username(self):
        mine = add_review(self.alice)
        add_review(self.bob)
        self.assertEqual(self.list_ids('username=alice'), [mine.pk])
        self.assertEqual(self.list_ids('username=nobody'), [])

    def test_q_matches_every_word(self):
        both = add_review(self.alice, title='Blue Planet')
        add_review(self.alice, title='Blue Velvet')
        tagged = add_review(self.alice, title='Red', tags='blue,planet')
        self.assertCountEqual(self.list_ids('q=blue planet'), [both.pk, tagged.pk])

    def test_each_category(self):
        expected = {}
        for category in ['movie', 'series', 'game', 'manga', 'book']:
            expected[category] = [add_review(self.alice, category=category).pk]
        anime_series = add_review(self.alice, category='anime', attr3='tv').pk
        anime_movie = add_review(self.alice, category='anime', attr3='movie').pk
        expected['anime'] = [anime_series, anime_movie]
        expected['anime:series'] = [anime_series]
        expected['anime:movie'] = [anime_movie]
        for category, ids in expected.items():
            with self.subTest(category=category):
                self.assertCountEqual(self.list_ids(f'category={category}'), ids)

    def test_exclude_category(self):
        movie = add_review(self.alice, category='movie')
        add_review(self.alice, category='game')
        add_review(self.alice, category='anime', attr3='movie')
        anime_series = add_review(self.alice, category='anime', attr3='tv')
        self.assertCountEqual(
            self.list_ids('exclude_category=game&exclude_category=anime:movie'), [movie.pk, anime_series.pk],
        )

    def test_language_matches_whole_entries(self):
        match = add_review(self.alice, language='Korean, English')
        add_review(self.alice, language='Old English')
        add_review(self.alice, language='')
        self.assertEqual(self.list_ids('language=English'), [match.pk])
        self.assertEqual(self.list_ids('language=Eng'), [])

    def test_repeated_and_comma_forms(self):
        movie = add_review(self.alice, category='movie').pk
        game = add_review(self.alice, category='game').pk
        book = add_review(self.alice, category='book').pk
        add_review(self.alice, category='manga')
        cases = [
            ('category=movie&category=game', [movie, game]),
            ('category=movie,game', [movie, game]),
            ('category=movie,game&category=book', [movie, game, book]),
            ('category=movie,%20game,', [movie, game]),
        ]
        for query, ids in cases:
            with self.subTest(query=query):
                self.assertCountEqual(self.list_ids(query), ids)

    def test_unknown_values_are_rejected(self):
        cases = [
            ('category=nope', 'category.0', 'invalid_choice'),
            ('category=movie,nope', 'category.1', 'invalid_choice'),
            ('exclude_category=nope', 'exclude_category.0', 'invalid_choice'),
            ('sort=nope', 'sort', 'invalid_choice'),
        ]
        for query, field, code in cases:
            with self.subTest(query=query):
                self.assertFieldError(self.client.get(f'{LIST_URL}?{query}'), field, code)

    def test_nul_in_q_is_rejected(self):
        self.assertFieldError(self.client.get(LIST_URL, {'q': 'a\x00b'}), 'q', 'null_characters_not_allowed')


class SortingTest(ReviewsApiTestCase):
    def add_sorted_rows(self):
        now = timezone.now()
        banana = add_review(self.alice, rating=5, title='banana')
        apple = add_review(self.alice, rating=9, title='Apple')
        cherry = add_review(self.alice, rating=7, title='cherry')
        set_updated_at(banana, now - timedelta(days=1))
        set_updated_at(cherry, now - timedelta(days=2))
        set_updated_at(apple, now - timedelta(days=3))
        return apple.pk, banana.pk, cherry.pk

    def test_each_sort(self):
        apple, banana, cherry = self.add_sorted_rows()
        cases = {
            'updated': [apple, cherry, banana],
            '-updated': [banana, cherry, apple],
            'title': [apple, banana, cherry],
            '-title': [cherry, banana, apple],
            'rating': [banana, cherry, apple],
            '-rating': [apple, cherry, banana],
        }
        for sort, ids in cases.items():
            with self.subTest(sort=sort):
                self.assertEqual(self.list_ids(f'sort={sort}'), ids)

    def test_default_is_most_recently_updated(self):
        apple, banana, cherry = self.add_sorted_rows()
        self.assertEqual(self.list_ids(), [banana, cherry, apple])

    def test_equal_keys_are_ordered_by_descending_id(self):
        first = add_review(self.alice, rating=5, title='same')
        second = add_review(self.alice, rating=5, title='same')
        when = timezone.now()
        set_updated_at(first, when)
        set_updated_at(second, when)
        for sort in ['updated', '-updated', 'title', '-title', 'rating', '-rating']:
            with self.subTest(sort=sort):
                self.assertEqual(self.list_ids(f'sort={sort}'), [second.pk, first.pk])

    def test_null_updated_at_is_last_on_descending(self):
        old = add_review(self.alice)
        newer = add_review(self.alice)
        set_updated_at(old, None)
        self.assertEqual(self.list_ids('sort=-updated'), [newer.pk, old.pk])

    def test_title_order_ignores_case_across_pages(self):
        ids = [add_review(self.alice, title=title).pk for title in ['apple', 'Banana', 'cherry', 'Date', 'elderberry']]
        walked = []
        for offset in range(len(ids)):
            response = self.client.get(f'{LIST_URL}?sort=title&limit=1&offset={offset}')
            body = response.json()
            self.assertEqual(body['meta']['pagination'], {'count': 5, 'limit': 1, 'offset': offset})
            walked += [review['id'] for review in body['data']]
        self.assertEqual(walked, ids)


class QueryCountTest(ReviewsApiTestCase):
    def test_same_number_of_queries_for_one_and_five_reviews(self):
        self.client.force_authenticate(None)
        add_review(self.alice)
        with self.assertNumQueries(2):
            self.assertEqual(len(self.list_ids()), 1)
        for _ in range(4):
            add_review(self.alice)
        with self.assertNumQueries(2):
            self.assertEqual(len(self.list_ids()), 5)


class CreateTest(ReviewsApiTestCase):
    def post(self, item_id, **fields):
        return self.client.post(LIST_URL, {'item_id': item_id, 'rating': 8.5, **fields}, format='json')

    def test_created_with_a_stored_item(self):
        item = new_item(title='Heat')
        with mock.patch(PROVIDER_FOR_ITEM_ID) as provider_for:
            response = self.post(item.item_id, text='Great', tags=['drama'])
        provider_for.assert_not_called()

        self.assertEqual(response.status_code, 201, response.content)
        review = Review.objects.get()
        self.assertEqual((review.user, review.review_item), (self.alice, item))
        self.assertEqual(response['Location'], detail_url(review.pk))
        body = response.json()
        self.assertEqual(body['meta'], {})
        data = body['data']
        self.assertEqual(data['id'], review.pk)
        self.assertEqual(data['user'], {'username': 'alice'})
        self.assertEqual(data['item']['title'], 'Heat')
        self.assertEqual(data['rating'], 8.5)
        self.assertEqual(data['text'], 'Great')
        self.assertEqual(data['tags'], ['drama'])
        self.assertIsNotNone(data['created_at'])
        self.assertIsNotNone(data['updated_at'])

    def test_only_item_id_and_rating_are_required(self):
        response = self.post(new_item().item_id)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertIsNone(response.json()['data']['text'])
        self.assertEqual(response.json()['data']['tags'], [])

    def test_missing_required_fields(self):
        response = self.client.post(LIST_URL, {}, format='json')
        self.assertFieldError(response, 'item_id', 'required')
        self.assertFieldError(response, 'rating', 'required')

    def test_unstored_item_is_fetched_and_stored(self):
        provider = _StubProvider(_anime_details())
        with mock.patch(PROVIDER_FOR_ITEM_ID, return_value=provider):
            response = self.post('mal_anime_52991')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(provider.calls, ['mal_anime_52991'])
        self.assertEqual(response.json()['data']['item']['title'], 'Sousou no Frieren')
        self.assertEqual(Review.objects.get().review_item, ReviewItem.objects.get(item_id='mal_anime_52991'))

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
        self.assertFalse(Review.objects.exists())

    def test_duplicate_is_a_conflict_before_the_item_lookup(self):
        existing = add_review(self.alice)
        with mock.patch(PROVIDER_FOR_ITEM_ID) as provider_for, mock.patch(GET_OR_FETCH_ITEM) as get_or_fetch:
            body = self.assertProblem(self.post(existing.review_item_id), 409, 'DUPLICATE_REVIEW')
        provider_for.assert_not_called()
        get_or_fetch.assert_not_called()
        self.assertEqual(body['existing_review_id'], existing.pk)
        self.assertEqual(body['detail'], "You've already reviewed this item.")
        self.assertEqual(Review.objects.count(), 1)

    def test_two_users_can_review_the_same_item(self):
        existing = add_review(self.bob)
        self.assertEqual(self.post(existing.review_item_id).status_code, 201)

    def test_invalid_body_is_rejected_before_the_duplicate_check(self):
        existing = add_review(self.alice)
        self.assertFieldError(self.post(existing.review_item_id, rating=11), 'rating', 'max_value')

    def test_concurrent_duplicate_is_a_conflict(self):
        existing = add_review(self.alice)
        real_lookup = reviews_module._existing_review_id
        # The pre-check misses the concurrent insert; the lookup after the
        # IntegrityError is the real one.
        answers = iter([lambda user, item_id: None, real_lookup])

        with mock.patch(
            'review.api_v3.reviews._existing_review_id',
            side_effect=lambda user, item_id: next(answers)(user, item_id),
        ):
            body = self.assertProblem(self.post(existing.review_item_id), 409, 'DUPLICATE_REVIEW')

        self.assertEqual(body['existing_review_id'], existing.pk)
        self.assertEqual(Review.objects.count(), 1)


class ValidationTest(ReviewsApiTestCase):
    # Over 100 characters joined, with only valid tags and at most 10 of them.
    LONG_TAGS = [f'{i:02d}' + 'a' * 9 for i in range(10)]

    def send_create(self, **fields):
        return self.client.post(LIST_URL, {'item_id': new_item().item_id, 'rating': 7, **fields}, format='json')

    def send_patch(self, **fields):
        return self.client.patch(detail_url(add_review(self.alice).pk), fields, format='json')

    def both(self):
        return [('create', self.send_create), ('patch', self.send_patch)]

    def test_invalid_values(self):
        cases = [
            ({'rating': -0.01}, 'rating', 'min_value'),
            ({'rating': 10.01}, 'rating', 'max_value'),
            ({'rating': 5.123}, 'rating', 'max_decimal_places'),
            ({'text': 'x' * 5001}, 'text', 'max_length'),
            ({'tags': [f't{i}' for i in range(11)]}, 'tags', 'max_length'),
            ({'tags': ['t' * 51]}, 'tags.0', 'max_length'),
            ({'tags': ['ok', 'not ok']}, 'tags.1', 'invalid'),
            ({'tags': ['']}, 'tags.0', 'blank'),
            ({'tags': self.LONG_TAGS}, 'tags', 'max_length'),
        ]
        for name, send in self.both():
            for fields, field, code in cases:
                with self.subTest(operation=name, field=field, code=code):
                    self.assertFieldError(send(**fields), field, code)

    def test_valid_limits(self):
        for name, send in self.both():
            for fields in [{'rating': 0}, {'rating': 10}, {'rating': 9.99}, {'text': 'x' * 5000}, {'tags': ['t' * 50]}]:
                with self.subTest(operation=name, fields=list(fields)):
                    response = send(**fields)
                    self.assertIn(response.status_code, (200, 201), response.content)

    def test_blank_text_is_stored_as_null(self):
        for name, send in self.both():
            for text in ['', '   \n']:
                with self.subTest(operation=name, text=text):
                    response = send(text=text)
                    self.assertIsNone(response.json()['data']['text'])
                    self.assertIsNone(Review.objects.get(pk=response.json()['data']['id']).review_data)

    def test_whitespace_is_stripped(self):
        for name, send in self.both():
            with self.subTest(operation=name):
                data = send(text='  Great \n', tags=[' drama ', 'rewatch  ']).json()['data']
                self.assertEqual(data['text'], 'Great')
                self.assertEqual(data['tags'], ['drama', 'rewatch'])
                self.assertEqual(Review.objects.get(pk=data['id']).review_tags, 'drama,rewatch')

    def test_case_insensitive_duplicates_keep_the_first_spelling(self):
        for name, send in self.both():
            with self.subTest(operation=name):
                data = send(tags=['Drama', 'sci-fi', 'drama', 'DRAMA']).json()['data']
                self.assertEqual(data['tags'], ['Drama', 'sci-fi'])
                self.assertEqual(Review.objects.get(pk=data['id']).review_tags, 'Drama,sci-fi')

    def test_at_most_ten_tags_counts_the_list_as_sent(self):
        # Eleven entries, though only one is left after dropping duplicates.
        for name, send in self.both():
            with self.subTest(operation=name):
                self.assertFieldError(send(tags=['drama'] * 11), 'tags', 'max_length')


class PermissionsTest(ReviewsApiTestCase):
    def setUp(self):
        super().setUp()
        self.review = add_review(self.alice)

    def assertUnauthenticated(self, response):
        self.assertProblem(response, 401, 'UNAUTHENTICATED')
        self.assertIn('WWW-Authenticate', response)

    def test_anonymous_can_read(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(LIST_URL).status_code, 200)
        self.assertEqual(self.client.get(detail_url(self.review.pk)).status_code, 200)

    def test_anonymous_cannot_write(self):
        self.client.force_authenticate(None)
        url = detail_url(self.review.pk)
        self.assertUnauthenticated(self.client.post(LIST_URL, {'item_id': 'x', 'rating': 7}, format='json'))
        self.assertUnauthenticated(self.client.patch(url, {'rating': 1}, format='json'))
        self.assertUnauthenticated(self.client.delete(url))
        self.review.refresh_from_db()
        self.assertEqual(self.review.review_rating, 7)

    def test_other_user_can_read_but_not_write(self):
        self.client.force_authenticate(self.bob)
        url = detail_url(self.review.pk)
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertProblem(self.client.patch(url, {'rating': 1}, format='json'), 403, 'PERMISSION_DENIED')
        self.assertProblem(self.client.delete(url), 403, 'PERMISSION_DENIED')
        self.review.refresh_from_db()
        self.assertEqual(self.review.review_rating, 7)

    def test_owner_can_write(self):
        url = detail_url(self.review.pk)
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.patch(url, {'rating': 1}, format='json').status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_other_users_invalid_patch_is_forbidden_not_a_validation_error(self):
        self.client.force_authenticate(self.bob)
        response = self.client.patch(detail_url(self.review.pk), {'rating': 99}, format='json')
        self.assertProblem(response, 403, 'PERMISSION_DENIED')

    def test_missing_id(self):
        url = detail_url(999999)
        self.assertProblem(self.client.get(url), 404, 'NOT_FOUND')
        self.assertProblem(self.client.patch(url, {'rating': 99}, format='json'), 404, 'NOT_FOUND')
        self.assertProblem(self.client.delete(url), 404, 'NOT_FOUND')

    def test_anonymous_on_a_missing_id(self):
        self.client.force_authenticate(None)
        url = detail_url(999999)
        self.assertProblem(self.client.get(url), 404, 'NOT_FOUND')
        self.assertUnauthenticated(self.client.patch(url, {'rating': 1}, format='json'))
        self.assertUnauthenticated(self.client.delete(url))

    def test_invalid_token_does_not_affect_reads(self):
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
        self.assertEqual(self.client.get(LIST_URL).status_code, 200)
        self.assertEqual(self.client.get(detail_url(self.review.pk)).status_code, 200)

    def test_invalid_token_is_rejected_on_writes(self):
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
        self.assertUnauthenticated(self.client.post(LIST_URL, {'item_id': 'x', 'rating': 7}, format='json'))
        self.assertUnauthenticated(self.client.patch(detail_url(self.review.pk), {'rating': 1}, format='json'))

    def test_options_on_the_list_when_logged_in(self):
        response = self.client.options(LIST_URL)
        self.assertEqual(response.status_code, 200, response.content)


class PatchTest(ReviewsApiTestCase):
    def setUp(self):
        super().setUp()
        self.review = add_review(self.alice, rating='7.00', text='Old', tags='a,b')
        self.url = detail_url(self.review.pk)

    def patch(self, **fields):
        response = self.client.patch(self.url, fields, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.review.refresh_from_db()
        return response.json()['data']

    def stored(self):
        return self.review.review_rating, self.review.review_data, self.review.review_tags

    def test_rating_alone(self):
        data = self.patch(rating=3.5)
        self.assertEqual(data['rating'], 3.5)
        self.assertEqual(self.stored(), (3.5, 'Old', 'a,b'))

    def test_text_alone(self):
        data = self.patch(text='New')
        self.assertEqual(data['text'], 'New')
        self.assertEqual(self.stored(), (7, 'New', 'a,b'))

    def test_tags_alone(self):
        data = self.patch(tags=['c'])
        self.assertEqual(data['tags'], ['c'])
        self.assertEqual(self.stored(), (7, 'Old', 'c'))

    def test_empty_patch_is_a_normal_save(self):
        data = self.patch()
        self.assertEqual(self.stored(), (7, 'Old', 'a,b'))
        self.assertEqual(data['tags'], ['a', 'b'])

    def test_updated_at_advances(self):
        long_ago = timezone.now() - timedelta(days=30)
        for fields in [{'text': 'New'}, {}]:
            with self.subTest(fields=fields):
                set_updated_at(self.review, long_ago)
                self.patch(**fields)
                self.assertGreater(self.review.updated_at, long_ago)

    def test_item_id_is_rejected(self):
        response = self.client.patch(self.url, {'item_id': 'other', 'rating': 1}, format='json')
        self.assertFieldError(response, 'item_id', 'read_only')
        self.review.refresh_from_db()
        self.assertEqual(self.review.review_rating, 7)

    def test_empty_tags_clear(self):
        data = self.patch(tags=[])
        self.assertEqual(data['tags'], [])
        self.assertIsNone(self.review.review_tags)

    def test_null_text_clears(self):
        data = self.patch(text=None)
        self.assertIsNone(data['text'])
        self.assertIsNone(self.review.review_data)

    def test_put_is_not_allowed(self):
        response = self.client.put(self.url, {'rating': 1}, format='json')
        self.assertProblem(response, 405, 'METHOD_NOT_ALLOWED')


class DeleteTest(ReviewsApiTestCase):
    def test_delete(self):
        review = add_review(self.alice)
        response = self.client.delete(detail_url(review.pk))
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b'')
        self.assertFalse(Review.objects.filter(pk=review.pk).exists())


class CommittedSchemaTest(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.schema = yaml.safe_load(COMMITTED_SCHEMA.read_text())

    def test_create_request_rating_is_a_number(self):
        rating = self.schema['components']['schemas']['ReviewCreateRequest']['properties']['rating']
        self.assertEqual(rating['type'], 'number')

    def test_list_documents_every_filter_param(self):
        parameters = self.schema['paths']['/api/v3/reviews']['get']['parameters']
        self.assertLessEqual(
            {'username', 'q', 'category', 'exclude_category', 'language', 'sort', 'limit', 'offset'},
            {parameter['name'] for parameter in parameters if parameter['in'] == 'query'},
        )
