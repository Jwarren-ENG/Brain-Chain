"""Local session-token authentication.

MVP uses PBKDF2 password hashing (stdlib) and opaque bearer tokens stored
server-side, so sessions can be revoked. The dependency surface (get_current_user)
is what an OIDC/SAML integration would replace — see docs/security-model.md.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import SessionToken, User, utcnow

PBKDF2_ITERATIONS = 390_000


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _scheme, _iters, salt, _digest = stored.split("$")
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


def create_session(db: Session, user: User) -> SessionToken:
    token = SessionToken(
        user_id=user.id,
        token=secrets.token_urlsafe(48),
        expires_at=utcnow() + timedelta(hours=get_settings().session_ttl_hours),
    )
    db.add(token)
    db.commit()
    return token


def revoke_session(db: Session, token: str) -> None:
    db.query(SessionToken).filter(SessionToken.token == token).delete()
    db.commit()


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    authorization: str | None = Header(default=None), db: Session = Depends(get_db)
) -> User:
    token = _bearer_token(authorization)
    session = db.query(SessionToken).filter(SessionToken.token == token).first()
    if not session or session.expires_at < utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive")
    return user


def require_roles(*roles: str):
    """Dependency factory: allow only users holding at least one of the roles."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        if not set(roles) & user.role_names():
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Requires one of roles: {', '.join(sorted(roles))}",
            )
        return user

    return dependency
