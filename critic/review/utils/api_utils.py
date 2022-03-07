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
        self._api_key = os.environ.get('OMDB_API_KEY2', None)
        if not self._api_key:
            raise RuntimeError('OMDB_API_KEY required for accessing OMDB.')
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

