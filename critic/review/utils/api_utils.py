import os
import requests
from abc import ABC, abstractmethod
from dotenv import load_dotenv, find_dotenv
from datetime import datetime

load_dotenv(find_dotenv())
NOT_OK_RESPONSE = {"Response": "False", "Error": "Bad reponse from API."}

class ReviewItemAPIBase(ABC):
    @abstractmethod
    def search(self, query: str) -> dict:
        raise NotImplementedError('Should be implemented by subclass')
    @abstractmethod
    def get_details(self, item_id: str) -> dict:
        raise NotImplementedError('Should be implemented by subclass')

    @property
    def prefix(self):
        return self._prefix
    @prefix.setter
    def prefix(self, new_prefix: str):
        assert len(new_prefix) > 0 and new_prefix.endswith('_')
        self._prefix = new_prefix


class OMDBItemAPI(ReviewItemAPIBase):
    def __init__(self):
        self.prefix = 'omdb_'
        self._api_key = os.environ.get('OMDB_API_KEY', None)
        if not self._api_key:
            raise RuntimeError('OMDB_API_KEY required for accessing OMDB data.')
        self._base_url = 'http://www.omdbapi.com/?apikey={}'.format(self._api_key)

    def search(self, query) -> dict:
        search_url = '{base_url}&s={movie_name}'.format(base_url=self._base_url, movie_name=query)
        r = requests.get(search_url)
        if r.status_code == 200:
            omdb_json = r.json()
        else:
            response = NOT_OK_RESPONSE.copy()
            response["status_code"] = r.status_code
            response["query"] = query
            return response
        return self._convert_to_review(omdb_json)

    def get_details(self, item_id: str) -> dict:
        if item_id.startswith(self.prefix):
            item_id = item_id[len(self.prefix):]
        info_url = '{base_url}&i={imdb_id}'.format(base_url=self._base_url, imdb_id=item_id)
        r = requests.get(info_url)
        if r.status_code == 200:
            omdb_json = r.json()
        else:
            response = NOT_OK_RESPONSE.copy()
            response["status_code"] = r.status_code
            response["item_id"] = item_id
            return response
        return self._convert_to_review(omdb_json)

    def _convert_to_review(self, omdb_json: dict) -> dict:
        json_data = dict()
        if omdb_json["Response"] == "False":
            return omdb_json
        if "Search" in omdb_json:
            json_data["Results"] = []
            for item in omdb_json["Search"][:10]:
                json_data["Results"].append(self._convert_omdb_item_to_review(item))
        else:
            json_data = self._convert_omdb_item_to_review(omdb_json, detailed=True)
        json_data["Response"] = "True"
        return json_data

    def _convert_omdb_item_to_review(self, omdb_json: dict, detailed: bool=False) -> dict:
        json_data = dict()
        json_data["ItemID"] = self.prefix + omdb_json["imdbID"]
        json_data["Title"] = omdb_json["Title"]
        json_data["ImageURL"] = omdb_json["Poster"]
        json_data["Year"] = omdb_json["Year"]
        if not detailed:
            return json_data
        json_data["Attr1"] = omdb_json["Genre"]
        crew = set()
        for role in ["Director", "Writer", "Actors"]:
            crew.update([name.strip() for name in omdb_json[role].split(',')])
        crew.discard("N/A")
        json_data["Attr2"] = ', '.join(crew)
        json_data["Attr3"] = omdb_json["Type"]
        json_data["Description"] = omdb_json["Plot"]
        json_data["Rating"] = omdb_json["imdbRating"]
        return json_data


class RAWGItemAPI(ReviewItemAPIBase):
    def __init__(self):
        self.prefix = 'rawg_'
        self._api_key = os.environ.get('RAWG_API_KEY', None)
        if not self._api_key:
            raise RuntimeError('RAWG_API_KEY required for accessing RAWG data.')
        self._base_url =  'https://api.rawg.io/api'

    def search(self, query: str) -> dict:
        search_url = '{base_url}/games?key={api_key}&search={game_name}'.format(
            base_url=self._base_url, api_key=self._api_key, game_name=query)
        r = requests.get(search_url)
        if r.status_code == 200:
            rawg_json = r.json()
            rawg_json["Response"] = "True"
            if len(rawg_json["results"]) == 0:
                rawg_json = {
                    "Response": "False",
                    "Error": "Game not found!"
                }
        else:
            rawg_json = NOT_OK_RESPONSE.copy()
            rawg_json["status_code"] = r.status_code
            rawg_json["query"] = query
        return self._convert_rawg_to_review(rawg_json)

    def get_details(self, item_id: str) -> dict:
        if item_id.startswith(self.prefix):
            item_id = item_id[len(self.prefix):]
        info_url = '{base_url}/games/{game_id}?key={api_key}'.format(
            base_url=self._base_url, api_key=self._api_key, game_id=item_id)
        r = requests.get(info_url)
        if r.status_code == 200:
            rawg_json = r.json()
            rawg_json["Response"] = "True"
        else:
            rawg_json = NOT_OK_RESPONSE.copy()
            rawg_json["status_code"] = r.status_code
            rawg_json["item_id"] = item_id
        return self._convert_rawg_to_review(rawg_json)


    def _convert_rawg_to_review(self, rawg_json: dict) -> dict:
        json_data = dict()
        if rawg_json["Response"] == "False":
            return rawg_json
        if "results" in rawg_json:
            json_data["Results"] = []
            for item in rawg_json["results"][:10]:
                json_data["Results"].append(self._convert_rawg_item_to_review(item))
        else:
            json_data = self._convert_rawg_item_to_review(rawg_json, detailed=True)
        json_data["Response"] = "True"
        return json_data

    def _convert_rawg_item_to_review(self, rawg_json: dict, detailed: bool=False) -> dict:
        json_data = dict()
        json_data["ItemID"] = self.prefix + str(rawg_json["id"])
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
