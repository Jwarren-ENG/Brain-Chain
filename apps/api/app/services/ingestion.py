"""Document ingestion: chunking, embedding, versioning, ACL propagation.

Used by both the seed script and mock connector sync jobs, so ingested data
always follows the same path a live connector would.
"""
from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import (
    AccessControlEntry,
    Document,
    DocumentChunk,
    DocumentVersion,
    utcnow,
)
from .embeddings import get_embedding_provider

CHUNK_TARGET_CHARS = 700


def chunk_text(text: str) -> list[str]:
    """Paragraph-preserving chunker with a soft size target."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        if buf and len(buf) + len(para) > CHUNK_TARGET_CHARS:
            chunks.append(buf.strip())
            buf = para
        else:
            buf = f"{buf}\n\n{para}" if buf else para
    if buf.strip():
        chunks.append(buf.strip())
    return chunks or ([text.strip()] if text.strip() else [])


def ingest_document(
    db: Session,
    *,
    org_id: str,
    title: str,
    content: str,
    doc_type: str,
    classification_id: str,
    data_source_id: str | None = None,
    source_item_id: str | None = None,
    department_id: str | None = None,
    owner_user_id: str | None = None,
    retention_policy_id: str | None = None,
    summary: str = "",
    meta: dict | None = None,
    chunk_meta: list[dict] | None = None,
    acl: list[tuple[str, str]] | None = None,  # (principal_type, principal_id)
    source_created_at: datetime | None = None,
    confidence: float = 0.9,
) -> Document:
    doc = Document(
        org_id=org_id,
        title=title,
        doc_type=doc_type,
        summary=summary or (content[:280].strip() + ("…" if len(content) > 280 else "")),
        classification_id=classification_id,
        data_source_id=data_source_id,
        source_item_id=source_item_id,
        department_id=department_id,
        owner_user_id=owner_user_id,
        retention_policy_id=retention_policy_id,
        meta=meta or {},
        source_created_at=source_created_at,
        source_updated_at=source_created_at,
        last_synced_at=utcnow(),
        confidence=confidence,
    )
    db.add(doc)
    db.flush()

    db.add(DocumentVersion(document_id=doc.id, version=1, content=content, note="Initial ingest"))

    provider = get_embedding_provider()
    metas = chunk_meta or []
    for i, text in enumerate(chunk_text(content)):
        db.add(
            DocumentChunk(
                document_id=doc.id,
                ord=i,
                text=text,
                embedding=provider.embed(f"{title}\n{text}"),
                meta=metas[i] if i < len(metas) else {},
            )
        )

    for principal_type, principal_id in acl or []:
        db.add(
            AccessControlEntry(
                org_id=org_id,
                document_id=doc.id,
                principal_type=principal_type,
                principal_id=principal_id,
            )
        )
    db.flush()
    return doc


def add_document_version(db: Session, doc: Document, content: str, note: str) -> None:
    doc.current_version += 1
    doc.source_updated_at = utcnow()
    db.add(
        DocumentVersion(
            document_id=doc.id, version=doc.current_version, content=content, note=note
        )
    )
    # Re-chunk and re-embed so stale chunks never linger after an update.
    for chunk in list(doc.chunks):
        db.delete(chunk)
    db.flush()
    provider = get_embedding_provider()
    for i, text in enumerate(chunk_text(content)):
        db.add(
            DocumentChunk(
                document_id=doc.id,
                ord=i,
                text=text,
                embedding=provider.embed(f"{doc.title}\n{text}"),
            )
        )
    db.flush()
