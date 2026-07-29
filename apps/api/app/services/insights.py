"""Executive & management intelligence builder.

Computes insights from live data (contracts, tasks, risks, spend, feedback
aggregates, connector health) rather than static strings, and assembles the
weekly executive brief with per-section evidence. Feedback content passes
through the same cohort-protected aggregation managers see — the brief never
contains an individual anonymous voice.

Permission note: insights store evidence as document IDs; the API layer
filters evidence to what the viewing user may read (no executive bypass).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from sqlalchemy.orm import Session

from ..models import (
    Connector,
    Decision,
    Document,
    ExecutiveSummary,
    Organization,
    Task,
    User,
    utcnow,
)
from .feedback import aggregate_for_managers


def compute_insights(db: Session, org: Organization, viewer: User) -> list[dict]:
    """Freshly computed insight cards. Evidence lists only doc ids; caller
    resolves them permission-aware."""
    now = utcnow()
    cards: list[dict] = []

    docs = db.query(Document).filter(Document.org_id == org.id).all()
    by_id = {d.id: d for d in docs}

    # Contract deadlines within 90 days
    for d in docs:
        end = d.meta.get("end_date")
        if d.doc_type == "contract" and end:
            try:
                from datetime import datetime

                end_dt = datetime.fromisoformat(end)
            except ValueError:
                continue
            days = (end_dt - now).days
            if 0 <= days <= 90:
                cards.append(
                    {
                        "kind": "deadline",
                        "severity": "critical" if days <= 30 else "warning",
                        "title": f"Contract “{d.title}” {'expires' if days else 'expires today'} in {days} days",
                        "body": f"Renewal decision needed. Value: {d.meta.get('value', 'n/a')}. "
                        f"Owner: {d.owner.name if d.owner else 'unassigned'}.",
                        "evidence": [d.id],
                    }
                )

    # Projects at risk: open blocked tasks + risk register entries per project
    blocked = defaultdict(list)
    for t in db.query(Task).filter(Task.org_id == org.id, Task.status == "blocked").all():
        if t.project:
            blocked[t.project].append(t)
    risk_docs = [d for d in docs if d.doc_type == "risk_register"]
    for project, tasks in blocked.items():
        evidence = [d.id for d in risk_docs if project.lower() in (d.meta.get("project", "") or d.title).lower()]
        cards.append(
            {
                "kind": "project_risk",
                "severity": "critical" if len(tasks) >= 2 else "warning",
                "title": f"{project}: {len(tasks)} blocked task(s)",
                "body": "Blocked: " + "; ".join(t.title[:80] for t in tasks[:3]),
                "evidence": evidence,
            }
        )

    # Overdue tasks
    overdue = [
        t
        for t in db.query(Task).filter(Task.org_id == org.id, Task.status.in_(["open", "in_progress"])).all()
        if t.due_date and t.due_date < now
    ]
    if overdue:
        cards.append(
            {
                "kind": "attention",
                "severity": "warning",
                "title": f"{len(overdue)} task(s) past due",
                "body": "; ".join(f"{t.title[:60]} (due {t.due_date:%b %d})" for t in overdue[:4]),
                "evidence": [],
            }
        )

    # Spend signals
    spend_docs = [d for d in docs if d.doc_type == "spend"]
    supplier_totals: dict[str, float] = defaultdict(float)
    for d in spend_docs:
        supplier_totals[d.meta.get("supplier", "Unknown")] += float(d.meta.get("amount", 0))
    if supplier_totals:
        top = sorted(supplier_totals.items(), key=lambda kv: kv[1], reverse=True)
        concentration = top[0][1] / max(sum(supplier_totals.values()), 1)
        if concentration > 0.4:
            cards.append(
                {
                    "kind": "spend_signal",
                    "severity": "warning",
                    "title": f"Spend concentration: {top[0][0]} is {concentration:.0%} of tracked spend",
                    "body": "Single-supplier dependency is a resilience risk; evaluate second sources.",
                    "evidence": [d.id for d in spend_docs if d.meta.get("supplier") == top[0][0]][:3],
                }
            )

    # Decisions pending / recently changed
    recent_decisions = (
        db.query(Decision)
        .filter(Decision.org_id == org.id, Decision.created_at >= now - timedelta(days=14))
        .all()
    )
    if recent_decisions:
        cards.append(
            {
                "kind": "change",
                "severity": "info",
                "title": f"{len(recent_decisions)} decision(s) recorded in the last two weeks",
                "body": "; ".join(d.title[:70] for d in recent_decisions[:3]),
                "evidence": [d.document_id for d in recent_decisions if d.document_id][:3],
            }
        )

    # Employee feedback themes — via the cohort-protected aggregator only.
    agg = aggregate_for_managers(db, viewer, org)
    if agg["cohort_met"]:
        for theme in agg["themes"]:
            if theme.get("suppressed"):
                continue
            cards.append(
                {
                    "kind": "feedback_theme",
                    "severity": "warning" if theme["negative_share"] >= 0.5 else "info",
                    "title": f"Employee theme: {theme['name']} ({theme['count']} responses)",
                    "body": f"{int(theme['negative_share'] * 100)}% negative sentiment. "
                    "Aggregated and anonymized; individual voices are never shown.",
                    "evidence": [],
                }
            )
    else:
        cards.append(
            {
                "kind": "feedback_theme",
                "severity": "info",
                "title": "Employee feedback below reporting threshold",
                "body": agg["message"],
                "evidence": [],
            }
        )

    # Integration health
    for c in db.query(Connector).filter(Connector.org_id == org.id).all():
        if c.health != "healthy" or c.permission_errors:
            cards.append(
                {
                    "kind": "integration",
                    "severity": "warning" if c.health != "failing" else "critical",
                    "title": f"Connector “{c.display_name}” is {c.health}",
                    "body": f"{c.permission_errors} permission error(s), "
                    f"{c.items_skipped} item(s) skipped. Data from this source may be stale.",
                    "evidence": [],
                }
            )

    # Data freshness
    stale = [
        d for d in docs
        if d.last_synced_at and d.last_synced_at < now - timedelta(days=30)
    ]
    if stale:
        cards.append(
            {
                "kind": "data_quality",
                "severity": "info",
                "title": f"{len(stale)} document(s) not refreshed in 30+ days",
                "body": "Freshness affects answer confidence; consider re-syncing sources.",
                "evidence": [d.id for d in stale[:3]],
            }
        )

    for card in cards:
        card.setdefault("confidence", "high" if card["evidence"] else "medium")
    order = {"critical": 0, "warning": 1, "info": 2}
    cards.sort(key=lambda c: order.get(c["severity"], 3))
    _ = by_id  # kept for future drill-down enrichment
    return cards


def build_weekly_brief(
    db: Session, org: Organization, viewer: User, *, agent_run_id: str | None = None
) -> ExecutiveSummary:
    now = utcnow()
    cards = compute_insights(db, org, viewer)

    def section(heading: str, kinds: set[str], empty: str) -> dict:
        matched = [c for c in cards if c["kind"] in kinds]
        if not matched:
            return {"heading": heading, "body": empty, "evidence": []}
        body = "\n".join(f"• {c['title']} — {c['body']}" for c in matched[:5])
        evidence = [{"document_id": doc_id} for c in matched for doc_id in c["evidence"]][:6]
        return {"heading": heading, "body": body, "evidence": evidence}

    summary = ExecutiveSummary(
        org_id=org.id,
        kind="weekly",
        title=f"Weekly Executive Brief — {now:%b %d, %Y}",
        period_start=now - timedelta(days=7),
        period_end=now,
        created_by_agent_run_id=agent_run_id,
        sections=[
            section("Major developments", {"change"}, "No major recorded changes this week."),
            section("Projects at risk", {"project_risk", "attention"}, "No projects flagged at risk."),
            section("Contract deadlines", {"deadline"}, "No contract deadlines in the next 90 days."),
            section("Spend signals", {"spend_signal"}, "No unusual spend patterns detected."),
            section(
                "Employee feedback themes", {"feedback_theme"},
                "No feedback themes met the anonymity threshold this week.",
            ),
            section(
                "Data & integration health", {"integration", "data_quality"},
                "All connectors healthy; data fresh.",
            ),
            {
                "heading": "Recommended actions",
                "body": "\n".join(
                    f"• {c['title']}: {c['body'][:140]}"
                    for c in cards if c["severity"] == "critical"
                ) or "• No critical items — maintain current cadence.",
                "evidence": [],
            },
        ],
    )
    db.add(summary)
    db.commit()
    return summary
