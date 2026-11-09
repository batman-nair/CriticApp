import socket
import sys
from importlib import import_module

import pytest


PRODUCTION_SETTINGS = 'critic.settings.production'
_LOCAL_HOSTS = {'localhost', '127.0.0.1', '::1'}
_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex
_real_getaddrinfo = socket.getaddrinfo


class ExternalNetworkBlocked(RuntimeError):
    """Raised when a non-integration test tries to reach a non-local host.

    Deliberately not an OSError, so requests/urllib3 don't wrap it into a
    ConnectionError that the API clients would catch and retry.
    """


def _is_local(sock, address):
    if sock.family == getattr(socket, 'AF_UNIX', None):
        return True
    return isinstance(address, tuple) and address[0] in _LOCAL_HOSTS


def _blocked(target):
    return ExternalNetworkBlocked(
        f'Test tried to reach {target!r}. Mock the external API, '
        f'or mark the test with @pytest.mark.integration.'
    )


@pytest.fixture
def production_settings(monkeypatch):
    """The production settings module, evaluated with the env vars it requires.

    Importing it doesn't change the active (test) settings. It is removed from
    sys.modules afterwards so a later import runs it again.
    """
    monkeypatch.setenv('DB_NAME', 'test')
    monkeypatch.setenv('DB_USER', 'test')
    monkeypatch.setenv('DB_PASSWORD', 'test')
    sys.modules.pop(PRODUCTION_SETTINGS, None)
    yield import_module(PRODUCTION_SETTINGS)
    sys.modules.pop(PRODUCTION_SETTINGS, None)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Start each test with an empty cache, so throttle counts don't leak."""
    from django.core.cache import cache

    cache.clear()


@pytest.fixture(autouse=True)
def _block_external_network(request, monkeypatch):
    """Fail any non-integration test that opens a connection to a remote host.

    Loopback and Unix sockets stay allowed (the Postgres test database).
    """
    if request.node.get_closest_marker('integration'):
        return

    def guarded_connect(sock, address):
        if not _is_local(sock, address):
            raise _blocked(address)
        return _real_connect(sock, address)

    def guarded_connect_ex(sock, address):
        if not _is_local(sock, address):
            raise _blocked(address)
        return _real_connect_ex(sock, address)

    def guarded_getaddrinfo(host, *args, **kwargs):
        if host not in _LOCAL_HOSTS and host is not None:
            raise _blocked(host)
        return _real_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket.socket, 'connect', guarded_connect)
    monkeypatch.setattr(socket.socket, 'connect_ex', guarded_connect_ex)
    monkeypatch.setattr(socket, 'getaddrinfo', guarded_getaddrinfo)
