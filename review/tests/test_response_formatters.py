from django.test import SimpleTestCase

from review.response_formatters import (
    success_response,
    error_response,
    paginated_response,
    legacy_success_response,
    legacy_error_response,
)


class SuccessResponseTest(SimpleTestCase):
    def test_wraps_data_in_envelope(self):
        result = success_response({"id": 1})
        self.assertEqual(result["data"], {"id": 1})
        self.assertIn("meta", result)
        self.assertEqual(result["meta"]["version"], "2.0")

    def test_includes_custom_meta(self):
        result = success_response([], meta={"version": "2.0", "pagination": {"count": 0}})
        self.assertEqual(result["meta"]["pagination"]["count"], 0)
        self.assertEqual(result["meta"]["version"], "2.0")

    def test_defaults_version_in_meta(self):
        result = success_response("ok", meta={"extra": True})
        self.assertEqual(result["meta"]["version"], "2.0")
        self.assertTrue(result["meta"]["extra"])

    def test_custom_version(self):
        result = success_response({}, version="3.0")
        self.assertEqual(result["meta"]["version"], "3.0")


class ErrorResponseTest(SimpleTestCase):
    def test_basic_error(self):
        result = error_response("NOT_FOUND", "Item not found")
        self.assertEqual(result["error"]["code"], "NOT_FOUND")
        self.assertEqual(result["error"]["message"], "Item not found")
        self.assertEqual(result["error"]["details"], {})
        self.assertEqual(result["meta"]["version"], "2.0")

    def test_error_with_details(self):
        details = {"field": ["This field is required."]}
        result = error_response("VALIDATION_ERROR", "Invalid input", details=details)
        self.assertEqual(result["error"]["details"], details)

    def test_error_custom_version(self):
        result = error_response("ERR", "msg", version="3.0")
        self.assertEqual(result["meta"]["version"], "3.0")


class PaginatedResponseTest(SimpleTestCase):
    def test_includes_pagination_meta(self):
        result = paginated_response([{"id": 1}], count=100, limit=20, offset=0)
        self.assertEqual(result["data"], [{"id": 1}])
        self.assertEqual(result["meta"]["pagination"]["count"], 100)
        self.assertEqual(result["meta"]["pagination"]["limit"], 20)
        self.assertEqual(result["meta"]["pagination"]["offset"], 0)
        self.assertEqual(result["meta"]["version"], "2.0")

    def test_empty_data(self):
        result = paginated_response([], count=0, limit=20, offset=0)
        self.assertEqual(result["data"], [])
        self.assertEqual(result["meta"]["pagination"]["count"], 0)


class LegacySuccessResponseTest(SimpleTestCase):
    def test_basic_success(self):
        result = legacy_success_response(True)
        self.assertEqual(result["response"], "True")

    def test_with_results(self):
        result = legacy_success_response(True, results=[{"id": 1}])
        self.assertEqual(result["results"], [{"id": 1}])

    def test_false_response(self):
        result = legacy_success_response(False)
        self.assertEqual(result["response"], "False")

    def test_extra_kwargs(self):
        result = legacy_success_response(True, foo="bar")
        self.assertEqual(result["foo"], "bar")


class LegacyErrorResponseTest(SimpleTestCase):
    def test_basic_error(self):
        result = legacy_error_response("Something broke")
        self.assertEqual(result["response"], "False")
        self.assertEqual(result["error"], "Something broke")

    def test_with_source(self):
        result = legacy_error_response("Timeout", source="OMDB API")
        self.assertEqual(result["source"], "OMDB API")

    def test_without_source(self):
        result = legacy_error_response("Error")
        self.assertNotIn("source", result)
