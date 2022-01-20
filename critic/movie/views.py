from django.http import HttpResponse, JsonResponse
from django.shortcuts import render

import os
from dotenv import load_dotenv, find_dotenv
import requests
import json

# Create your views here.

load_dotenv(find_dotenv())
OMDB_API = os.environ['OMDB_API']
BASE_URL = 'http://www.omdbapi.com/?apikey={}&'.format(OMDB_API)

def get_movie_info(request, imdb_id):
    info_url = '{base_url}i={imdb_id}'.format(base_url=BASE_URL, imdb_id=imdb_id)
    r = requests.get(info_url)
    print(r.json(), '||||||', str(r), '|||||', info_url, 'base_url')
    return JsonResponse(r.json())

def search_movie(request, movie_name):
    search_url = '{base_url}s={movie_name}'.format(base_url=BASE_URL, movie_name=movie_name)
    r = requests.get(search_url)
    if r.status_code == 200:
        print(r.json(), '||||||', str(r), '|||||', movie_name, 'base_url')
        return JsonResponse(r.json())
    else:
        return HttpResponse('Error {} when fetching data in {} for movie {}'.format(r.status_code, search_url, movie_name))
