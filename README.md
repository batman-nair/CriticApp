# Critic App

A place to store your personal reviews.

Ever had a brain fart moment when someone asked you for your top horror movies or for indie game suggestions? Yeah, me too. This is a solution to that to provide a database for your reviews so they are easily retrievable. Some required features:
- **Easy to add** - Minimum friction on adding new reviews. Autocomplete details, no big reviews needed. Just a rating number is good enough.
- **Easy to fetch** - Should be possible to do keyword searches like 'horror', 'anime' or just an actor or writer name.
- **Mobile compatible** - Shouldn't have to open laptop for adding or searching reviews.
- **Extensible** - New categories should be easy to add on. Maybe I want to review tweets later. As long as there is a details source, should be easy to add on.

## How to host

This is a django app with pipenv for dependencies. This is hosted on heroku but you can setup your own.
These API keys need to be set for fetching details in their category

`OMDB_API_KEY` for movies - get from [OMDb](https://www.omdbapi.com/)

`RAWG_API_KEY` for games - get from [RAWG](https://rawg.io/)

The above API keys need to be set as environment variables either by creating a `.env` file or by setting configs like what heroku provides.
You can use the `.env.example` as reference if needed.

