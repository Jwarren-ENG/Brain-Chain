from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Conversation, LLMMessage, User
from ..security.auth import get_current_user
from ..serializers import iso, message_dict
from ..services.assistant import ask as ask_service

router = APIRouter(tags=["assistant"])

MODES = {"direct", "detailed", "executive", "action_plan", "research", "compare", "tasks", "meeting_prep"}


class AskRequest(BaseModel):
    query: str = Field(min_length=2, max_length=4000)
    mode: str = "direct"
    conversation_id: str | None = None
    filters: dict = Field(default_factory=dict)


@router.post("/ask")
def ask(body: AskRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.mode not in MODES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown mode {body.mode!r}")
    conversation, _user_msg, assistant_msg = ask_service(
        db, user, body.query, mode=body.mode,
        conversation_id=body.conversation_id, filters=body.filters,
    )
    return {
        "conversation_id": conversation.id,
        "message": message_dict(assistant_msg),
    }


@router.get("/conversations")
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(30)
        .all()
    )
    return {"items": [
        {"id": c.id, "title": c.title, "created_at": iso(c.created_at)} for c in conversations
    ]}


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    conversation = db.get(Conversation, conversation_id)
    if not conversation or conversation.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    messages = (
        db.query(LLMMessage)
        .filter(LLMMessage.conversation_id == conversation.id)
        .order_by(LLMMessage.created_at)
        .all()
    )
    return {
        "id": conversation.id,
        "title": conversation.title,
        "messages": [message_dict(m) for m in messages],
    }
