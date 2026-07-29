"""BrainChain API client error mapping."""
import pytest

from brainchain_slack.api_client import BrainChainClient, BrainUnavailable, UserNotMapped


class _Resp:
    def __init__(self, status_code, data=None):
        self.status_code = status_code
        self._data = data or {}

    def json(self):
        return self._data


def _client(status, data=None, raise_exc=None):
    def post(url, json=None, headers=None, timeout=None):
        if raise_exc:
            raise raise_exc
        assert headers["X-Service-Token"] == "svc"
        return _Resp(status, data)

    return BrainChainClient("http://api", "svc", post=post)


def test_ask_returns_payload():
    c = _client(200, {"message": {"segments": []}})
    assert c.ask("a@b.com", "q") == {"message": {"segments": []}}


def test_404_raises_user_not_mapped():
    with pytest.raises(UserNotMapped):
        _client(404).ask("a@b.com", "q")


def test_5xx_raises_unavailable():
    with pytest.raises(BrainUnavailable):
        _client(500).ask("a@b.com", "q")


def test_connection_error_raises_unavailable():
    with pytest.raises(BrainUnavailable):
        _client(0, raise_exc=OSError("boom")).ask("a@b.com", "q")
