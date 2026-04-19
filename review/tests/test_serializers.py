from django.test import SimpleTestCase
from rest_framework import serializers as drf_serializers

from review.serializers import ReviewSerializer, ExternalLookupSerializer


class ReviewDataValidationTest(SimpleTestCase):
    def test_blank_review_data_rejected(self):
        s = ReviewSerializer()
        with self.assertRaises(drf_serializers.ValidationError):
            s.validate_review_data('   ')

    def test_long_review_data_rejected(self):
        s = ReviewSerializer()
        with self.assertRaises(drf_serializers.ValidationError):
            s.validate_review_data('x' * 5001)

    def test_valid_review_data_accepted(self):
        s = ReviewSerializer()
        result = s.validate_review_data('Great movie!')
        self.assertEqual(result, 'Great movie!')

    def test_none_review_data_accepted(self):
        s = ReviewSerializer()
        result = s.validate_review_data(None)
        self.assertIsNone(result)


class ReviewTagsValidationTest(SimpleTestCase):
    def test_review_tags_field_not_required(self):
        s = ReviewSerializer()
        self.assertFalse(s.fields['review_tags'].required)

    def test_too_many_tags_rejected(self):
        s = ReviewSerializer()
        tags = ','.join(f'tag{i}' for i in range(11))
        with self.assertRaises(Exception):
            s.validate_review_tags(tags)

    def test_tag_too_long_rejected(self):
        s = ReviewSerializer()
        with self.assertRaises(Exception):
            s.validate_review_tags('a' * 51)

    def test_invalid_tag_characters_rejected(self):
        s = ReviewSerializer()
        with self.assertRaises(Exception):
            s.validate_review_tags('invalid tag!')

    def test_valid_tags_accepted(self):
        s = ReviewSerializer()
        result = s.validate_review_tags('action, drama, sci-fi')
        self.assertEqual(result, 'action,drama,sci-fi')

    def test_none_tags_accepted(self):
        s = ReviewSerializer()
        result = s.validate_review_tags(None)
        self.assertIsNone(result)


class ExternalLookupSerializerTest(SimpleTestCase):
    def test_empty_search_term_rejected(self):
        s = ExternalLookupSerializer(data={'search_term': '   '})
        self.assertFalse(s.is_valid())

    def test_valid_search_term_accepted(self):
        s = ExternalLookupSerializer(data={'search_term': 'Breaking Bad'})
        self.assertTrue(s.is_valid())

    def test_long_search_term_rejected(self):
        s = ExternalLookupSerializer(data={'search_term': 'x' * 101})
        self.assertFalse(s.is_valid())

    def test_valid_item_id_accepted(self):
        s = ExternalLookupSerializer(data={'item_id': 'omdb_tt1234567'})
        self.assertTrue(s.is_valid())

    def test_empty_item_id_rejected(self):
        s = ExternalLookupSerializer(data={'item_id': ''})
        self.assertFalse(s.is_valid())
