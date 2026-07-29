"""Embedding provider abstraction.

The local provider is deterministic (feature-hashed bag of words + character
trigrams) so the MVP needs no network access and produces stable, testable
similarity scores. Swap in a real provider by implementing EmbeddingProvider
and changing get_embedding_provider(); with Postgres the vectors live in a
pgvector column instead of JSON (docs/architecture.md#vector-storage).
"""
from __future__ import annotations

import hashlib
import math
import re
from typing import Protocol

DIMS = 256
_TOKEN_RE = re.compile(r"[a-z0-9]+")

_STOPWORDS = frozenset(
    "the a an and or of to in for on with is are was were be been this that it as at by "
    "from we our you your their they i he she has have had will would can could should "
    "not no do does did but if then than so such about into over under out up down".split()
)


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS and len(t) > 1]


class EmbeddingProvider(Protocol):
    name: str

    def embed(self, text: str) -> list[float]: ...


class LocalHashedEmbeddings:
    """Feature hashing over unigrams, bigrams and word stems."""

    name = "local-hashed-256"

    def embed(self, text: str) -> list[float]:
        vec = [0.0] * DIMS
        tokens = tokenize(text)
        features: list[str] = []
        for tok in tokens:
            features.append(tok)
            features.append(f"stem:{tok[:5]}")
        features.extend(f"{a}_{b}" for a, b in zip(tokens, tokens[1:], strict=False))
        for feat in features:
            digest = hashlib.blake2b(feat.encode(), digest_size=8).digest()
            idx = int.from_bytes(digest[:4], "big") % DIMS
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [round(v / norm, 6) for v in vec]
        return vec


class VoyageEmbeddings:
    """Voyage AI embeddings over HTTPS. `post` is injectable for tests."""

    def __init__(self, api_key: str, model: str, post=None):
        import httpx

        self.api_key = api_key
        self.model = model
        self.name = f"voyage ({model})"
        self._post = post or httpx.post

    def embed(self, text: str) -> list[float]:
        return self.embed_many([text])[0]

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 128):  # Voyage batch limit headroom
            batch = texts[i : i + 128]
            resp = self._post(
                "https://api.voyageai.com/v1/embeddings",
                json={"input": batch, "model": self.model},
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30,
            )
            resp.raise_for_status()
            rows = sorted(resp.json()["data"], key=lambda d: d["index"])
            out.extend(d["embedding"] for d in rows)
        return out


_provider: EmbeddingProvider | None = None


def get_embedding_provider() -> EmbeddingProvider:
    """Settings-driven singleton. Local hashed provider is the keyless default;
    switching providers requires re-embedding (python -m app.reembed)."""
    global _provider
    if _provider is None:
        from ..config import get_settings

        settings = get_settings()
        if (
            settings.embeddings_provider == "voyage"
            and settings.voyage_api_key
            and settings.external_models_allowed
        ):
            _provider = VoyageEmbeddings(settings.voyage_api_key, settings.voyage_model)
        else:
            _provider = LocalHashedEmbeddings()
    return _provider


def reset_embedding_provider() -> None:
    """Test helper: force re-selection on next call."""
    global _provider
    _provider = None


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True))  # vectors are pre-normalized
