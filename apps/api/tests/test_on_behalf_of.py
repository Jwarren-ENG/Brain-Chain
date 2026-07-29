"""Slack service principal: token auth + permissions evaluated as mapped user."""
import pytest

from tests.test_permissions import RESTRICTED_MARKER

TOKEN = "test-service-token-123"


@pytest.fixture()
def service_env(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("BRAINCHAIN_SLACK_SERVICE_TOKEN", TOKEN)
    get_settings.cache_clear()
    yield
    monkeypatch.delenv("BRAINCHAIN_SLACK_SERVICE_TOKEN")
    get_settings.cache_clear()


def _ask(client, email, query, token=TOKEN):
    return client.post(
        "/api/ask/on-behalf-of",
        json={"email": email, "query": query},
        headers={"X-Service-Token": token},
    )


def test_rejected_when_token_not_configured(client):
    resp = _ask(client, "avery.chen@heliosaerodyne.com", "hello there")
    assert resp.status_code == 401


def test_rejected_with_wrong_token(client, service_env):
    resp = _ask(client, "avery.chen@heliosaerodyne.com", "hello there", token="wrong")
    assert resp.status_code == 401


def test_unknown_email_is_404(client, service_env):
    resp = _ask(client, "nobody@heliosaerodyne.com", "hello there")
    assert resp.status_code == 404


def test_answers_as_mapped_user_with_citations(client, service_env):
    resp = _ask(client, "avery.chen@heliosaerodyne.com",
                "What are the main risks affecting the Phoenix project?")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_name"]
    assert body["message"]["segments"]
    assert body["message"]["citations"]


def test_permissions_enforced_for_mapped_user(client, service_env):
    # Mirror tests/test_permissions.py: the restricted contract-strategy content
    # (RESTRICTED_MARKER) is visible only to lena.hart (General Counsel, clearance
    # 3, Legal Privileged group). avery.chen (clearance 1) must never see it, even
    # though the query is routed through the shared service-token path.
    q = "What is our negotiation strategy?"
    low = _ask(client, "avery.chen@heliosaerodyne.com", q).json()
    high = _ask(client, "lena.hart@heliosaerodyne.com", q).json()
    low_text = str(low["message"])
    high_text = str(high["message"])
    assert RESTRICTED_MARKER not in low_text
    assert RESTRICTED_MARKER in high_text
