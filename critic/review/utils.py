import os
import requests
from dotenv import load_dotenv, find_dotenv
from datetime import datetime

load_dotenv(find_dotenv())
NOT_OK_RESPONSE = {"Response": "False", "Error": "Bad reponse from API."}

# OMDB API
OMDB_API_KEY = os.environ['OMDB_API_KEY']
BASE_OMDB_URL = 'http://www.omdbapi.com/?apikey={}&'.format(OMDB_API_KEY)

def get_omdb_search(query: str) -> dict:
    search_url = '{base_url}s={movie_name}'.format(base_url=BASE_OMDB_URL, movie_name=query)
    r = requests.get(search_url)
    if r.status_code == 200:
        return r.json()
    else:
        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = r.status_code
        response["query"] = query
        return response

def get_omdb_info(item_id: str) -> dict:
    info_url = '{base_url}i={imdb_id}'.format(base_url=BASE_OMDB_URL, imdb_id=item_id)
    r = requests.get(info_url)
    if r.status_code == 200:
        return r.json()
    else:
        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = r.status_code
        response["item_id"] = item_id
        return response

def convert_omdb_to_review(omdb_json: dict) -> dict:
    json_data = dict()
    if omdb_json["Response"] == "False":
        return omdb_json
    if "Search" in omdb_json:
        json_data["Search"] = []
        for item in omdb_json["Search"][:10]:
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
    json_data["Rating"] = omdb_json["imdbRating"]
    return json_data


# RAWG API
RAWG_API_KEY = os.environ['RAWG_API_KEY']
BASE_RAWG_URL = 'https://api.rawg.io/api'

def get_rawg_search(query: str) -> dict:
    search_url = '{base_url}/games?key={api_key}&search={game_name}'.format(base_url=BASE_RAWG_URL, api_key=RAWG_API_KEY, game_name=query)
    r = requests.get(search_url)
    if r.status_code == 200:
        response = r.json()
        response["Response"] = "True"
        return response
    else:
        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = r.status_code
        response["query"] = query
        return response

def get_rawg_info(item_id: str) -> dict:
    info_url = '{base_url}/games/{game_id}?key={api_key}'.format(base_url=BASE_RAWG_URL, api_key=RAWG_API_KEY, game_id=item_id)
    r = requests.get(info_url)
    if r.status_code == 200:
        response = r.json()
        response["Response"] = "True"
        return response
    else:
        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = r.status_code
        response["item_id"] = item_id
        return response

def convert_rawg_to_review(rawg_json: dict) -> dict:
    json_data = dict()
    if "results" in rawg_json:
        json_data["Search"] = []
        for item in rawg_json["results"][:10]:
            json_data["Search"].append(_convert_rawg_item_to_review(item))
    else:
        json_data = _convert_rawg_item_to_review(rawg_json, detailed=True)
    json_data["Response"] = "True"
    return json_data


def _convert_rawg_item_to_review(rawg_json: dict, detailed: bool=False) -> dict:
    json_data = dict()
    json_data["ItemID"] = rawg_json["id"]
    json_data["Title"] = rawg_json["name"]
    json_data["ImageURL"] = rawg_json["background_image"]
    if not json_data["ImageURL"] or json_data["ImageURL"] == "null":
        json_data["ImageURL"] = "N/A"
    json_data["Year"] = rawg_json["released"]
    if not json_data["Year"]:
        json_data["Year"] = "N/A"
    elif '-' in json_data["Year"]:
        json_data["Year"] = str(datetime.strptime(json_data["Year"], '%Y-%m-%d').year)
    if not detailed:
        return json_data
    genres = set(entry["name"] for entry in rawg_json["genres"])
    json_data["Attr1"] = ', '.join(genres)
    crew = set(entry["name"] for entry in rawg_json["developers"]+rawg_json["publishers"])
    json_data["Attr2"] = ', '.join(crew)
    platforms = set(entry["platform"]["name"] for entry in rawg_json["platforms"])
    json_data["Attr3"] = ', '.join(platforms)
    json_data["Description"] = rawg_json["description"]
    json_data["Rating"] = rawg_json["rating"]
    return json_data
