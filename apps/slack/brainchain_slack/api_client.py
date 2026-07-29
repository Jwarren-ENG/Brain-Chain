"""Thin client of the BrainChain API's service-principal ask endpoint."""
from __future__ import annotations

import httpx


class UserNotMapped(Exception):
    """The Slack user's email has no active BrainChain account."""


class BrainUnavailable(Exception):
    """The BrainChain API is unreachable or erroring."""


class BrainChainClient:
    def __init__(self, api_url: str, service_token: str, post=None):
        self.api_url = api_url.rstrip("/")
        self.service_token = service_token
        self._post = post or httpx.post

    def ask(self, email: str, query: str) -> dict:
        try:
            resp = self._post(
                f"{self.api_url}/api/ask/on-behalf-of",
                json={"email": email, "query": query},
                headers={"X-Service-Token": self.service_token},
                timeout=90,
            )
        except Exception as exc:  # connection-level failure → typed error
            raise BrainUnavailable(str(exc)) from exc
        if resp.status_code == 404:
            raise UserNotMapped(email)
        if resp.status_code >= 400:
            raise BrainUnavailable(f"API returned {resp.status_code}")
        return resp.json()
