"""Permission-aware hybrid retrieval.

Order of operations is the security contract:
  1. Resolve the user's accessible document set (clearance + ACL grants).
  2. Apply caller filters (source, department, classification, type, dates).
  3. Only then score chunks (cosine + keyword overlap) and rank.

Unauthorized text is therefore never scored, never returned, and never enters
an LLM prompt. With Postgres+pgvector step 3 becomes an indexed ANN query with
the same pre-filter (docs/architecture.md).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session, joinedload

from ..models import Document, DocumentChunk, User
from ..security.permissions import accessible_document_ids
from .embeddings import cosine, get_embedding_provider, tokenize


@dataclass
class RetrievedChunk:
    chunk: DocumentChunk
    document: Document
    score: float
    keyword_hits: list[str] = field(default_factory=list)


def retrieve(
    db: Session,
    user: User,
    query: str,
    *,
    limit: int = 8,
    doc_types: list[str] | None = None,
    department_ids: list[str] | None = None,
    data_source_ids: list[str] | None = None,
    classification_levels: list[int] | None = None,
    project: str | None = None,
    min_score: float = 0.06,
) -> list[RetrievedChunk]:
    allowed_ids = accessible_document_ids(db, user)
    if not allowed_ids:
        return []

    docs_query = (
        db.query(Document)
        .options(joinedload(Document.chunks))
        .filter(Document.id.in_(allowed_ids))
    )
    if doc_types:
        docs_query = docs_query.filter(Document.doc_type.in_(doc_types))
    if department_ids:
        docs_query = docs_query.filter(Document.department_id.in_(department_ids))
    if data_source_ids:
        docs_query = docs_query.filter(Document.data_source_id.in_(data_source_ids))
    documents = docs_query.all()

    if classification_levels is not None:
        documents = [d for d in documents if d.classification.level in classification_levels]
    if project:
        documents = [
            d
            for d in documents
            if project.lower() in (d.meta.get("project", "") or "").lower()
            or project.lower() in d.title.lower()
        ]

    provider = get_embedding_provider()
    query_vec = provider.embed(query)
    query_tokens = set(tokenize(query))

    scored: list[RetrievedChunk] = []
    for doc in documents:
        for chunk in doc.chunks:
            sim = cosine(query_vec, chunk.embedding)
            chunk_tokens = set(tokenize(chunk.text)) | set(tokenize(doc.title))
            hits = sorted(query_tokens & chunk_tokens)
            keyword_score = len(hits) / max(len(query_tokens), 1)
            score = 0.55 * sim + 0.45 * keyword_score
            if score >= min_score:
                scored.append(RetrievedChunk(chunk=chunk, document=doc, score=score, keyword_hits=hits))

    scored.sort(key=lambda r: r.score, reverse=True)

    # Diversify: cap chunks per document so one long doc can't crowd out others.
    per_doc: dict[str, int] = {}
    result: list[RetrievedChunk] = []
    for item in scored:
        count = per_doc.get(item.document.id, 0)
        if count >= 3:
            continue
        per_doc[item.document.id] = count + 1
        result.append(item)
        if len(result) >= limit:
            break
    return result
