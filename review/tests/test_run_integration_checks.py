import subprocess
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase

COMMAND = 'review.management.commands.run_integration_checks'

PASSING_REPORT = """<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="2" failures="0" errors="0">
<testcase classname="review.tests.test_external_api_integration.TestUtilAPI" name="test_search" time="1.0"/>
<testcase classname="review.tests.test_external_api_integration.TestUtilAPI" name="test_details" time="1.0"/>
</testsuite></testsuites>"""

FAILING_REPORT = """<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="2" failures="1" errors="1">
<testcase classname="review.tests.test_external_api_integration.TestUtilAPI" name="test_search" time="1.0">
<failure message="AssertionError: Expected entry 'results' but got {'response': 'False'}&#10;assert False">trace</failure>
</testcase>
<testcase classname="review.tests.test_external_api_integration.TestUtilAPI" name="test_details" time="1.0">
<error message="failed on setup with &quot;KeyError: 'OMDB_API_KEY'&quot;">trace</error>
</testcase>
</testsuite></testsuites>"""


def _fake_run(returncode, report=None):
    def run(cmd, **kwargs):
        if report is not None:
            path = cmd[cmd.index('--junitxml') + 1]
            with open(path, 'w') as report_file:
                report_file.write(report)
        return subprocess.CompletedProcess(cmd, returncode, stdout='pytest output', stderr='')
    return run


@mock.patch(f'{COMMAND}.api_usage.send_alert', return_value=True)
class RunIntegrationChecksTest(SimpleTestCase):
    def _call(self):
        out, err = StringIO(), StringIO()
        call_command('run_integration_checks', stdout=out, stderr=err)
        return out.getvalue(), err.getvalue()

    def test_passing_run_sends_no_alert(self, send_alert):
        with mock.patch(f'{COMMAND}.subprocess.run', side_effect=_fake_run(0, PASSING_REPORT)):
            out, _ = self._call()

        send_alert.assert_not_called()
        self.assertIn('Integration tests passed.', out)

    def test_runs_only_integration_tests_under_test_settings(self, send_alert):
        with mock.patch.dict('os.environ', {'DJANGO_SETTINGS_MODULE': 'critic.settings.production'}):
            with mock.patch(f'{COMMAND}.subprocess.run', side_effect=_fake_run(0, PASSING_REPORT)) as run:
                self._call()

        cmd = run.call_args.args[0]
        self.assertEqual(cmd[1:5], ['-m', 'pytest', '-m', 'integration'])
        self.assertEqual(cmd[cmd.index('--ds') + 1], 'critic.settings.test')
        self.assertEqual(run.call_args.kwargs['env']['DJANGO_SETTINGS_MODULE'], 'critic.settings.test')

    def test_failures_send_one_alert_naming_each_failed_test(self, send_alert):
        with mock.patch(f'{COMMAND}.subprocess.run', side_effect=_fake_run(1, FAILING_REPORT)):
            with self.assertRaises(CommandError):
                self._call()

        send_alert.assert_called_once()
        text = send_alert.call_args.args[0]
        self.assertTrue(text.startswith('CriticApp: prod integration tests failed (2 of 2):'))
        self.assertIn("- TestUtilAPI.test_search: AssertionError: Expected entry 'results'", text)
        self.assertNotIn('assert False', text)
        self.assertIn('- TestUtilAPI.test_details: failed on setup', text)

    def test_error_without_report_alerts_with_exit_code(self, send_alert):
        with mock.patch(f'{COMMAND}.subprocess.run', side_effect=_fake_run(5)):
            with self.assertRaises(CommandError):
                self._call()

        send_alert.assert_called_once_with('CriticApp: prod integration test run errored (pytest exit code 5).')

    def test_timeout_alerts_and_keeps_partial_output(self, send_alert):
        timeout = subprocess.TimeoutExpired('pytest', 900, output=b'test_search PASSED\ntest_details ')
        out = StringIO()
        with mock.patch(f'{COMMAND}.subprocess.run', side_effect=timeout):
            with self.assertRaises(CommandError):
                call_command('run_integration_checks', stdout=out, stderr=StringIO())

        send_alert.assert_called_once_with('CriticApp: prod integration tests timed out after 15 minutes.')
        self.assertIn('test_details', out.getvalue())

    def test_missing_api_key_alerts_without_running_tests(self, send_alert):
        with mock.patch.dict('os.environ', {'RAWG_API_KEY': ''}):
            with mock.patch(f'{COMMAND}.subprocess.run') as run:
                with self.assertRaises(CommandError):
                    self._call()

        run.assert_not_called()
        send_alert.assert_called_once_with(
            'CriticApp: prod integration tests not run, missing API keys: RAWG_API_KEY.')

    def test_collection_error_is_named_without_stray_dot(self, send_alert):
        report = (
            '<testsuites><testsuite tests="1">'
            '<testcase classname="" name="review.tests.test_external_api_integration">'
            '<error message="collection failure">t</error></testcase>'
            '</testsuite></testsuites>'
        )
        with mock.patch(f'{COMMAND}.subprocess.run', side_effect=_fake_run(2, report)):
            with self.assertRaises(CommandError):
                self._call()

        self.assertIn('\n- review.tests.test_external_api_integration: collection failure', send_alert.call_args.args[0])

    def test_long_alert_is_truncated(self, send_alert):
        cases = ''.join(
            '<testcase classname="x.TestUtilAPI" name="test_{}"><failure message="{}">t</failure></testcase>'.format(
                i, 'E' * 500)
            for i in range(40)
        )
        report = '<testsuites><testsuite tests="40">{}</testsuite></testsuites>'.format(cases)
        with mock.patch(f'{COMMAND}.subprocess.run', side_effect=_fake_run(1, report)):
            with self.assertRaises(CommandError):
                self._call()

        text = send_alert.call_args.args[0]
        self.assertLessEqual(len(text), 3500)
        self.assertTrue(text.endswith('...'))

    def test_unsent_alert_still_fails_the_job(self, send_alert):
        send_alert.return_value = False
        with mock.patch(f'{COMMAND}.subprocess.run', side_effect=_fake_run(1, FAILING_REPORT)):
            with self.assertRaises(CommandError):
                out, err = StringIO(), StringIO()
                call_command('run_integration_checks', stdout=out, stderr=err)

        self.assertIn('Alert was not sent', err.getvalue())
