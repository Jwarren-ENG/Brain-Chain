"""Regenerate all chunk embeddings with the active provider.

Run after switching embedding providers (e.g. local → Voyage):
    cd apps/api && ../../.venv/bin/python -m app.reembed
"""
from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from .db import SessionLocal
from .models import Document
from .services import embeddings as emb


def reembed_all(db: Session) -> int:
    provider = emb.get_embedding_provider()
    embed_many = getattr(provider, "embed_many", None)
    total = 0
    documents = db.query(Document).options(joinedload(Document.chunks)).all()
    for doc in documents:
        chunks = sorted(doc.chunks, key=lambda c: c.ord)
        if not chunks:
            continue
        texts = [f"{doc.title}\n{c.text}" for c in chunks]
        vectors = embed_many(texts) if embed_many else [provider.embed(t) for t in texts]
        for chunk, vec in zip(chunks, vectors, strict=True):
            chunk.embedding = vec
        total += len(chunks)
    return total


def main() -> None:
    db = SessionLocal()
    try:
        n = reembed_all(db)
        db.commit()
        print(f"Re-embedded {n} chunks with provider "
              f'"{emb.get_embedding_provider().name}".')
    finally:
        db.close()


if __name__ == "__main__":
    main()
