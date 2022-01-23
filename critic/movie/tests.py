from django.test import TestCase
from django.contrib.auth import get_user_model

from .views import INVALID_USER_RESPONSE

class MovieTest(TestCase):
    def setUp(self):
        self.test_user_cred = {'username': 'test', 'password': '123test123'}
        self.user = get_user_model().objects.create_user(username='test', password='123test123')
        self.user.save()

    def tearDown(self):
        self.user.delete()

    def test_search(self):
        self.client.login(username='test', password='123test123')
        response = self.client.get('/movie/search/Breaking Bad')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(int(data['totalResults']), 0)
        self.assertEqual(data['Response'], 'True')
        movie_titles = [entry['Title'] for entry in data['Search']]
        self.assertTrue('Breaking Bad' in movie_titles)

    def test_search_element(self):
        self.client.login(username='test', password='123test123')
        response = self.client.get('/movie/search/Breaking Bad')
        data = response.json()
        entry = data['Search'][0]
        for required_key in ['Title', 'Year', 'imdbID', 'Type', 'Poster']:
            self.assertTrue(required_key in entry)

    def test_info(self):
        self.client.login(username='test', password='123test123')
        response = self.client.get('/movie/info/tt0903747')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['Response'], 'True')
        self.assertEqual(data['Title'], 'Breaking Bad')
        for required_key in ['Title', 'Year', 'imdbID', 'Writer', 'Actors', 'Plot', 'Genre', 'Type', 'Ratings', 'Poster']:
            self.assertTrue(required_key in data)

    def test_nologin(self):
        for endpoint in ['search', 'info']:
            response = self.client.get('/movie/{}/test'.format(endpoint))
            data = response.json()
            self.assertEqual(data['Response'], INVALID_USER_RESPONSE['Response'])
            self.assertEqual(data['Error'], INVALID_USER_RESPONSE['Error'])




