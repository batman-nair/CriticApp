from itertools import count

from django.contrib.auth import get_user_model
from django.test import TestCase

from review.api_v3.tags import most_used_tags
from review.models import Review
from review.tests.factories import create_review_item

_item_ids = count()


def add_review(user, review_tags):
    item = create_review_item(item_id=f'tags{next(_item_ids)}')
    return Review.objects.create(user=user, review_item=item, review_rating=7, review_tags=review_tags)


def add_distinct_tags(user, how_many):
    """`how_many` distinct tags with distinct counts, spread over reviews whose
    review_tags stay within max_length=100 (enforced on Postgres in CI)."""
    names = [f't{i:02d}' for i in range(how_many)]
    for repeat in range(1, how_many + 1):
        # Tag i appears in (how_many - i) reviews, so the expected order is t00, t01, ...
        tags = [name for i, name in enumerate(names) if how_many - i >= repeat]
        for start in range(0, len(tags), 20):
            add_review(user, ','.join(tags[start:start + 20]))
    return names


class TestMostUsedTags(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('alice', password='pw')

    def test_counts_and_orders_by_count_then_name(self):
        add_review(self.user, 'drama,rewatch,favourite')
        add_review(self.user, 'rewatch,favourite')
        add_review(self.user, 'rewatch,Zebra')
        # Ties are ordered by name ignoring case: drama before Zebra.
        self.assertEqual(most_used_tags('alice', 10), [
            {'name': 'rewatch', 'count': 3},
            {'name': 'favourite', 'count': 2},
            {'name': 'drama', 'count': 1},
            {'name': 'Zebra', 'count': 1},
        ])

    def test_tag_repeated_in_one_review_counts_each_time(self):
        add_review(self.user, 'rewatch,Rewatch')
        self.assertEqual(most_used_tags('alice', 10), [{'name': 'Rewatch', 'count': 2}])

    def test_groups_case_insensitively_under_the_most_frequent_spelling(self):
        add_review(self.user, 'Rewatch')
        add_review(self.user, 'rewatch')
        add_review(self.user, 'rewatch')
        self.assertEqual(most_used_tags('alice', 10), [{'name': 'rewatch', 'count': 3}])

    def test_spelling_tie_goes_to_the_spelling_that_sorts_first(self):
        add_review(self.user, 'fav')
        add_review(self.user, 'Fav')
        self.assertEqual(most_used_tags('alice', 10), [{'name': 'Fav', 'count': 2}])

    def test_ignores_whitespace_and_empty_entries(self):
        add_review(self.user, ' drama , ,sci-fi,')
        self.assertEqual(most_used_tags('alice', 10), [
            {'name': 'drama', 'count': 1},
            {'name': 'sci-fi', 'count': 1},
        ])

    def test_null_and_empty_review_tags_add_nothing(self):
        add_review(self.user, None)
        add_review(self.user, '')
        add_review(self.user, ' , ')
        self.assertEqual(most_used_tags('alice', 10), [])

    def test_limit(self):
        names = add_distinct_tags(self.user, 5)
        self.assertEqual([tag['name'] for tag in most_used_tags('alice', 3)], names[:3])


class TestV3Tags(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.alice = user_model.objects.create_user('alice', password='pw')
        self.bob = user_model.objects.create_user('bob', password='pw')

    def get(self, **params):
        return self.client.get('/api/v3/tags', params)

    def names(self, **params):
        response = self.get(**params)
        self.assertEqual(response.status_code, 200)
        return [tag['name'] for tag in response.json()['data']]

    def test_shape(self):
        add_review(self.alice, 'rewatch,favourite')
        add_review(self.alice, 'rewatch')
        response = self.get(username='alice')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertEqual(response.json(), {
            'data': [{'name': 'rewatch', 'count': 2}, {'name': 'favourite', 'count': 1}],
            'meta': {},
        })

    def test_limit_defaults_to_10(self):
        names = add_distinct_tags(self.alice, 12)
        self.assertEqual(self.names(username='alice'), names[:10])

    def test_limit(self):
        names = add_distinct_tags(self.alice, 12)
        self.assertEqual(self.names(username='alice', limit=3), names[:3])

    def test_limit_is_capped_at_50(self):
        names = add_distinct_tags(self.alice, 60)
        for limit in (51, 500):
            with self.subTest(limit=limit):
                self.assertEqual(self.names(username='alice', limit=limit), names[:50])

    def test_invalid_limit_falls_back_to_10(self):
        add_distinct_tags(self.alice, 12)
        for limit in ('0', '-1', 'abc', '10.5', ''):
            with self.subTest(limit=limit):
                self.assertEqual(len(self.names(username='alice', limit=limit)), 10)

    def test_username_defaults_to_the_logged_in_user(self):
        add_review(self.alice, 'mine')
        add_review(self.bob, 'theirs')
        self.client.force_login(self.alice)
        self.assertEqual(self.names(), ['mine'])
        self.assertEqual(self.names(username=' '), ['mine'])
        self.assertEqual(self.names(username='bob'), ['theirs'])

    def test_username_is_matched_exactly(self):
        add_review(self.alice, 'mine')
        self.assertEqual(self.names(username=' alice '), [])
        self.assertEqual(self.names(username='Alice'), [])

    def test_username_required_when_not_logged_in(self):
        for params in ({}, {'username': ''}, {'username': ' '}):
            with self.subTest(params=params):
                response = self.get(**params)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response['Content-Type'], 'application/problem+json')
                body = response.json()
                self.assertEqual(body['code'], 'VALIDATION_ERROR')
                self.assertEqual([(e['field'], e['code']) for e in body['errors']], [('username', 'required')])

    def test_unknown_username_returns_empty_list(self):
        add_review(self.alice, 'rewatch')
        self.assertEqual(self.names(username='nobody'), [])

    def test_only_that_users_reviews_are_counted(self):
        add_review(self.alice, 'rewatch,drama')
        add_review(self.bob, 'rewatch')
        add_review(self.bob, 'rewatch,comedy')
        alice = self.get(username='alice').json()['data']
        bob = self.get(username='bob').json()['data']
        self.assertEqual(alice, [{'name': 'drama', 'count': 1}, {'name': 'rewatch', 'count': 1}])
        self.assertEqual(bob, [{'name': 'rewatch', 'count': 2}, {'name': 'comedy', 'count': 1}])

    def test_public_and_read_only(self):
        add_review(self.alice, 'rewatch')
        self.assertEqual(self.names(username='alice'), ['rewatch'])
        response = self.client.post('/api/v3/tags', {}, content_type='application/json')
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json()['code'], 'METHOD_NOT_ALLOWED')

    def test_invalid_token_is_rejected(self):
        # Unlike /categories, this view keeps authentication, since the
        # default username depends on who is logged in.
        response = self.client.get('/api/v3/tags', {'username': 'alice'}, HTTP_AUTHORIZATION='Bearer invalid')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['code'], 'UNAUTHENTICATED')
        self.assertIn('WWW-Authenticate', response)

    def test_one_query(self):
        add_review(self.alice, 'rewatch')
        add_review(self.alice, 'drama')
        with self.assertNumQueries(1):
            self.get(username='alice')

    def test_schema(self):
        schema = self.client.get('/api/v3/schema', {'format': 'json'}).json()
        operation = schema['paths']['/api/v3/tags']['get']
        self.assertEqual({p['name'] for p in operation['parameters'] if p['in'] == 'query'}, {'username', 'limit'})
        self.assertIn('application/problem+json', operation['responses']['400']['content'])
