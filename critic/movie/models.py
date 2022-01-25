from unittest.util import _MAX_LENGTH
from django.db import models

# Create your models here.

class Movie(models.Model):
    imdb_id = models.CharField(max_length=16, primary_key=True)
    title = models.CharField(max_length=100)
    image_url = models.URLField()
    year = models.CharField(max_length=16)
    genre = models.CharField(max_length=40)
    director = models.CharField(max_length=50)
    writer = models.CharField(max_length=50)
    actors = models.CharField(max_length=100)
    plot = models.TextField()
    rating = models.CharField(max_length=5)
    type = models.CharField(max_length=10)

    @classmethod
    def from_omdb_json(cls, Title, Year, Genre, Director, Writer, Actors, Plot, Poster, imdbRating, imdbID, Type, **kwargs):
        return cls(imdb_id=imdbID, title=Title, image_url=Poster, year=Year, genre=Genre, director=Director, writer=Writer, actors=Actors, plot=Plot, rating=imdbRating, type=Type)

    def to_omdb_json(self):
        return {
            'Title': self.title,
            'imdbId': self.imdb_id,
            'Poster': self.image_url,
            'Year': self.year,
            'Genre': self.genre,
            'Director': self.director,
            'Writer': self.writer,
            'Actors': self.actors,
            'Plot': self.plot,
            'imdbRating': self.rating,
            'Type': self.type,
            'Response': 'True',
        }


