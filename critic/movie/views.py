from django.http import HttpResponse, JsonResponse
from django.shortcuts import render

from .models import Movie

import os
from dotenv import load_dotenv, find_dotenv
import requests
import json

load_dotenv(find_dotenv())
OMDB_API = os.environ['OMDB_API']
BASE_URL = 'http://www.omdbapi.com/?apikey={}&'.format(OMDB_API)
INVALID_USER_RESPONSE = {"Response": "False", "Error": "User not authenticated."}
NOT_OK_RESPONSE = {"Response": "False", "Error": "Bad reponse from API."}

def get_movie_info(request, imdb_id):
    if not request.user.is_authenticated:
        return JsonResponse(INVALID_USER_RESPONSE)
    try:
        movie = Movie.objects.get(imdb_id=imdb_id)
        print('Found movie {} in db.'.format(movie.title))
        return JsonResponse(movie.to_omdb_json())
    except Movie.DoesNotExist:
        print('Movie does not exist in db, fetching from API')
    info_url = '{base_url}i={imdb_id}'.format(base_url=BASE_URL, imdb_id=imdb_id)
    r = requests.get(info_url)
    if r.status_code == 200:
        json_data = r.json()
        if json_data['Response'] == 'True':
            movie = Movie.from_omdb_json(**json_data)
            movie.save()
            print('Saving movie {} to db'.format(movie.title))
        return JsonResponse(json_data)
    else:
        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = r.status_code
        response["imdb_id"] = imdb_id
        return JsonResponse(response)

def search_movie(request, movie_name):
    if not request.user.is_authenticated:
        return JsonResponse(INVALID_USER_RESPONSE)
    search_url = '{base_url}s={movie_name}'.format(base_url=BASE_URL, movie_name=movie_name)
    r = requests.get(search_url)
    if r.status_code == 200:
        return JsonResponse(r.json())
    else:
        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = r.status_code
        response["movie_name"] = movie_name
        return JsonResponse(response)
