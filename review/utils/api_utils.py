import os
import time
import requests
from abc import ABC, abstractmethod
from dotenv import load_dotenv, find_dotenv
from datetime import datetime

from . import metrics

load_dotenv(find_dotenv())
MISSING_PREFIX_RESPONSE = {"response": "False", "error": "Missing prefix in item id."}
NOT_OK_RESPONSE = {"response": "False", "error": "Bad reponse from API."}
REQUEST_TIMEOUT_SECONDS = 10
DEFAULT_MAX_RETRIES = 3
RETRY_STATUS_CODES = (429, 500, 502, 503, 504)
DEFAULT_REQUEST_HEADERS = {
    "User-Agent": "CriticApp/1.0",
    "Accept": "application/json",
}

def request_json_with_retry(url: str, source_name: str='Upstream API', retries: int=DEFAULT_MAX_RETRIES) -> tuple[dict, dict]:
    for attempt in range(retries):
        try:
            response_obj = requests.get(
                url,
                timeout=REQUEST_TIMEOUT_SECONDS,
                headers=DEFAULT_REQUEST_HEADERS,
            )
        except requests.RequestException as ex:
            if attempt < retries - 1:
                time.sleep(attempt + 1)
                continue
            response = NOT_OK_RESPONSE.copy()
            response["error"] = "Request failure to upstream API."
            response["exception_type"] = ex.__class__.__name__
            response["source"] = source_name
            metrics.record_upstream_api_call(source_name, 'exception')
            return {}, response

        if response_obj.status_code == 200:
            try:
                data = response_obj.json()
                metrics.record_upstream_api_call(source_name, 'success')
                return data, {}
            except ValueError:
                response = NOT_OK_RESPONSE.copy()
                response["error"] = "Invalid JSON from upstream API."
                response["source"] = source_name
                metrics.record_upstream_api_call(source_name, 'invalid_json')
                return {}, response

        if response_obj.status_code in RETRY_STATUS_CODES and attempt < retries - 1:
            retry_after = response_obj.headers.get('Retry-After')
            try:
                sleep_time = int(retry_after) if retry_after else (attempt + 1) * 2
            except ValueError:
                sleep_time = (attempt + 1) * 2
            time.sleep(max(sleep_time, 1))
            continue

        response = NOT_OK_RESPONSE.copy()
        response["status_code"] = response_obj.status_code
        response["upstream_reason"] = response_obj.reason
        response["source"] = source_name
        metrics.record_upstream_api_call(source_name, 'http_error')
        return {}, response

    response = NOT_OK_RESPONSE.copy()
    response["error"] = "Exhausted retries calling upstream API."
    response["source"] = source_name
    metrics.record_upstream_api_call(source_name, 'exhausted_retries')
    return {}, response

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
        omdb_json, response = request_json_with_retry(search_url, source_name='OMDB API')
        if response:
            response["query"] = query
            return response
        return self._convert_to_review(omdb_json)

    def get_details(self, item_id: str) -> dict:
        if not item_id.startswith(self.prefix):
            return MISSING_PREFIX_RESPONSE.copy()
        item_id = item_id[len(self.prefix):]
        info_url = '{base_url}&i={imdb_id}'.format(base_url=self._base_url, imdb_id=item_id)
        omdb_json, response = request_json_with_retry(info_url, source_name='OMDB API')
        if response:
            response["item_id"] = item_id
            return response
        return self._convert_to_review(omdb_json)

    def _convert_to_review(self, omdb_json: dict) -> dict:
        json_data = dict()
        if omdb_json["Response"] == "False":
            response = NOT_OK_RESPONSE.copy()
            response["error"] = omdb_json["Error"]
            return response
        if "Search" in omdb_json:
            json_data["results"] = []
            for item in omdb_json["Search"][:10]:
                json_data["results"].append(self._convert_omdb_item_to_review(item))
        else:
            json_data = self._convert_omdb_item_to_review(omdb_json, detailed=True)
        json_data["response"] = "True"
        return json_data

    def _convert_omdb_item_to_review(self, omdb_json: dict, detailed: bool=False) -> dict:
        json_data = dict()
        json_data["item_id"] = self.prefix + omdb_json["imdbID"]
        json_data["title"] = omdb_json["Title"]
        json_data["image_url"] = omdb_json["Poster"]
        json_data["year"] = omdb_json["Year"]
        if not detailed:
            return json_data
        json_data["attr1"] = omdb_json["Genre"]
        crew = set()
        for role in ["Director", "Writer", "Actors"]:
            crew.update([name.strip() for name in omdb_json[role].split(',')])
        crew.discard("N/A")
        json_data["attr2"] = ', '.join(crew)
        json_data["attr3"] = omdb_json["Type"]
        json_data["description"] = omdb_json["Plot"]
        json_data["rating"] = omdb_json["imdbRating"]
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
        rawg_json, response = request_json_with_retry(search_url, source_name='RAWG API')
        if response:
            response["query"] = query
            rawg_json = response
        else:
            rawg_json["response"] = "True"
            if len(rawg_json["results"]) == 0:
                rawg_json = {
                    "response": "False",
                    "error": "Game not found!"
                }
        return self._convert_rawg_to_review(rawg_json)

    def get_details(self, item_id: str) -> dict:
        if not item_id.startswith(self.prefix):
            return MISSING_PREFIX_RESPONSE.copy()
        item_id = item_id[len(self.prefix):]
        info_url = '{base_url}/games/{game_id}?key={api_key}'.format(
            base_url=self._base_url, api_key=self._api_key, game_id=item_id)
        rawg_json, response = request_json_with_retry(info_url, source_name='RAWG API')
        if response:
            rawg_json = response
            rawg_json["item_id"] = item_id
        else:
            rawg_json["response"] = "True"
        return self._convert_rawg_to_review(rawg_json)


    def _convert_rawg_to_review(self, rawg_json: dict) -> dict:
        json_data = dict()
        if rawg_json["response"] == "False":
            return rawg_json
        if "results" in rawg_json:
            json_data["results"] = []
            for item in rawg_json["results"][:10]:
                json_data["results"].append(self._convert_rawg_item_to_review(item))
        else:
            json_data = self._convert_rawg_item_to_review(rawg_json, detailed=True)
        json_data["response"] = "True"
        return json_data

    def _convert_rawg_item_to_review(self, rawg_json: dict, detailed: bool=False) -> dict:
        json_data = dict()
        json_data["item_id"] = self.prefix + str(rawg_json["id"])
        json_data["title"] = rawg_json["name"]
        json_data["image_url"] = rawg_json["background_image"]
        if not json_data["image_url"] or json_data["image_url"] == "null":
            json_data["image_url"] = "N/A"
        json_data["year"] = rawg_json["released"]
        if not json_data["year"]:
            json_data["year"] = "N/A"
        elif '-' in json_data["year"]:
            json_data["year"] = str(datetime.strptime(json_data["year"], '%Y-%m-%d').year)
        if not detailed:
            return json_data
        genres = set(entry["name"] for entry in rawg_json["genres"])
        json_data["attr1"] = ', '.join(genres)
        crew = set(entry["name"] for entry in rawg_json["developers"]+rawg_json["publishers"])
        json_data["attr2"] = ', '.join(crew)
        platforms = set(entry["platform"]["name"] for entry in rawg_json["platforms"])
        json_data["attr3"] = ', '.join(platforms)
        json_data["description"] = rawg_json["description"]
        json_data["rating"] = rawg_json["rating"] * 2
        return json_data


class JikanItemAPI(ReviewItemAPIBase):
    def __init__(self, type: str):
        self.type_ = type
        if type not in ['anime', 'manga']:
            raise RuntimeError('Jikan API should be of type "anime" or "manga".')
        self.prefix = 'jikan_{}_'.format(self.type_)
        self._base_url = 'https://api.jikan.moe/v4/{type}'.format(type=type)

    def search(self, query) -> dict:
        search_url = '{base_url}?q={search_term}'.format(base_url=self._base_url, search_term=query)
        jikan_json, response = request_json_with_retry(search_url, source_name='Jikan API')
        if response:
            response["query"] = query
            return response
        return self._convert_to_review(jikan_json)

    def get_details(self, item_id: str) -> dict:
        if not item_id.startswith(self.prefix):
            return MISSING_PREFIX_RESPONSE.copy()
        item_id = item_id[len(self.prefix):]
        info_url = '{base_url}/{item_id}'.format(base_url=self._base_url, item_id=item_id)
        jikan_json, response = request_json_with_retry(info_url, source_name='Jikan API')
        if response:
            response["item_id"] = item_id
            return response
        return self._convert_to_review(jikan_json)

    def _convert_to_review(self, jikan_json: dict) -> dict:
        json_data = dict()
        if isinstance(jikan_json["data"], list):
            json_data["results"] = []
            count = 0
            for item in jikan_json["data"]:
                if not item["score"]:
                    continue
                count += 1
                if count >= 10:
                    break
                json_data["results"].append(self._convert_jikan_item_to_review(item))
        else:
            json_data = self._convert_jikan_item_to_review(jikan_json["data"], detailed=True)
        json_data["response"] = "True"
        return json_data

    def _convert_jikan_item_to_review(self, jikan_json: dict, detailed: bool=False) -> dict:
        json_data = dict()
        json_data["item_id"] = self.prefix + str(jikan_json["mal_id"])
        json_data["title"] = jikan_json["title"]
        json_data["image_url"] = jikan_json["images"]["jpg"]["image_url"]
        if self.type_ == 'anime':
            time_data = jikan_json["aired"]["prop"]
        else:
            time_data = jikan_json["published"]["prop"]
        json_data["year"] = str(time_data["from"]["year"])
        if time_data["to"]["year"]:
            json_data["year"] += '-{}'.format(time_data["to"]["year"])
        if not json_data["year"]:
            json_data["year"] = "N/A"
        if not detailed:
            return json_data
        genres = set(entry["name"] for entry in jikan_json["genres"])
        json_data["attr1"] = ', '.join(genres)
        crew = set()
        if self.type_ == 'manga':
            roles = ["authors"]
        else:
            roles = ["studios"]
        for role in roles:
            crew.update(set(entry["name"] for entry in jikan_json[role]))
        json_data["attr2"] = ', '.join(crew)
        json_data["attr3"] = jikan_json["type"]
        json_data["description"] = jikan_json["synopsis"]
        json_data["rating"] = jikan_json["score"]
        return json_data

