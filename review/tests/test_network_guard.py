import socket

import pytest
import requests

from review.utils.api_utils import request_json_with_retry


def test_requests_to_external_host_are_blocked():
    with pytest.raises(RuntimeError, match='Mock the external API'):
        requests.get('https://example.com', timeout=1)


def test_api_client_does_not_swallow_blocked_request():
    # request_json_with_retry catches requests.RequestException and retries;
    # the guard must bypass that so the test fails instead of quietly passing.
    with pytest.raises(RuntimeError, match='Mock the external API'):
        request_json_with_retry('https://example.com', source_name='Test API')


def test_loopback_connections_are_allowed():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(('127.0.0.1', 0))
        server.listen(1)
        with socket.create_connection(server.getsockname(), timeout=1):
            pass
