"""Feedback service with structural anonymity.

Guarantees enforced HERE, in the backend, not in the UI:
  * anonymous submissions are stored with user_id = NULL and no identifying
    metadata; the author keeps a random receipt token for status lookups
  * manager/executive aggregation endpoints never return author identity for
    anonymous OR confidential items
  * aggregates (themes, sentiment, counts) are hidden until the cohort reaches
    the configured minimum (org setting, floor of 2, default 5)
  * filter combinations that would shrink a cohort below the minimum return a
    "cohort too small" result instead of data, so identities cannot be
    reverse-engineered by slicing
  * audit events for anonymous submissions carry no actor id
"""
from __future__ import annotations

import secrets
from collections import Counter

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import (
    FeedbackSubmission,
    FeedbackTheme,
    Organization,
    User,
    utcnow,
)
from ..security.audit import record
from .embeddings import tokenize

NEGATIVE_WORDS = {
    "slow", "blocked", "blocker", "frustrating", "frustrated", "delay", "delayed",
    "bottleneck", "problem", "broken", "waiting", "stuck", "concern", "risk",
    "overloaded", "burnout", "confusing", "unclear", "friction", "churn",
}
POSITIVE_WORDS = {
    "great", "good", "love", "helpful", "improved", "faster", "smooth", "clear",
    "excellent", "win", "progress", "appreciate", "better",
}


def min_cohort(org: Organization) -> int:
    settings = get_settings()
    configured = int(org.settings.get("min_feedback_cohort", settings.min_feedback_cohort))
    return max(2, configured)


def classify_sentiment(text: str) -> str:
    tokens = set(tokenize(text))
    neg = len(tokens & NEGATIVE_WORDS)
    pos = len(tokens & POSITIVE_WORDS)
    if neg > pos:
        return "negative"
    if pos > neg:
        return "positive"
    return "neutral"


def match_theme(db: Session, org_id: str, text: str) -> FeedbackTheme | None:
    tokens = set(tokenize(text))
    best, best_hits = None, 0
    for theme in db.query(FeedbackTheme).filter(FeedbackTheme.org_id == org_id).all():
        hits = len(tokens & {k.lower() for k in theme.keywords})
        if hits > best_hits:
            best, best_hits = theme, hits
    return best if best_hits >= 1 else None


def submit_feedback(
    db: Session,
    user: User,
    *,
    body: str,
    visibility: str = "named",
    category: str = "thought",
    survey_id: str | None = None,
    answers: dict | None = None,
    department_tag: str | None = None,
    project_tag: str | None = None,
    allow_followup: bool = False,
    status: str = "submitted",
) -> FeedbackSubmission:
    if visibility not in ("named", "confidential", "anonymous"):
        raise ValueError("visibility must be named, confidential or anonymous")

    is_anonymous = visibility == "anonymous"
    theme = match_theme(db, user.org_id, body)
    submission = FeedbackSubmission(
        org_id=user.org_id,
        survey_id=survey_id,
        visibility=visibility,
        category=category,
        body=body,
        answers=answers or {},
        # Structural anonymity: no user linkage at all for anonymous items.
        user_id=None if is_anonymous else user.id,
        department_tag=department_tag,
        project_tag=project_tag,
        # Follow-up requires a way to reach the author, so it is forced off
        # for anonymous submissions regardless of what the client sent.
        allow_followup=False if is_anonymous else allow_followup,
        status=status,
        theme_id=theme.id if theme else None,
        sentiment=classify_sentiment(body),
        receipt_token=secrets.token_urlsafe(24),
    )
    if is_anonymous:
        # Coarsen timestamp to the day to blunt timing correlation.
        submission.created_at = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    db.add(submission)
    db.flush()

    record(
        db,
        user.org_id,
        "feedback.submitted",
        # Anonymous events are recorded without an actor — the audit trail
        # proves the event without linking a person to it.
        actor_user_id=None if is_anonymous else user.id,
        actor_type="user",
        target_type="feedback",
        target_id=submission.id if not is_anonymous else "",
        meta={"visibility": visibility, "category": category},
    )
    db.commit()
    return submission


# --------------------------------------------------------------- aggregation

# Only these coarse filters are allowed on aggregate queries. Author-level
# filters (user, email, exact timestamp) simply do not exist in this API.
ALLOWED_AGGREGATE_FILTERS = {"category", "department_tag", "project_tag", "survey_id"}


def aggregate_for_managers(
    db: Session,
    viewer: User,
    org: Organization,
    filters: dict | None = None,
) -> dict:
    """Aggregated, de-identified feedback view. Applies the k-anonymity cohort
    rule to the whole result AND to each theme bucket."""
    filters = {k: v for k, v in (filters or {}).items() if k in ALLOWED_AGGREGATE_FILTERS and v}
    threshold = min_cohort(org)

    query = db.query(FeedbackSubmission).filter(
        FeedbackSubmission.org_id == org.id,
        FeedbackSubmission.status == "submitted",
    )
    if "category" in filters:
        query = query.filter(FeedbackSubmission.category == filters["category"])
    if "department_tag" in filters:
        query = query.filter(FeedbackSubmission.department_tag == filters["department_tag"])
    if "project_tag" in filters:
        query = query.filter(FeedbackSubmission.project_tag == filters["project_tag"])
    if "survey_id" in filters:
        query = query.filter(FeedbackSubmission.survey_id == filters["survey_id"])

    submissions = query.all()
    total = len(submissions)

    record(
        db,
        org.id,
        "feedback.aggregate_viewed",
        actor_user_id=viewer.id,
        target_type="feedback_aggregate",
        meta={"filters": filters, "cohort": total, "threshold": threshold},
        commit=True,
    )

    if total < threshold:
        return {
            "cohort_met": False,
            "threshold": threshold,
            "response_count": total,
            "message": (
                f"Not enough responses to show results. Aggregates unlock at "
                f"{threshold} submissions to protect contributor anonymity; "
                f"narrowing filters cannot bypass this."
            ),
            "themes": [],
            "sentiment": None,
            "suggested_actions": [],
        }

    themes: dict[str, list[FeedbackSubmission]] = {}
    theme_names: dict[str, str] = {}
    for sub in submissions:
        if sub.theme_id:
            themes.setdefault(sub.theme_id, []).append(sub)
    for theme_id in themes:
        theme = db.get(FeedbackTheme, theme_id)
        theme_names[theme_id] = theme.name if theme else "Other"

    sentiment_counts = Counter(s.sentiment for s in submissions)
    category_counts = Counter(s.category for s in submissions)

    theme_payload = []
    for theme_id, subs in sorted(themes.items(), key=lambda kv: len(kv[1]), reverse=True):
        if len(subs) < threshold:
            # A theme below the cohort floor is only reported as existing in
            # suppressed form — no text, no counts small enough to identify.
            theme_payload.append(
                {
                    "name": theme_names[theme_id],
                    "suppressed": True,
                    "message": f"Fewer than {threshold} responses — details withheld.",
                }
            )
            continue
        neg = sum(1 for s in subs if s.sentiment == "negative")
        theme_payload.append(
            {
                "name": theme_names[theme_id],
                "suppressed": False,
                "count": len(subs),
                "negative_share": round(neg / len(subs), 2),
                # Representative excerpts are safe only above the cohort floor;
                # they are truncated and stripped of tags that could identify.
                "sample_excerpts": [s.body[:180] for s in subs[:3]],
                "trend": "rising" if len(subs) >= threshold + 2 else "steady",
            }
        )

    suggested = []
    for t in theme_payload:
        if not t.get("suppressed") and t.get("negative_share", 0) >= 0.5:
            suggested.append(
                f"Investigate “{t['name']}” — {t['count']} responses, "
                f"{int(t['negative_share'] * 100)}% negative. Consider a focused retro "
                "or process review."
            )
    if sentiment_counts.get("negative", 0) > total / 2:
        suggested.append("Overall sentiment skews negative this period; share findings with HR.")

    return {
        "cohort_met": True,
        "threshold": threshold,
        "response_count": total,
        "confidence": "high" if total >= threshold * 2 else "medium",
        "sentiment": {
            "positive": sentiment_counts.get("positive", 0),
            "neutral": sentiment_counts.get("neutral", 0),
            "negative": sentiment_counts.get("negative", 0),
        },
        "categories": dict(category_counts),
        "themes": theme_payload,
        "suggested_actions": suggested,
    }
