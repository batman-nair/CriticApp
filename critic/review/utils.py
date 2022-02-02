import os
import requests
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
OMDB_API_KEY = os.environ['OMDB_API_KEY']
BASE_URL = 'http://www.omdbapi.com/?apikey={}&'.format(OMDB_API_KEY)
NOT_OK_RESPONSE = {"Response": "False", "Error": "Bad reponse from API."}

def get_omdb_search(movie_name: str) -> dict:
    search_url = '{base_url}s={movie_name}'.format(base_url=BASE_URL, movie_name=movie_name)
    r = requests.get(search_url)
    if r.status_code == 200:
        return r.json()
    else:
        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = r.status_code
        response["movie_name"] = movie_name
        return response

def get_omdb_info(imdb_id: str) -> dict:
    info_url = '{base_url}i={imdb_id}'.format(base_url=BASE_URL, imdb_id=imdb_id)
    r = requests.get(info_url)
    if r.status_code == 200:
        return r.json()
    else:
        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = r.status_code
        response["imdb_id"] = imdb_id
        return response

def convert_omdb_to_review(omdb_json: dict) -> dict:
    json_data = dict()
    if omdb_json["Response"] == "False":
        return omdb_json
    if "Search" in omdb_json:
        json_data["Search"] = []
        for item in omdb_json["Search"]:
            json_data["Search"].append(_convert_omdb_item_to_review(item))
    else:
        json_data = _convert_omdb_item_to_review(omdb_json, detailed=True)
    json_data["Response"] = "True"
    return json_data


def _convert_omdb_item_to_review(omdb_json: dict, detailed: bool=False) -> dict:
    json_data = dict()
    json_data["ItemID"] = omdb_json["imdbID"]
    json_data["Title"] = omdb_json["Title"]
    json_data["ImageURL"] = omdb_json["Poster"]
    json_data["Year"] = omdb_json["Year"]
    if not detailed:
        return json_data
    json_data["Attr1"] = omdb_json["Genre"]
    crew = set([omdb_json["Director"], omdb_json["Writer"], omdb_json["Actors"]])
    crew.discard("N/A")
    json_data["Attr2"] = ', '.join(crew)
    json_data["Attr3"] = omdb_json["Type"]
    json_data["Description"] = omdb_json["Plot"]
    return json_data