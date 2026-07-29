from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..security import audit
from ..security.auth import create_session, get_current_user, revoke_session, verify_password
from ..serializers import user_full

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        # No audit target/meta for failed attempts beyond the email domain —
        # avoid building a probe log of guessed addresses.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    session = create_session(db, user)
    audit.record(db, user.org_id, "auth.login", actor_user_id=user.id, commit=True)
    return {"token": session.token, "expires_at": session.expires_at.isoformat() + "Z",
            "user": user_full(user)}


@router.post("/logout")
def logout(
    authorization: str | None = Header(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if authorization:
        revoke_session(db, authorization.split(" ", 1)[1].strip())
    audit.record(db, user.org_id, "auth.logout", actor_user_id=user.id, commit=True)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_full(user)
