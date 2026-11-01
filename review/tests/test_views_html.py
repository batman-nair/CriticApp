from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase

from review import views
from review.models import Review
from review.tests.factories import create_review_item
from review.utils import review_utils


class HTMLViewSmokeTest(TestCase):
    """Smoke tests for template-rendering views: verify 200 status and correct template."""

    def test_view_reviews_page(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'review/view_reviews.html')

    def test_view_reviews_page_lists_category_chips(self):
        response = self.client.get('/')
        self.assertContains(response, 'data-category="series"')
        self.assertContains(response, 'data-category="anime:series"')
        self.assertContains(response, 'data-category="anime:movie"')
        self.assertNotContains(response, 'data-category="anime"')

    def test_view_reviews_page_hides_language_menu_without_languages(self):
        response = self.client.get('/')
        self.assertNotContains(response, 'id="language-chip"')

    def test_view_reviews_page_lists_review_languages(self):
        user = get_user_model().objects.create_user(username='languser', password='pass12345')
        item = create_review_item(item_id='omdb_lang', language='Korean, English')
        Review.objects.create(user=user, review_item=item, review_rating=8)
        response = self.client.get('/')
        self.assertContains(response, 'id="language-chip"')
        self.assertContains(response, 'value="Korean"')
        self.assertContains(response, 'value="English"')

    def test_profile_page_lists_only_that_users_languages(self):
        user = get_user_model().objects.create_user(username='kofan', password='pass12345')
        other = get_user_model().objects.create_user(username='defan', password='pass12345')
        for owner, item_id, language in ((user, 'omdb_ko', 'Korean'), (other, 'omdb_de', 'German')):
            item = create_review_item(item_id=item_id, language=language)
            Review.objects.create(user=owner, review_item=item, review_rating=8)
        response = self.client.get('/u/kofan')
        self.assertContains(response, 'value="Korean"')
        self.assertNotContains(response, 'value="German"')

    def test_view_reviews_page_has_load_more_sentinel(self):
        response = self.client.get('/')
        self.assertContains(response, 'id="load-more-container"')
        self.assertContains(response, 'id="load-more-indicator"')
        self.assertContains(response, 'id="load-more-button"')

    def test_add_review_page_offers_series(self):
        get_user_model().objects.create_user(username='adduser', password='pass12345')
        self.client.login(username='adduser', password='pass12345')
        response = self.client.get('/add')
        self.assertContains(response, 'data-category="series"')

    def test_add_review_requires_login(self):
        response = self.client.get('/add')
        self.assertEqual(response.status_code, 302)

    def test_profile_page(self):
        get_user_model().objects.create_user(username='profileuser', password='pass12345')
        response = self.client.get('/u/profileuser')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'review/view_reviews.html')

    def test_profile_redirect_requires_login(self):
        response = self.client.get('/u')
        self.assertEqual(response.status_code, 302)

    def test_profile_redirect_authenticated(self):
        get_user_model().objects.create_user(username='rediruser', password='pass12345')
        self.client.login(username='rediruser', password='pass12345')
        response = self.client.get('/u')
        self.assertRedirects(response, '/u/rediruser', fetch_redirect_response=False)

    def test_health_check(self):
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'OK')


class FilterCategoriesTest(SimpleTestCase):
    def test_chips_cover_every_category(self):
        chip_values = {value for value, _ in views.FILTER_CATEGORIES}
        expected = (set(views.CATEGORY_TO_API) - {'anime'}) | set(review_utils.SUBCATEGORY_FILTERS)
        self.assertEqual(chip_values, expected)
