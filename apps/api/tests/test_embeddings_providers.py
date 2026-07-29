"""Embedding provider selection and the Voyage adapter."""
import pytest

from app.services import embeddings as emb


class _Resp:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


def _fake_post(calls, vectors):
    def post(url, json=None, headers=None, timeout=None):
        calls.append({"url": url, "json": json, "headers": headers})
        data = [{"index": i, "embedding": v} for i, v in enumerate(vectors[: len(json["input"])])]
        # return out of order to prove we re-sort by index
        return _Resp({"data": list(reversed(data))})

    return post


def test_voyage_embed_many_batches_and_orders():
    calls = []
    provider = emb.VoyageEmbeddings("key", "voyage-3.5",
                                    post=_fake_post(calls, [[1.0, 0.0], [0.0, 1.0]]))
    out = provider.embed_many(["alpha", "beta"])
    assert out == [[1.0, 0.0], [0.0, 1.0]]
    assert calls[0]["json"]["model"] == "voyage-3.5"
    assert calls[0]["headers"]["Authorization"] == "Bearer key"


def test_voyage_embed_single_delegates():
    provider = emb.VoyageEmbeddings("key", "voyage-3.5",
                                    post=_fake_post([], [[0.5, 0.5]]))
    assert provider.embed("x") == [0.5, 0.5]


def test_get_embedding_provider_defaults_to_local(monkeypatch):
    emb.reset_embedding_provider()
    monkeypatch.setenv("BRAINCHAIN_EMBEDDINGS_PROVIDER", "local")
    from app.config import get_settings
    get_settings.cache_clear()
    assert isinstance(emb.get_embedding_provider(), emb.LocalHashedEmbeddings)


def test_get_embedding_provider_selects_voyage(monkeypatch):
    emb.reset_embedding_provider()
    monkeypatch.setenv("BRAINCHAIN_EMBEDDINGS_PROVIDER", "voyage")
    monkeypatch.setenv("BRAINCHAIN_VOYAGE_API_KEY", "k")
    monkeypatch.setenv("BRAINCHAIN_ALLOW_EXTERNAL_MODEL_CALLS", "true")
    from app.config import get_settings
    get_settings.cache_clear()
    assert isinstance(emb.get_embedding_provider(), emb.VoyageEmbeddings)
    # cleanup so other tests keep the local provider
    monkeypatch.delenv("BRAINCHAIN_EMBEDDINGS_PROVIDER")
    monkeypatch.delenv("BRAINCHAIN_VOYAGE_API_KEY")
    monkeypatch.delenv("BRAINCHAIN_ALLOW_EXTERNAL_MODEL_CALLS")
    get_settings.cache_clear()
    emb.reset_embedding_provider()


def test_get_embedding_provider_respects_external_model_governance_gate(monkeypatch):
    """Government deployments force external_models_allowed False even with
    voyage selected and an API key configured — embeddings must fall back to
    the local hashed provider, matching the answer/extraction gate behavior."""
    emb.reset_embedding_provider()
    monkeypatch.setenv("BRAINCHAIN_EMBEDDINGS_PROVIDER", "voyage")
    monkeypatch.setenv("BRAINCHAIN_VOYAGE_API_KEY", "k")
    monkeypatch.setenv("BRAINCHAIN_DEPLOYMENT_PROFILE", "government")
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        assert isinstance(emb.get_embedding_provider(), emb.LocalHashedEmbeddings)
    finally:
        monkeypatch.delenv("BRAINCHAIN_EMBEDDINGS_PROVIDER")
        monkeypatch.delenv("BRAINCHAIN_VOYAGE_API_KEY")
        monkeypatch.delenv("BRAINCHAIN_DEPLOYMENT_PROFILE")
        get_settings.cache_clear()
        emb.reset_embedding_provider()


def test_voyage_without_key_falls_back_to_local(monkeypatch):
    emb.reset_embedding_provider()
    monkeypatch.setenv("BRAINCHAIN_EMBEDDINGS_PROVIDER", "voyage")
    from app.config import get_settings
    get_settings.cache_clear()
    assert isinstance(emb.get_embedding_provider(), emb.LocalHashedEmbeddings)
    monkeypatch.delenv("BRAINCHAIN_EMBEDDINGS_PROVIDER")
    get_settings.cache_clear()
    emb.reset_embedding_provider()
