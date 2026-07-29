def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_login_wrong_password(client):
    resp = client.post(
        "/api/auth/login",
        json={"email": "avery.chen@heliosaerodyne.com", "password": "wrong"},
    )
    assert resp.status_code == 401


def test_login_unknown_user(client):
    resp = client.post(
        "/api/auth/login", json={"email": "nobody@heliosaerodyne.com", "password": "x"}
    )
    assert resp.status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    ).status_code == 401


def test_me_returns_roles(client, auth):
    body = client.get("/api/auth/me", headers=auth("morgan")).json()
    assert body["email"] == "morgan.reyes@heliosaerodyne.com"
    assert "manager" in body["roles"]
    assert body["clearance_level"] == 2
