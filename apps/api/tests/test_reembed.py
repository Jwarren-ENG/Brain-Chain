"""Reembedding regenerates every chunk vector with the active provider."""
from app.db import SessionLocal
from app.models import DocumentChunk
from app.reembed import reembed_all


class _TwoDimProvider:
    name = "test-2d"

    def embed(self, text: str):
        return [1.0, 0.0]


def test_reembed_all_rewrites_every_chunk(monkeypatch):
    from app.services import embeddings as emb

    monkeypatch.setattr(emb, "get_embedding_provider", lambda: _TwoDimProvider())
    db = SessionLocal()
    try:
        n = reembed_all(db)
        assert n > 0
        sample = db.query(DocumentChunk).first()
        assert sample.embedding == [1.0, 0.0]
    finally:
        db.rollback()
        db.close()
