"""Test fixtures. A dedicated SQLite database is seeded once per test session
with the full demo dataset, so tests exercise the same data the demo uses."""
import os
import tempfile

os.environ["BRAINCHAIN_DATABASE_URL"] = (
    "sqlite:///" + os.path.join(tempfile.gettempdir(), "brainchain-test.db")
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402

PASSWORD = "brainchain-demo"


@pytest.fixture(scope="session", autouse=True)
def seeded_database():
    seed()
    yield


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def tokens(client):
    def login(email: str) -> str:
        resp = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert resp.status_code == 200, resp.text
        return resp.json()["token"]

    return {
        "avery": login("avery.chen@heliosaerodyne.com"),
        "morgan": login("morgan.reyes@heliosaerodyne.com"),
        "jordan": login("jordan.blake@heliosaerodyne.com"),
        "sam": login("sam.okafor@heliosaerodyne.com"),
        "riley": login("riley.novak@heliosaerodyne.com"),
        "taylor": login("taylor.brooks@heliosaerodyne.com"),
        "dana": login("dana.wolfe@heliosaerodyne.com"),
        "leo": login("leo.martins@heliosaerodyne.com"),
        "priya": login("priya.raman@heliosaerodyne.com"),
        "noah": login("noah.fields@heliosaerodyne.com"),
    }


@pytest.fixture(scope="session")
def auth(tokens):
    def headers(who: str) -> dict:
        return {"Authorization": f"Bearer {tokens[who]}"}

    return headers
