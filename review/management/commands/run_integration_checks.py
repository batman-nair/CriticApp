import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from review.utils import api_usage

TEST_SETTINGS_MODULE = 'critic.settings.test'
# Test settings replace missing keys with dummies, which would look like an upstream failure.
REQUIRED_KEYS = ('OMDB_API_KEY', 'RAWG_API_KEY', 'MAL_CLIENT_ID')
RUN_TIMEOUT_SECONDS = 15 * 60
MAX_REASON_LENGTH = 200
# Telegram messages are capped at 4096 characters.
MAX_ALERT_LENGTH = 3500


class Command(BaseCommand):
    help = (
        'Run the integration test suite (real external APIs) and send one Telegram alert '
        'listing the failures. Sends nothing when everything passes.'
    )

    def handle(self, *args, **options):
        missing = [name for name in REQUIRED_KEYS if not os.environ.get(name)]
        if missing:
            self._fail('CriticApp: prod integration tests not run, missing API keys: {}.'.format(', '.join(missing)))

        with tempfile.TemporaryDirectory() as tmp_dir:
            report_path = os.path.join(tmp_dir, 'integration.xml')
            try:
                result = subprocess.run(
                    self._pytest_command(report_path),
                    cwd=settings.BASE_DIR,
                    env=self._pytest_env(),
                    capture_output=True,
                    text=True,
                    timeout=RUN_TIMEOUT_SECONDS,
                )
            except subprocess.TimeoutExpired as exc:
                # Partial output shows which test hung. TimeoutExpired can hold bytes even with text=True.
                for stream, output in ((self.stdout, exc.stdout), (self.stderr, exc.stderr)):
                    if output:
                        stream.write(output.decode(errors='replace') if isinstance(output, bytes) else output)
                self._fail('CriticApp: prod integration tests timed out after {} minutes.'.format(
                    RUN_TIMEOUT_SECONDS // 60))

            self.stdout.write(result.stdout)
            if result.returncode == 0:
                self.stdout.write(self.style.SUCCESS('Integration tests passed.'))
                return

            self.stderr.write(result.stderr)
            total, failures = _read_report(report_path)
            if failures:
                lines = ['CriticApp: prod integration tests failed ({} of {}):'.format(len(failures), total)]
                lines += ['- {}: {}'.format(name, reason) for name, reason in failures]
                text = '\n'.join(lines)
            else:
                text = 'CriticApp: prod integration test run errored (pytest exit code {}).'.format(
                    result.returncode)
            self._fail(text)

    @staticmethod
    def _pytest_command(report_path):
        return [
            sys.executable, '-m', 'pytest',
            '-m', 'integration',
            '--ds', TEST_SETTINGS_MODULE,
            '-p', 'no:cacheprovider',
            '-q',
            '--junitxml', report_path,
        ]

    @staticmethod
    def _pytest_env():
        # Test settings keep the run off the prod database. The CronJob's env sets
        # DJANGO_SETTINGS_MODULE to production, which would override pytest.ini.
        env = os.environ.copy()
        env['DJANGO_SETTINGS_MODULE'] = TEST_SETTINGS_MODULE
        return env

    def _fail(self, text):
        text = _truncate(text, MAX_ALERT_LENGTH)
        if not api_usage.send_alert(text):
            self.stderr.write(self.style.WARNING('Alert was not sent (Telegram not configured or unreachable).'))
        raise CommandError(text)


def _truncate(text, max_length):
    return text if len(text) <= max_length else text[:max_length - 3] + '...'


def _read_report(report_path):
    """Return (total tests, [(test name, short reason), ...]) from a pytest JUnit XML report."""
    try:
        root = ET.parse(report_path).getroot()
    except (OSError, ET.ParseError):
        return 0, []

    total = 0
    failures = []
    for case in root.iter('testcase'):
        total += 1
        problem = case.find('failure')
        if problem is None:
            problem = case.find('error')
        if problem is None:
            continue
        class_name = case.get('classname', '').split('.')[-1]
        name = '{}.{}'.format(class_name, case.get('name', '')) if class_name else case.get('name', '')
        reason = (problem.get('message') or '').strip().splitlines()
        reason = _truncate(reason[0] if reason else 'failed', MAX_REASON_LENGTH)
        failures.append((name, reason))
    return total, failures
