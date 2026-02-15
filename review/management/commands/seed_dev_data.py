import os
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand

from review.models import Review, ReviewItem


class Command(BaseCommand):
    help = "Seed a dev user and sample review data."

    def handle(self, *args, **options):
        username = os.getenv("DJANGO_SEED_USERNAME", "devuser")
        password = os.getenv("DJANGO_SEED_PASSWORD", "devpass123")
        email = os.getenv("DJANGO_SEED_EMAIL", "devuser@example.com")

        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(
            username=username,
            defaults={"email": email},
        )
        if created:
            user.set_password(password)
            if hasattr(user, "email") and not user.email:
                user.email = email
            user.save()
        elif hasattr(user, "email") and not user.email and email:
            user.email = email
            user.save(update_fields=["email"])

        sample_reviews = [
            {
                "item_id": "movie_001",
                "rating": Decimal("8.50"),
                "data": "Tense pacing with a strong final act.",
                "tags": "thriller,classic",
            },
            {
                "item_id": "game_001",
                "rating": Decimal("9.00"),
                "data": "Great exploration and a smart progression loop.",
                "tags": "rpg,space",
            },
            {
                "item_id": "anime_001",
                "rating": Decimal("8.00"),
                "data": "Beautiful animation with heartfelt character arcs.",
                "tags": "adventure,fantasy",
            },
            {
                "item_id": "movie_002",
                "rating": Decimal("7.80"),
                "data": "Visually stunning with memorable performances.",
                "tags": "drama,emotional",
            },
            {
                "item_id": "manga_001",
                "rating": Decimal("8.20"),
                "data": "Charming indie story with great character development.",
                "tags": "slice-of-life,art",
            },
            {
                "item_id": "game_002",
                "rating": Decimal("8.30"),
                "data": "Brilliant tactical gameplay with great replayability.",
                "tags": "strategy,naval",
            },
            {
                "item_id": "movie_003",
                "rating": Decimal("8.10"),
                "data": "A masterpiece of world-building and atmosphere.",
                "tags": "sci-fi,mystery",
            },
            {
                "item_id": "anime_002",
                "rating": Decimal("7.60"),
                "data": "Inspiring sports drama with great pacing.",
                "tags": "sports,drama",
            },
            {
                "item_id": "game_003",
                "rating": Decimal("7.90"),
                "data": "Fast-paced action with satisfying movement mechanics.",
                "tags": "action,parkour",
            },
            {
                "item_id": "manga_002",
                "rating": Decimal("7.70"),
                "data": "Gripping mystery with great atmosphere.",
                "tags": "mystery,thriller",
            },
            {
                "item_id": "movie_004",
                "rating": Decimal("8.40"),
                "data": "Cleverly written with unexpected twists.",
                "tags": "mystery,thriller",
            },
            {
                "item_id": "anime_003",
                "rating": Decimal("8.90"),
                "data": "Epic fantasy with incredible action sequences.",
                "tags": "fantasy,action",
            },
            {
                "item_id": "game_004",
                "rating": Decimal("8.70"),
                "data": "Mind-bending puzzles with gorgeous visuals.",
                "tags": "puzzle,indie",
            },
            {
                "item_id": "movie_005",
                "rating": Decimal("7.20"),
                "data": "Heart-warming romance with beautiful cinematography.",
                "tags": "romance,drama",
            },
            {
                "item_id": "manga_003",
                "rating": Decimal("8.60"),
                "data": "Fascinating sci-fi concept with amazing art.",
                "tags": "sci-fi,philosophical",
            },
            {
                "item_id": "game_005",
                "rating": Decimal("8.10"),
                "data": "Addictive shooter with smooth controls.",
                "tags": "fps,cyberpunk",
            },
            {
                "item_id": "anime_004",
                "rating": Decimal("7.40"),
                "data": "Cozy slice-of-life with time travel elements.",
                "tags": "slice-of-life,supernatural",
            },
            {
                "item_id": "movie_006",
                "rating": Decimal("6.90"),
                "data": "Creepy atmosphere but predictable plot.",
                "tags": "horror,suspense",
            },
            {
                "item_id": "game_006",
                "rating": Decimal("9.20"),
                "data": "Stunning underwater world with emotional storytelling.",
                "tags": "adventure,art",
            },
            {
                "item_id": "manga_004",
                "rating": Decimal("7.30"),
                "data": "Fun comedy with a unique magical cooking twist.",
                "tags": "comedy,food",
            },
            {
                "item_id": "movie_007",
                "rating": Decimal("7.50"),
                "data": "Hilarious comedy with creative sci-fi elements.",
                "tags": "comedy,sci-fi",
            },
        ]

        item_ids = [sample["item_id"] for sample in sample_reviews]
        missing_items = [
            item_id
            for item_id in item_ids
            if not ReviewItem.objects.filter(pk=item_id).exists()
        ]
        if missing_items:
            call_command("loaddata", "dev_items", app="review", verbosity=0)

        created_reviews = 0
        for sample in sample_reviews:
            try:
                item = ReviewItem.objects.get(pk=sample["item_id"])
            except ReviewItem.DoesNotExist:
                continue

            _, review_created = Review.objects.get_or_create(
                user=user,
                review_item=item,
                defaults={
                    "review_rating": sample["rating"],
                    "review_data": sample["data"],
                    "review_tags": sample["tags"],
                },
            )
            if review_created:
                created_reviews += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete. User: {username}. Reviews created: {created_reviews}."
            )
        )
