"""Ask-the-Brain orchestration: retrieve (permission-filtered) → route to an
allowed provider → persist conversation, message, citations → audit."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import Citation, Conversation, LLMMessage, Organization, User
from ..security.audit import record
from .llm_gateway import resolve_provider
from .retrieval import retrieve


def ask(
    db: Session,
    user: User,
    query: str,
    *,
    mode: str = "direct",
    conversation_id: str | None = None,
    filters: dict | None = None,
) -> tuple[Conversation, LLMMessage, LLMMessage]:
    org = db.get(Organization, user.org_id)
    filters = filters or {}

    conversation = db.get(Conversation, conversation_id) if conversation_id else None
    if conversation and conversation.user_id != user.id:
        conversation = None  # never continue someone else's conversation
    if not conversation:
        conversation = Conversation(
            org_id=user.org_id,
            user_id=user.id,
            title=query[:120],
        )
        db.add(conversation)
        db.flush()

    user_msg = LLMMessage(conversation_id=conversation.id, role="user", content=query, mode=mode)
    db.add(user_msg)

    chunks = retrieve(
        db,
        user,
        query,
        limit=8,
        doc_types=filters.get("doc_types"),
        department_ids=filters.get("department_ids"),
        data_source_ids=filters.get("data_source_ids"),
        project=filters.get("project"),
    )
    max_level = max((rc.document.classification.level for rc in chunks), default=0)
    client, provider_row, policy_notes = resolve_provider(db, user, org, max_level)
    answer = client.generate(query, mode, chunks)

    assistant_msg = LLMMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=answer.content,
        mode=mode,
        provider=answer.provider_name,
        model=answer.model,
        tokens_in=answer.tokens_in,
        tokens_out=answer.tokens_out,
        cost_estimate=answer.cost_estimate,
        latency_ms=answer.latency_ms,
        segments=[
            {"type": s.type, "text": s.text, "citations": s.citation_ords}
            for s in answer.segments
        ],
    )
    db.add(assistant_msg)
    db.flush()

    for i, rc in enumerate(answer.citations):
        db.add(
            Citation(
                message_id=assistant_msg.id,
                document_id=rc.document.id,
                chunk_id=rc.chunk.id,
                ord=i + 1,
                excerpt=rc.chunk.text[:500],
                relevance=round(rc.score, 4),
            )
        )

    record(
        db,
        user.org_id,
        "assistant.ask",
        actor_user_id=user.id,
        target_type="conversation",
        target_id=conversation.id,
        meta={
            "mode": mode,
            "provider": answer.provider_name,
            "sources": len(answer.citations),
            "max_classification_level": max_level,
            "policy_notes": policy_notes,
            "latency_ms": answer.latency_ms,
            # Query text is only logged when policy allows raw prompt logging.
            "query_preview": query[:80] if _log_prompts_allowed(org) else "[redacted by policy]",
        },
    )
    db.commit()
    return conversation, user_msg, assistant_msg


def _log_prompts_allowed(org: Organization) -> bool:
    from ..config import get_settings

    return get_settings().log_raw_prompts or org.settings.get("log_raw_prompts", False)
