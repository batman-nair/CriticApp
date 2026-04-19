from django.test import TestCase
from django.contrib.auth import get_user_model

from model_bakery import baker

from review.models import Review
from review.utils import review_utils
from review.tests.factories import create_review_item


class ReviewQueryTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='testuser', password='123test123')
        self.review_item1 = create_review_item()
        self.review1 = Review(user=self.user, review_item=self.review_item1, review_rating=9.5)
        self.review1.save()
        self.fake_reviews = [baker.make(Review) for _ in range(10)]

    def test_basic_review_query(self):
        reviews = review_utils.get_filtered_review_objects()
        self.assertGreaterEqual(len(reviews), 10)
        json_data = review_utils.convert_reviews_to_json(reviews)
        self.assertTrue("results" in json_data)
        self.assertGreaterEqual(len(json_data["results"]), 10)
        review_json = json_data["results"][0]
        self.assertTrue(all(field in review_json for field in ["review_data", "review_rating", "modified_date", "review_item"]))

    def test_query_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='Cool')
        self.assertTrue(len(reviews))
        reviews = review_utils.get_filtered_review_objects(query='This should not hopefull match any random string')
        self.assertFalse(len(reviews))

    def test_advanced_query_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='title cool attr1 attr2')
        self.assertTrue(len(reviews), 'Multiple field matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='attr1')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='attr2')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='desc')
        self.assertTrue(len(reviews), 'Meta data matching doesnt work')
        reviews = review_utils.get_filtered_review_objects(query='Cool but not title')
        self.assertFalse(len(reviews), 'Partial match shouldnt show up')

    def test_username_filter(self):
        reviews = review_utils.get_filtered_review_objects(username='testuser')
        self.assertTrue(len(reviews))
        reviews = review_utils.get_filtered_review_objects(username='Please dont match a random string')
        self.assertFalse(len(reviews))

    def test_category_filter(self):
        reviews = review_utils.get_filtered_review_objects(filter_categories=['movie'])
        self.assertTrue(all([review.review_item.category != 'movie' for review in reviews]))

    def test_ordering_filter(self):
        reviews = review_utils.get_filtered_review_objects(ordering='alpha')
        reviews = list(reviews)
        self.assertTrue(all(val[0].review_item.title <= val[1].review_item.title for val in zip(reviews[:-1], reviews[1:])))

    def test_multi_filter(self):
        reviews = review_utils.get_filtered_review_objects(query='Cool', username='testuser', filter_categories=['random'])
        self.assertEqual(len(reviews), 1)
        self.assertEqual(reviews[0].review_rating, 9.5)
