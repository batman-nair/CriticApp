import re
import time
import unicodedata
from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from review.models import Review, ReviewItem
from review.providers import InvalidItemId, ItemNotFound, ProviderError, get_provider

MATCH = 'MATCH'
CHECK = 'CHECK'
AMBIGUOUS = 'AMBIGUOUS'
NOT_FOUND = 'NOT_FOUND'
MAP = 'MAP'
SKIP = 'SKIP'
STATUSES = (MATCH, CHECK, AMBIGUOUS, NOT_FOUND, MAP, SKIP)

RAWG_PREFIX = 'rawg_'
# IGDB allows 4 requests per second.
REQUEST_DELAY_SECONDS = 0.3
MAX_LISTED_CANDIDATES = 3

_MAP_RE = re.compile(r'(rawg_[0-9]+)=(igdb_[0-9]+)')
_SKIP_RE = re.compile(r'rawg_[0-9]+')
_SUBTITLE_SEPARATOR_RE = re.compile(r':| - | – | — ')
_YEAR_RE = re.compile(r'([0-9]{4})(?:-|$)')


def normalize_title(title):
    """Casefolded title without accents, ™/®, or punctuation; & becomes "and"."""
    # Before NFKD, which turns ™ into "TM".
    title = title.replace('™', '').replace('®', '')
    title = title.replace('&', ' and ')
    title = unicodedata.normalize('NFKD', title.casefold())
    title = ''.join(char for char in title if not unicodedata.combining(char))
    title = re.sub(r'[\W_]+', ' ', title)
    return ' '.join(title.split())


def main_title(title):
    """The normalized part of the title before its first subtitle separator."""
    return normalize_title(_SUBTITLE_SEPARATOR_RE.split(title, maxsplit=1)[0])


def parse_year(value):
    """The year of a stored "YYYY" or "YYYY-MM-DD", else None ("N/A", empty)."""
    match = _YEAR_RE.match((value or '').strip())
    return int(match.group(1)) if match else None


def classify(rawg_title, rawg_year, candidates):
    """Compare a RAWG item with IGDB search results.

    `rawg_year` is the stored text. Returns (status, chosen candidate or None,
    the candidates to list: up to 3 for AMBIGUOUS, else []).
    """
    rawg_normalized = normalize_title(rawg_title)
    rawg_main = main_title(rawg_title)
    year = parse_year(rawg_year)

    def same_title(candidate):
        return bool(rawg_normalized) and rawg_normalized == normalize_title(candidate.title)

    def subtitle_title(candidate):
        # A subtitle dropped from one side only, so "Batman: Arkham City"
        # doesn't match "Batman: Arkham Asylum".
        candidate_normalized = normalize_title(candidate.title)
        return ((bool(rawg_main) and rawg_main == candidate_normalized)
                or (bool(rawg_normalized) and rawg_normalized == main_title(candidate.title)))

    def year_close(candidate):
        candidate_year = parse_year(candidate.year)
        return year is None or candidate_year is None or abs(year - candidate_year) <= 1

    exact = [c for c in candidates
             if same_title(c) and year is not None and parse_year(c.year) == year]
    plausible = [c for c in candidates
                 if (same_title(c) or subtitle_title(c)) and year_close(c)]

    if len(exact) == 1:
        return MATCH, exact[0], []
    if len(exact) > 1:
        return AMBIGUOUS, None, exact[:MAX_LISTED_CANDIDATES]
    if len(plausible) == 1:
        return CHECK, plausible[0], []
    if len(plausible) > 1:
        return AMBIGUOUS, None, plausible[:MAX_LISTED_CANDIDATES]
    return NOT_FOUND, None, []


def _describe(item_id, title, year):
    return '{} "{}" ({})'.format(item_id, title, year or 'N/A')


class Command(BaseCommand):
    help = ('Re-point reviews of legacy RAWG games to the matching IGDB games. '
            'Dry run unless --apply is given.')

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Write changes: apply MATCH rows and the --map rows.',
        )
        parser.add_argument(
            '--map',
            action='append',
            default=[],
            metavar='rawg_<n>=igdb_<n>',
            help='Map a RAWG item to this IGDB item, whatever its status (repeatable).',
        )
        parser.add_argument(
            '--skip',
            action='append',
            default=[],
            metavar='rawg_<n>',
            help='Leave a RAWG item alone (repeatable).',
        )

    def handle(self, *args, **options):
        apply = options['apply']
        maps, skips = self._parse_overrides(options['map'], options['skip'])

        rows = list(
            ReviewItem.objects.filter(item_id__startswith=RAWG_PREFIX)
            .annotate(review_count=Count('review'))
            .filter(review_count__gt=0)
            .order_by('item_id')
        )
        row_ids = {row.item_id for row in rows}
        for rawg_id in sorted((set(maps) | skips) - row_ids):
            self.stderr.write(self.style.WARNING(
                f'Ignoring {rawg_id}: not a stored RAWG item with reviews.'
            ))

        self._provider = None
        self._igdb_requests = 0
        self._status_counts = Counter()
        self._totals = Counter(mapped=0, conflicts=0, left=0)
        self._apply = apply

        try:
            for row in rows:
                self._handle_row(row, maps, skips)
        except (ProviderError, RuntimeError) as ex:
            self._write_summary()
            message = getattr(ex, 'message', None) or str(ex)
            raise CommandError(f'IGDB failed, stopping: {message}') from ex

        self._write_summary()

    def _parse_overrides(self, map_values, skip_values):
        maps = {}
        for value in map_values:
            match = _MAP_RE.fullmatch(value.strip())
            if not match:
                raise CommandError(f'Invalid --map "{value}": expected rawg_<n>=igdb_<n>.')
            rawg_id, igdb_id = match.groups()
            if rawg_id in maps:
                raise CommandError(f'{rawg_id} is mapped more than once.')
            maps[rawg_id] = igdb_id
        skips = set()
        for value in skip_values:
            rawg_id = value.strip()
            if not _SKIP_RE.fullmatch(rawg_id):
                raise CommandError(f'Invalid --skip "{value}": expected rawg_<n>.')
            if rawg_id in maps:
                raise CommandError(f'{rawg_id} is both mapped and skipped.')
            skips.add(rawg_id)
        return maps, skips

    def _igdb(self, method, *args, **kwargs):
        """Call the IGDB provider, keeping under its rate limit."""
        if self._provider is None:
            self._provider = get_provider('game')
        if self._igdb_requests:
            time.sleep(REQUEST_DELAY_SECONDS)
        self._igdb_requests += 1
        return getattr(self._provider, method)(*args, **kwargs)

    def _handle_row(self, row, maps, skips):
        rawg = '{} reviews={}'.format(_describe(row.item_id, row.title, row.year), row.review_count)

        if row.item_id in skips:
            self._status_counts[SKIP] += 1
            self.stdout.write(f'{rawg} SKIP')
            return

        if row.item_id in maps:
            target_id = maps[row.item_id]
            self._status_counts[MAP] += 1
            self.stdout.write(f'{rawg} MAP -> {target_id}')
            if self._apply:
                self._map(row, target_id, explicit=True)
            return

        try:
            candidates = self._igdb('search', row.title)
        except ItemNotFound:
            candidates = []
        status, chosen, listed = classify(row.title, row.year, candidates)
        self._status_counts[status] += 1
        proposed = _describe(chosen.item_id, chosen.title, chosen.year) if chosen else '?'
        self.stdout.write(f'{rawg} -> {proposed} {status}')
        for candidate in listed:
            self.stdout.write('    candidate ' + _describe(candidate.item_id, candidate.title, candidate.year))
        if status == NOT_FOUND:
            self._write_hints(row)

        if not self._apply:
            return
        if status == MATCH:
            self._map(row, chosen.item_id, explicit=False)
        else:
            self._totals['left'] += 1
            self.stdout.write(f'    left: needs --map {row.item_id}=igdb_<n> or --skip {row.item_id}')

    def _write_hints(self, row):
        # RAWG listed DLC and expansions as games, which the normal search leaves out.
        try:
            hints = self._igdb('search', row.title, all_types=True)
        except ItemNotFound:
            hints = []
        if not hints:
            self.stdout.write('    no hints from an unfiltered search')
        for hint in hints[:MAX_LISTED_CANDIDATES]:
            self.stdout.write('    hint ' + _describe(hint.item_id, hint.title, hint.year))

    def _map(self, row, target_id, explicit):
        rawg_id = row.item_id
        # Fetched outside the transaction, so no IGDB request holds it open.
        target = ReviewItem.objects.filter(item_id=target_id).first()
        details = None
        if target is None:
            try:
                details = self._igdb('get_details', target_id)
            except (ItemNotFound, InvalidItemId) as ex:
                self._totals['left'] += 1
                kind = '--map target' if explicit else 'target'
                self.stdout.write(self.style.WARNING(
                    f'    left: {kind} {target_id} not found on IGDB ({ex.message})'
                ))
                return

        with transaction.atomic():
            # Locks the RAWG item, so a review saved to it meanwhile waits and then
            # fails on the deleted row, instead of being deleted with it (CASCADE).
            list(ReviewItem.objects.select_for_update().filter(pk=row.pk).values_list('pk', flat=True))
            if target is None:
                now = timezone.now()
                fields = details.to_review_item_fields()
                target_id = fields.pop('item_id')
                target, _ = ReviewItem.objects.get_or_create(
                    item_id=target_id,
                    defaults={
                        **fields,
                        'last_refreshed_at': now,
                        'last_refresh_attempt_at': now,
                        'refresh_error_count': 0,
                    },
                )
            # Users who already reviewed the target keep that review; theirs
            # stays on the RAWG item (unique user + item, no merging).
            taken = list(Review.objects.filter(review_item=target).values_list('user_id', flat=True))
            # A queryset update leaves modified_date (auto_now) as it was.
            moved = (
                Review.objects.filter(review_item=row)
                .exclude(user_id__in=taken)
                .update(review_item=target)
            )
            conflicts = list(Review.objects.filter(review_item=row).select_related('user').order_by('id'))
            if not conflicts:
                row.delete()

        if moved:
            self._totals['mapped'] += 1
        self.stdout.write(f'    moved {moved} review(s) to {target.item_id}')
        for review in conflicts:
            self._totals['conflicts'] += 1
            self.stdout.write(self.style.WARNING(
                f'    conflict: review {review.id} by {review.user.get_username()} stays on {rawg_id}, '
                f'they already reviewed {target.item_id}'
            ))
        if not conflicts:
            self.stdout.write(f'    deleted {rawg_id}')

    def _write_summary(self):
        self.stdout.write(' '.join(f'{status}={self._status_counts[status]}' for status in STATUSES))
        if self._apply:
            self.stdout.write(
                'mapped={mapped} skipped={skipped} conflicts={conflicts} left={left}'.format(
                    skipped=self._status_counts[SKIP], **self._totals)
            )
        else:
            self.stdout.write('dry run, nothing written (use --apply to write)')
