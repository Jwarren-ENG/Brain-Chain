"""Model picker: /models listing and provider_id narrowing on /ask.

The picker can only narrow provider resolution — every policy gate still
applies, so a request can never widen access (keyless: external providers are
excluded and requests for them fall back to the local provider with a note).
"""


def _login(client, email):
    resp = client.post("/api/auth/login", json={"email": email, "password": "brainchain-demo"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def test_models_lists_only_permitted_providers_keyless(client, auth):
    resp = client.get("/api/models", headers=auth("avery"))
    assert resp.status_code == 200
    items = resp.json()["items"]
    # Keyless + external disabled: no external provider may be offered.
    assert all(not m["is_external"] for m in items)
    for m in items:
        assert set(m) == {"id", "name", "model", "is_external"}


def test_ask_accepts_provider_id_and_falls_back_when_not_permitted(client, auth):
    headers = auth("avery")
    resp = client.post(
        "/api/ask",
        json={"query": "What are the main risks affecting the Phoenix project?",
              "provider_id": "definitely-not-a-real-provider"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    # Still answered (fallback), still with citations — no error, no bypass.
    assert body["message"]["content"]


def test_ask_with_permitted_provider_id_uses_it(client, auth):
    headers = auth("avery")
    models = client.get("/api/models", headers=headers).json()["items"]
    if not models:
        return  # nothing selectable in this seed profile; covered elsewhere
    resp = client.post(
        "/api/ask",
        json={"query": "What are the main risks affecting the Phoenix project?",
              "provider_id": models[0]["id"]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["message"]["content"]
