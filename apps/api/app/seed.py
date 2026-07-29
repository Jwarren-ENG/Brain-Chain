"""Seed data: Helios Aerodyne, a fictional aerospace & defense technology
company. Everything here is invented for the demo.

Run:  python -m app.seed        (from apps/api, drops and recreates all tables)

The dataset is engineered to demonstrate every acceptance workflow:
  * Workflow 1/6 — Phoenix risk question answered differently per user; a
    restricted legal document exists that NOBODY in the demo cast can read
    except Legal + the security admin.
  * Workflow 2 — the Zoom connector holds a pending transcript; pressing
    "Sync now" ingests it and extracts decisions/tasks/risks/questions.
  * Workflow 3 — "Procurement bottlenecks" theme sits at 4 anonymous
    submissions (below the cohort of 5); one more submission unlocks it.
    "Meeting overload" is already above threshold.
  * Workflow 4 — a Planning Agent run awaits approval of external actions.
  * Workflow 5 — a weekly executive brief exists and can be regenerated.
  * Conflict demo — two sources disagree on the Phoenix FRR date.
"""
from __future__ import annotations

from datetime import timedelta

from .db import Base, SessionLocal, engine
from .models import (
    Agent,
    Connector,
    DataSource,
    Decision,
    Department,
    Entity,
    EntityRelationship,
    EvaluationRun,
    FeedbackTheme,
    Group,
    Meeting,
    ModelPolicy,
    ModelProvider,
    Organization,
    RetentionPolicy,
    Role,
    SecurityClassification,
    Survey,
    SurveyQuestion,
    Task,
    User,
    UserGroup,
    UserRole,
    Workspace,
    utcnow,
)
from .security.auth import hash_password
from .services.connectors import extract_from_transcript
from .services.feedback import submit_feedback
from .services.ingestion import ingest_document

DEMO_PASSWORD = "brainchain-demo"


def _tag_fact(db, document, needle: str, fact_key: str) -> None:
    """Attach a fact_key to whichever chunk actually contains the fact text,
    so conflict detection is robust to chunk boundaries."""
    for chunk in document.chunks:
        if needle in chunk.text:
            chunk.meta = {**chunk.meta, "fact_key": fact_key, "fact_value": needle}
    db.flush()


def seed() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    now = utcnow()

    # ---------------------------------------------------------------- org
    org = Organization(
        name="Helios Aerodyne",
        slug="helios",
        deployment_profile="commercial",
        settings={
            "min_feedback_cohort": 5,
            "external_models_enabled": False,
            "force_dry_run": True,
            "log_raw_prompts": False,
        },
    )
    db.add(org)
    db.flush()
    db.add(Workspace(org_id=org.id, name="Helios HQ", description="Primary workspace"))

    # ---------------------------------------------------------- departments
    dept_names = [
        "Engineering", "Supply Chain", "Manufacturing", "Finance", "Legal",
        "Information Security", "Program Management", "Human Resources",
        "Executive Office",
    ]
    departments: dict[str, Department] = {}
    for name in dept_names:
        d = Department(org_id=org.id, name=name, slug=name.lower().replace(" ", "-"))
        db.add(d)
        departments[name] = d
    db.flush()

    # ---------------------------------------------------------------- roles
    role_defs = {
        "employee": "Ask the assistant, view authorized info, submit ideas and surveys.",
        "manager": "Team-level projects, aggregated feedback, agent recommendations.",
        "executive": "Org-level intelligence, risks, trends, strategic summaries.",
        "data_steward": "Data sources, classifications, retention, quality, lineage.",
        "security_admin": "Auth, roles, model policies, audit, deployment mode, DLP.",
        "system_admin": "Integrations, users, departments, workspaces, configuration.",
        "agent_approver": "Reviews and approves agent actions before external effects.",
    }
    roles: dict[str, Role] = {}
    for name, desc in role_defs.items():
        r = Role(name=name, description=desc)
        db.add(r)
        roles[name] = r
    db.flush()

    # -------------------------------------------------------------- users
    def make_user(email, name, title, dept, clearance, role_names):
        u = User(
            org_id=org.id,
            email=email,
            name=name,
            title=title,
            department_id=departments[dept].id if dept else None,
            clearance_level=clearance,
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(u)
        db.flush()
        for rn in role_names:
            db.add(UserRole(user_id=u.id, role_id=roles[rn].id))
        return u

    avery = make_user("avery.chen@heliosaerodyne.com", "Avery Chen",
                      "Avionics Engineer", "Engineering", 1, ["employee"])
    morgan = make_user("morgan.reyes@heliosaerodyne.com", "Morgan Reyes",
                       "Program Manager, Phoenix", "Program Management", 2,
                       ["employee", "manager"])
    jordan = make_user("jordan.blake@heliosaerodyne.com", "Jordan Blake",
                       "Chief Operating Officer", "Executive Office", 2,
                       ["employee", "executive"])
    sam = make_user("sam.okafor@heliosaerodyne.com", "Sam Okafor",
                    "Data Steward", "Information Security", 2,
                    ["employee", "data_steward"])
    riley = make_user("riley.novak@heliosaerodyne.com", "Riley Novak",
                      "Security Administrator", "Information Security", 3,
                      ["employee", "security_admin"])
    casey = make_user("casey.kim@heliosaerodyne.com", "Casey Kim",
                      "IT Systems Administrator", "Information Security", 2,
                      ["employee", "system_admin"])
    taylor = make_user("taylor.brooks@heliosaerodyne.com", "Taylor Brooks",
                       "Deputy PM & Agent Approver", "Program Management", 2,
                       ["employee", "manager", "agent_approver"])
    dana = make_user("dana.wolfe@heliosaerodyne.com", "Dana Wolfe",
                     "Procurement Lead", "Supply Chain", 1, ["employee"])
    leo = make_user("leo.martins@heliosaerodyne.com", "Leo Martins",
                    "Manufacturing Engineer", "Manufacturing", 1, ["employee"])
    priya = make_user("priya.raman@heliosaerodyne.com", "Priya Raman",
                      "Thermal Engineer", "Engineering", 1, ["employee"])
    noah = make_user("noah.fields@heliosaerodyne.com", "Noah Fields",
                     "Supply Chain Analyst", "Supply Chain", 1, ["employee"])
    elena = make_user("elena.vasquez@heliosaerodyne.com", "Elena Vasquez",
                      "Financial Analyst", "Finance", 1, ["employee"])
    lena = make_user("lena.hart@heliosaerodyne.com", "Lena Hart",
                     "General Counsel", "Legal", 3, ["employee", "manager"])

    legal_group = Group(org_id=org.id, name="Legal Privileged")
    db.add(legal_group)
    db.flush()
    db.add(UserGroup(user_id=lena.id, group_id=legal_group.id))

    # ----------------------------------------------------- classifications
    cls_defs = [
        ("Public", 0, "Approved for public release.", "green"),
        ("Internal", 1, "All employees; not for external distribution.", "blue"),
        ("Confidential", 2, "Need-to-know; business sensitive.", "amber"),
        ("Restricted", 3, "Named individuals only; legal/competition sensitive.", "red"),
    ]
    cls: dict[str, SecurityClassification] = {}
    for name, level, desc, color in cls_defs:
        c = SecurityClassification(org_id=org.id, name=name, level=level,
                                   description=desc, color=color)
        db.add(c)
        cls[name] = c
    db.flush()

    # ---------------------------------------------------------- retention
    ret_defs = [
        ("Standard — 7 years", 2555, "Default business records retention."),
        ("Contracts — 10 years post-expiry", 3650, "Contractual & compliance records."),
        ("Chat — 18 months", 548, "Ephemeral team communications."),
        ("Feedback — 24 months", 730, "Employee feedback, aggregated thereafter."),
    ]
    retention: dict[str, RetentionPolicy] = {}
    for name, days, desc in ret_defs:
        r = RetentionPolicy(org_id=org.id, name=name, duration_days=days, description=desc)
        db.add(r)
        retention[name] = r
    db.flush()

    # -------------------------------------------------- sources + connectors
    def make_source(name, kind, owner, dept, classification, ret):
        s = DataSource(
            org_id=org.id, name=name, kind=kind, owner_user_id=owner.id,
            department_id=departments[dept].id, classification_id=cls[classification].id,
            retention_policy_id=retention[ret].id,
            description=f"{name} ({kind}) managed by {owner.name}.",
        )
        db.add(s)
        db.flush()
        return s

    src_jira = make_source("Jira — Programs", "jira", sam, "Program Management",
                           "Internal", "Standard — 7 years")
    src_zoom = make_source("Zoom — Program Reviews", "zoom", sam, "Program Management",
                           "Internal", "Standard — 7 years")
    src_slack = make_source("Slack — Engineering & Programs", "slack", sam, "Engineering",
                            "Internal", "Chat — 18 months")
    src_contracts = make_source("Contract Repository", "contracts", lena, "Legal",
                                "Confidential", "Contracts — 10 years post-expiry")
    src_procurement = make_source("Procurement & Spend", "procurement", dana, "Supply Chain",
                                  "Internal", "Standard — 7 years")
    src_gdrive = make_source("Google Drive — Business Docs", "gdrive", sam, "Finance",
                             "Confidential", "Standard — 7 years")
    src_wiki = make_source("Engineering Wiki", "wiki", sam, "Engineering",
                           "Internal", "Standard — 7 years")
    src_sharepoint = make_source("SharePoint — Policies", "sharepoint", casey,
                                 "Information Security", "Internal", "Standard — 7 years")
    src_teams = make_source("Microsoft Teams — Manufacturing", "teams", sam,
                            "Manufacturing", "Internal", "Chat — 18 months")
    src_email = make_source("Email — Program Distribution Lists", "email", casey,
                            "Program Management", "Internal", "Chat — 18 months")

    def make_connector(source, provider, display, freq, health="healthy",
                       status="connected", synced=0, skipped=0, perm_errors=0,
                       pending=None, last_sync_days=0.2):
        c = Connector(
            org_id=org.id, data_source_id=source.id, provider=provider,
            display_name=display, sync_frequency=freq, health=health, status=status,
            items_synced=synced, items_skipped=skipped, permission_errors=perm_errors,
            last_sync_at=now - timedelta(days=last_sync_days),
            config={"pending_items": pending or []},
        )
        db.add(c)
        db.flush()
        return c

    # Zoom pending transcript — Workflow 2 fuel. Ingested when a steward syncs.
    pending_transcript = {
        "external_id": "zoom-rec-8841",
        "kind": "transcript",
        "title": "Phoenix Risk Deep-Dive — July 16, 2026",
        "doc_type": "transcript",
        "created_at": (now - timedelta(days=2)).isoformat(),
        "meta": {"project": "Phoenix"},
        "acl": [["org", "*"]],
        "content": """Morgan Reyes: Thanks everyone. Purpose today is a deep-dive on Phoenix risk posture before the flight readiness review.
Priya Raman: The thermal vacuum chamber remains our biggest schedule risk. The vendor slot slipped again, which is a two-week delay if we keep the current test plan.
Avery Chen: On avionics, the CAN bus fault under vibration is reproducible now. I think it's the connector seating, not firmware. That removes the software blocker risk if confirmed.
Morgan Reyes: Good. We've decided to split the qualification campaign so thermal and vibration run in parallel starting August 4.
Dana Wolfe: Procurement flag: VoltCore quoted a 9-week lead time on the flight battery cells. That's a shortage risk for the October build.
Morgan Reyes: Understood. Action: Dana will send the revised PO terms to VoltCore by Friday.
Priya Raman: I will draft the parallel qualification test plan by next week.
Taylor Brooks: Do we have a fallback cell supplier qualified?
Dana Wolfe: Not yet — qualification of a second source would take about twelve weeks.
Morgan Reyes: Let's lock in the decision to start second-source qualification with Ionex Cells now rather than wait.
Avery Chen: Will the FRR date move again?
Morgan Reyes: We are holding October 2 for the flight readiness review unless the parallel campaign slips.
Taylor Brooks: I will schedule the FRR dry run for the last week of September.
Morgan Reyes: Thanks all. Risks recap: chamber availability, battery cell lead time, connector seating verification.""",
    }
    pending_denied = {
        "external_id": "zoom-rec-8850",
        "kind": "transcript",
        "title": "Executive Compensation Committee — recording",
        "permission_error": True,
    }

    make_connector(src_zoom, "zoom", "Zoom Meetings", "daily",
                              synced=14, pending=[pending_transcript, pending_denied],
                              last_sync_days=2.1)
    make_connector(src_slack, "slack", "Slack", "15 minutes", synced=1240, skipped=8)
    make_connector(src_jira, "jira", "Jira Cloud", "hourly", synced=326)
    make_connector(src_contracts, "sharepoint", "Contract Repository (SharePoint)",
                   "daily", synced=48)
    make_connector(src_procurement, "custom", "ERP Spend Feed", "nightly", synced=92)
    make_connector(src_gdrive, "gdrive", "Google Drive", "hourly", health="degraded",
                   synced=210, skipped=12, perm_errors=3, last_sync_days=1.4)
    make_connector(src_wiki, "wiki", "Engineering Wiki", "6 hours", synced=57)
    make_connector(src_sharepoint, "sharepoint", "SharePoint Policies", "daily",
                   status="paused", health="degraded", synced=31, last_sync_days=9)
    make_connector(src_teams, "teams", "Microsoft Teams", "15 minutes", synced=430, skipped=2)
    make_connector(src_email, "email", "Email Ingest (M365)", "hourly", synced=118, skipped=5)

    # ------------------------------------------------------------ documents
    ORG = [("org", "*")]
    PM = [("department", departments["Program Management"].id)]
    SC = [("department", departments["Supply Chain"].id)]
    FIN = [("department", departments["Finance"].id)]
    EXEC = [("role", "executive")]
    LEGAL = [("group", legal_group.id), ("role", "security_admin")]

    def doc(title, content, doc_type, classification, source, dept, owner, acl,
            meta=None, days_ago=5.0, chunk_meta=None, retention_name="Standard — 7 years"):
        return ingest_document(
            db, org_id=org.id, title=title, content=content, doc_type=doc_type,
            classification_id=cls[classification].id, data_source_id=source.id,
            department_id=departments[dept].id, owner_user_id=owner.id,
            retention_policy_id=retention[retention_name].id,
            meta=meta or {}, acl=acl, chunk_meta=chunk_meta,
            source_created_at=now - timedelta(days=days_ago),
        )

    # --- Phoenix engineering material (internal, broad) ---
    d_riskreg = doc(
        "Phoenix Program Risk Register — Q3 FY26",
        """Risk PHX-R1 (High): Thermal vacuum chamber availability. The external test vendor rescheduled Helios twice; current slot begins August 11. A further slip delays environmental qualification by two weeks and threatens the flight readiness review.

Risk PHX-R2 (High): Flight battery cell lead time. VoltCore Batteries quoted 9-week lead times on qualified cells, against a 6-week plan assumption. Shortage would delay the October integrated build.

Risk PHX-R3 (Medium): Avionics CAN bus intermittent fault under vibration. Reproduced in lab; suspected connector seating. If firmware-related, adds 3 weeks of regression testing.

Risk PHX-R4 (Medium): Staffing — two senior harness technicians supporting both Phoenix and Skylark; concurrent integration phases create a resource conflict in September.

Risk PHX-R5 (Low): Composite panel delivery from Nimbus slipped 10 days in June; recovered, but supplier on-time rate is trending down (86% vs 95% target).""",
        "risk_register", "Internal", src_wiki, "Engineering", morgan,
        ORG, meta={"project": "Phoenix"}, days_ago=6,
    )

    d_plan = doc(
        "Phoenix Project Plan v3 — Integration & Qualification",
        """Phoenix is Helios Aerodyne's satellite communications payload program. Plan v3 baselines the integration and qualification phase.

Milestones: parallel thermal/vibration qualification campaign starts August 4; integrated flight build begins October 6; flight readiness review (FRR) is scheduled for September 12, 2026 per this plan revision.

Dependencies: VoltCore flight cells (Supply Chain), thermal chamber slot (external vendor), avionics firmware v2.3 (Engineering), harness technician availability shared with Skylark.

Exit criteria: all qualification tests passed, open risks at Medium or below, spares kit complete, FRR board approval.""",
        "plan", "Internal", src_wiki, "Engineering", morgan,
        ORG, meta={"project": "Phoenix"}, days_ago=12,
    )
    _tag_fact(db, d_plan, "September 12, 2026", "phoenix_frr_date")

    d_frr_note = doc(
        "Phoenix FRR Planning Note — July 16 review outcome",
        """Following the July 16 risk deep-dive, the program is holding October 2, 2026 as the flight readiness review date, reflecting the parallel qualification campaign decision. The earlier plan-of-record date has not yet been updated in Project Plan v3.""",
        "note", "Internal", src_wiki, "Program Management", taylor,
        ORG, meta={"project": "Phoenix"}, days_ago=1,
    )
    _tag_fact(db, d_frr_note, "October 2, 2026", "phoenix_frr_date")

    # --- Jira-like tickets ---
    ticket_data = [
        ("PHX-482", "Thermal vacuum test rescheduled — chamber availability",
         "Vendor moved our chamber slot from July 28 to August 11. Second reschedule this quarter. "
         "Blocked on vendor confirmation; schedule risk to qualification campaign.", "blocked",
         priya, "Phoenix", 2),
        ("PHX-501", "Avionics CAN bus intermittent fault under vibration",
         "Fault reproduces at 40–60 Hz. Suspect J14 connector seating rather than firmware v2.3. "
         "Blocked pending shaker table time to verify fix.", "blocked", avery, "Phoenix", 4),
        ("PHX-465", "Composite panel delivery delayed by Nimbus",
         "Nimbus Composites slipped panel set #3 by 10 days. Recovery plan in place; tracking "
         "supplier on-time metric. Risk if slip repeats on set #4.", "in_progress", dana,
         "Phoenix", 9),
        ("PHX-510", "Update FRR readiness checklist for parallel campaign",
         "Checklist must reflect the parallel thermal/vibration qualification decision from the "
         "July 16 review.", "open", taylor, "Phoenix", 1),
        ("SKY-201", "Skylark ground station antenna pattern verification",
         "Range time booked for August. No blockers.", "open", avery, "Skylark", 3),
    ]
    for ref, title, body, status_, assignee, project, days_ago in ticket_data:
        doc(f"{ref} — {title}", body + f"\n\nStatus: {status_}. Assignee: {assignee.name}.",
            "ticket", "Internal", src_jira, "Engineering", assignee, ORG,
            meta={"project": project, "external_ref": ref}, days_ago=days_ago)
        db.add(Task(
            org_id=org.id, title=title, description=body, status=status_,
            priority="high" if status_ == "blocked" else "medium",
            assignee_user_id=assignee.id, project=project, source="jira",
            external_ref=ref,
            due_date=now + timedelta(days=10 - days_ago) if status_ != "done" else None,
        ))

    db.add(Task(org_id=org.id, title="Submit Q3 supplier scorecards",
                description="Quarterly scorecards for VoltCore, Nimbus, Orbital Metals.",
                status="open", priority="medium", assignee_user_id=dana.id,
                project="Supply Chain Ops", source="manual",
                due_date=now - timedelta(days=3)))
    db.add(Task(org_id=org.id, title="Renew VoltCore supply agreement or issue RFP",
                description="Agreement expires Sept 30. Decision needed by mid-August.",
                status="open", priority="high", assignee_user_id=morgan.id,
                project="Phoenix", source="manual", due_date=now + timedelta(days=25)))

    # --- Contracts ---
    doc("Falcon Shield IDIQ — Prime Contract Summary",
        """Falcon Shield is Helios Aerodyne's IDIQ prime contract with the Department of the Air Force for resilient communications payloads. Period of performance runs through March 31, 2027 with two option years. Ceiling value $48M; funded task orders to date $23.5M.

Key obligations: monthly CDRL A003 status reports; ITAR-controlled technical data handling; small-business subcontracting plan (23% target); government property reporting; delivery of Phoenix flight unit under Task Order 7 by December 2026.

Renewal/extension: option exercise decision expected January 2027. Contract owner: Legal (L. Hart); program execution: M. Reyes.""",
        "contract", "Confidential", src_contracts, "Legal", lena,
        PM + EXEC + [("group", legal_group.id)],
        meta={"project": "Phoenix", "end_date": "2027-03-31", "value": "$48M ceiling",
              "counterparty": "US Air Force"},
        days_ago=30, retention_name="Contracts — 10 years post-expiry")

    doc("VoltCore Batteries Supply Agreement",
        """Master supply agreement with VoltCore Batteries Inc. for qualified lithium-ion flight cells. Expires September 30, 2026. Annual committed volume $6.2M. Lead time per contract: 6 weeks for qualified cells; current quoted lead time is 9 weeks, a contractual service-level breach candidate.

Obligations: quarterly quality audits; cell lot traceability; 12-month warranty. Termination requires 90-day notice. Renewal decision needed by mid-August 2026 to avoid supply gap for the Phoenix October build.""",
        "contract", "Internal", src_contracts, "Supply Chain", dana,
        ORG, meta={"project": "Phoenix", "end_date": "2026-09-30", "value": "$6.2M/yr",
                   "counterparty": "VoltCore Batteries"},
        days_ago=18, retention_name="Contracts — 10 years post-expiry")

    doc("Nimbus Composites Master Agreement",
        """Master agreement with Nimbus Composites for structural panel fabrication. Expires August 15, 2026. Annual volume $3.8M. On-time delivery target 95%; trailing 6-month actual 86%. Includes tooling ownership clause: Helios owns molds #M-118 and #M-121.

A renewal draft is with Legal. Supplier performance review scheduled before signature.""",
        "contract", "Internal", src_contracts, "Supply Chain", dana,
        ORG, meta={"project": "Phoenix", "end_date": "2026-08-15", "value": "$3.8M/yr",
                   "counterparty": "Nimbus Composites"},
        days_ago=22, retention_name="Contracts — 10 years post-expiry")

    doc("Orbital Metals Purchase Framework",
        """Framework agreement with Orbital Metals for aerospace-grade aluminum and titanium stock. Expires January 15, 2027. Annual volume $1.4M. No open disputes; on-time delivery 97%.""",
        "contract", "Internal", src_contracts, "Supply Chain", dana,
        ORG, meta={"end_date": "2027-01-15", "value": "$1.4M/yr",
                   "counterparty": "Orbital Metals"},
        days_ago=40, retention_name="Contracts — 10 years post-expiry")

    # Restricted: exists to prove permission enforcement. Only Legal group +
    # security_admin role hold grants, and level 3 clearance is required.
    doc(
        "Falcon Shield Option-Year Negotiation Strategy (RESTRICTED)",
        """Privileged & confidential — Legal work product. Negotiation strategy for Falcon Shield option years: target ceiling increase to $61M; walk-away position on data-rights clause H-7; competitor intelligence summary; pricing floor analysis. Distribution: General Counsel, outside counsel, CEO only.""",
        "contract", "Restricted", src_contracts, "Legal", lena,
        LEGAL, meta={"project": "Phoenix", "end_date": "2027-03-31"},
        days_ago=3, retention_name="Contracts — 10 years post-expiry")

    # --- Confidential supply-chain assessment (Morgan/Jordan see; Avery must not) ---
    doc(
        "Phoenix Supply Chain Risk Assessment — VoltCore Dependency",
        """Confidential assessment prepared for the program board. Helios sources 100% of qualified flight battery cells from VoltCore Batteries. VoltCore's quoted lead time moved from 6 to 9 weeks and their Q2 financial disclosures show liquidity pressure. A VoltCore delivery failure would delay the Phoenix October build by an estimated 8–12 weeks.

Recommended mitigations: (1) immediately start second-source qualification with Ionex Cells (12-week program, $340K); (2) place a protective buffer order of one shipset; (3) add a supply-failure contingency to the Falcon Shield task order schedule; (4) monthly supplier financial-health review.

This assessment is need-to-know: Program Management, Supply Chain leadership, and executives.""",
        "risk_register", "Confidential", src_gdrive, "Supply Chain", dana,
        PM + SC + EXEC, meta={"project": "Phoenix"}, days_ago=4)

    # --- Business & finance ---
    doc("FY26 Business Plan — Helios Aerodyne",
        """FY26 priorities: (1) deliver Phoenix flight unit under Falcon Shield Task Order 7; (2) grow Skylark ground-segment product line bookings to $9M; (3) reduce single-source supplier exposure across programs; (4) stand up the Orion ground station integration lab.

Financial targets: revenue $41M (+18% YoY), gross margin 34%, R&D investment 11% of revenue. Hiring plan: +14 engineering, +4 supply chain. Key risk: supplier concentration in energy storage components.""",
        "plan", "Confidential", src_gdrive, "Finance", jordan,
        FIN + PM + EXEC, meta={}, days_ago=45)

    spend_rows = [
        ("VoltCore Batteries", "Q1 FY26", 2400000, "Flight battery cells and test articles"),
        ("VoltCore Batteries", "Q2 FY26", 2900000, "Flight cells — expedite fees included"),
        ("Nimbus Composites", "Q2 FY26", 820000, "Structural panel sets #2 and #3"),
        ("Orbital Metals", "Q2 FY26", 610000, "Titanium and aluminum stock"),
        ("Cryotek Systems", "Q2 FY26", 310000, "Thermal test support services"),
    ]
    for supplier, period, amount, desc in spend_rows:
        doc(f"Spend Record — {supplier} — {period}",
            f"""{desc}. Total spend {period}: ${amount:,}. Supplier: {supplier}. Cost center: Phoenix program. Approved by Finance.""",
            "spend", "Internal", src_procurement, "Supply Chain", elena,
            ORG, meta={"supplier": supplier, "amount": amount, "period": period,
                       "project": "Phoenix"},
            days_ago=20)

    doc("Supplier Record — VoltCore Batteries",
        """VoltCore Batteries Inc., Tempe AZ. Sole qualified source for Phoenix flight lithium-ion cells. Quality rating: A-. On-time delivery trailing 6 months: 88%. Financial health watch: Q2 disclosure shows tightened liquidity. Single-source risk flagged by Supply Chain.""",
        "supplier", "Internal", src_procurement, "Supply Chain", dana, ORG,
        meta={"supplier": "VoltCore Batteries"}, days_ago=7)

    doc("Supplier Record — Nimbus Composites",
        """Nimbus Composites LLC, Wichita KS. Structural composite panels. Quality rating: B+. On-time delivery trailing 6 months: 86% against 95% target — improvement plan requested. Master agreement expires August 15, 2026.""",
        "supplier", "Internal", src_procurement, "Supply Chain", dana, ORG,
        meta={"supplier": "Nimbus Composites"}, days_ago=7)

    # --- Policies (org-wide) ---
    doc("Export Control (ITAR) Handling Policy",
        """All Phoenix technical data is ITAR-controlled. Store only in approved systems; no personal devices; foreign-person access requires a license determination by Legal. Violations must be reported to Information Security within 24 hours. Annual training is mandatory for all engineering staff.""",
        "policy", "Internal", src_sharepoint, "Information Security", riley, ORG, days_ago=90)

    doc("AI Acceptable Use Policy",
        """Employees may use the BrainChain assistant for company work. Do not paste customer-proprietary data of other companies. All assistant answers cite sources; verify citations before external use. Anonymous feedback is protected: the platform stores no identity with anonymous submissions and managers see only aggregated themes above the minimum cohort. Agent actions that modify external systems always require human approval.""",
        "policy", "Internal", src_sharepoint, "Information Security", riley, ORG, days_ago=60)

    doc("Purchase Requisition Procedure",
        """Purchase requisitions above $10K require: budget owner approval, procurement review, and (above $250K) finance committee sign-off. Current median cycle time: 11 business days. Target: 5 business days. Known bottleneck: serial approvals between budget owner and procurement.""",
        "procedure", "Internal", src_sharepoint, "Supply Chain", dana, ORG, days_ago=75)

    # --- Slack-style conversation ---
    doc("#phoenix-program — battery cell lead time thread",
        """Dana Wolfe: Heads up — VoltCore confirmed 9-week lead time on the flight cell order, not the 6 weeks we planned.
Avery Chen: That lands the cells mid-September. Integration needs them by October 6, so we're okay only if nothing slips.
Priya Raman: Chamber slot moved to Aug 11 too, so the margin is thin. This is a real schedule risk.
Morgan Reyes: Agreed — bringing both to the risk deep-dive on the 16th. Please have current dates ready.
Dana Wolfe: Also drafting the second-source question for Ionex Cells. Their sales team can start qualification in August.
Taylor Brooks: Good. Let's make sure any decision lands in the decision log this time.""",
        "message", "Internal", src_slack, "Engineering", avery, ORG,
        meta={"project": "Phoenix", "channel": "#phoenix-program"}, days_ago=3)

    # --- Pre-ingested meeting transcript (July 10 program review) ---
    transcript_j10 = """Morgan Reyes: Welcome to the Phoenix program review for July 10. Agenda: schedule, suppliers, quality.
Priya Raman: Thermal qualification remains the pacing item. The chamber vendor slip is a two-week delay risk if we hold the serial test plan.
Morgan Reyes: We've decided to evaluate a parallel thermal and vibration campaign; final call at the July 16 deep-dive.
Dana Wolfe: Supplier update — Nimbus recovered the panel slip, but their on-time rate is still below target. VoltCore lead times are the bigger concern.
Avery Chen: Firmware v2.3 passed bench regression. The vibration fault is likely mechanical, not software.
Morgan Reyes: Action: Avery will schedule shaker table time to verify the connector fix.
Taylor Brooks: I will update the program risk register with the chamber and battery items.
Elena Vasquez: Budget note — expedite fees pushed Q2 supplier spend nine percent over plan. Watch item, not a blocker yet.
Morgan Reyes: Is anyone tracking whether the FRR date needs to move?
Taylor Brooks: Holding September 12 per plan v3 until the deep-dive concludes.
Morgan Reyes: Agreed to revisit at the deep-dive. Thanks everyone."""
    d_transcript = doc(
        "Phoenix Program Review — July 10, 2026 (transcript)",
        transcript_j10, "transcript", "Internal", src_zoom, "Program Management",
        morgan, ORG, meta={"project": "Phoenix"}, days_ago=8)
    extraction = extract_from_transcript(transcript_j10)
    meeting_j10 = Meeting(
        org_id=org.id, title="Phoenix Program Review — July 10, 2026",
        held_at=now - timedelta(days=8), source="zoom",
        transcript_document_id=d_transcript.id,
        department_id=departments["Program Management"].id,
        attendees=extraction["speakers"], extraction=extraction,
    )
    db.add(meeting_j10)
    db.flush()

    # ------------------------------------------------------------ decisions
    dec_single = Decision(
        org_id=org.id, title="Single-source composite panels from Nimbus",
        decided_at=now - timedelta(days=200), status="superseded",
        rationale="Original 2025 decision to consolidate composite panel supply with "
        "Nimbus for tooling efficiency.",
        project="Phoenix", owners=["Dana Wolfe"], sources=[])
    db.add(dec_single)
    db.flush()
    db.add(Decision(
        org_id=org.id, title="Dual-source composite panels — qualify Aerolam as second source",
        decided_at=now - timedelta(days=35), status="active",
        rationale="Nimbus on-time performance fell to 86%; dual-sourcing reduces schedule "
        "risk for panel sets #4+.",
        supersedes_id=dec_single.id, project="Phoenix",
        owners=["Dana Wolfe", "Morgan Reyes"], sources=[]))
    db.add(Decision(
        org_id=org.id,
        title="Evaluate parallel thermal and vibration qualification campaign",
        decided_at=now - timedelta(days=8), status="active",
        rationale="Recover chamber-slip schedule risk; finalized at the July 16 deep-dive.",
        meeting_id=meeting_j10.id, document_id=d_transcript.id, project="Phoenix",
        owners=["Morgan Reyes"], sources=[d_transcript.id]))
    db.add(Decision(
        org_id=org.id, title="Adopt weekly Phoenix risk review cadence through FRR",
        decided_at=now - timedelta(days=15), status="active",
        rationale="Compressed schedule requires tighter risk tracking.",
        project="Phoenix", owners=["Taylor Brooks"], sources=[d_riskreg.id]))

    # ------------------------------------------------------- entity graph
    ent: dict[str, Entity] = {}

    def entity(kind, name, **meta):
        e = Entity(org_id=org.id, kind=kind, name=name, meta=meta)
        db.add(e)
        db.flush()
        ent[name] = e
        return e

    entity("project", "Phoenix", status="at_risk")
    entity("project", "Skylark", status="on_track")
    entity("project", "Orion Ground Station", status="planning")
    entity("supplier", "VoltCore Batteries", risk="high")
    entity("supplier", "Nimbus Composites", risk="medium")
    entity("supplier", "Orbital Metals", risk="low")
    entity("supplier", "Aerolam", risk="unqualified")
    entity("contract", "Falcon Shield IDIQ")
    entity("contract", "VoltCore Supply Agreement")
    entity("person", "Morgan Reyes", role="Program Manager")
    entity("person", "Avery Chen", role="Avionics Engineer")
    entity("person", "Dana Wolfe", role="Procurement Lead")
    entity("department", "Engineering")
    entity("department", "Supply Chain")
    entity("risk", "Battery cell lead time")
    entity("risk", "Thermal chamber availability")
    entity("meeting", "Phoenix Program Review — July 10")
    entity("decision", "Dual-source composite panels")

    def rel(a, b, rel_type):
        db.add(EntityRelationship(
            org_id=org.id, from_entity_id=ent[a].id, to_entity_id=ent[b].id, rel_type=rel_type))

    rel("Phoenix", "VoltCore Batteries", "depends_on")
    rel("Phoenix", "Nimbus Composites", "depends_on")
    rel("Falcon Shield IDIQ", "Phoenix", "governs")
    rel("VoltCore Supply Agreement", "VoltCore Batteries", "governs")
    rel("Morgan Reyes", "Phoenix", "manages")
    rel("Avery Chen", "Phoenix", "works_on")
    rel("Dana Wolfe", "Supply Chain", "works_on")
    rel("Battery cell lead time", "Phoenix", "at_risk")
    rel("Thermal chamber availability", "Phoenix", "at_risk")
    rel("Battery cell lead time", "VoltCore Batteries", "mentions")
    rel("Phoenix Program Review — July 10", "Dual-source composite panels", "decided_in")
    rel("Engineering", "Phoenix", "works_on")
    rel("Skylark", "Engineering", "depends_on")

    # ------------------------------------------------------- feedback themes
    themes = {
        "Procurement bottlenecks": ["procurement", "purchasing", "po", "requisition",
                                    "approvals", "supplier", "ordering", "purchase"],
        "Meeting overload": ["meetings", "meeting", "calendar", "standup", "standups",
                             "invites", "syncs"],
        "Test equipment & tooling": ["equipment", "tooling", "chamber", "shaker",
                                     "test", "lab"],
        "Onboarding & documentation": ["onboarding", "documentation", "docs", "wiki",
                                       "training"],
    }
    for name, keywords in themes.items():
        db.add(FeedbackTheme(org_id=org.id, name=name, keywords=keywords,
                             description=f"Auto-clustered theme: {name}"))
    db.flush()

    # --------------------------------------------------------------- surveys
    pulse = Survey(org_id=org.id, title="Weekly Pulse — Week of July 13",
                   kind="weekly_pulse", status="open",
                   description="Two minutes. Anonymous by default.",
                   opens_at=now - timedelta(days=5), closes_at=now + timedelta(days=2))
    db.add(pulse)
    db.flush()
    for i, (text, qtype, options) in enumerate([
        ("How was your week overall?", "scale", ["1", "2", "3", "4", "5"]),
        ("What slowed you down the most this week?", "text", []),
        ("One thing leadership should know:", "text", []),
    ]):
        db.add(SurveyQuestion(survey_id=pulse.id, ord=i, text=text, qtype=qtype,
                              options=options))
    retro = Survey(org_id=org.id, title="Phoenix Qualification Phase Retro",
                   kind="retro", status="open",
                   description="Retrospective input for the qualification phase.",
                   opens_at=now - timedelta(days=2), closes_at=now + timedelta(days=7))
    db.add(retro)
    db.flush()
    db.add(SurveyQuestion(survey_id=retro.id, ord=0,
                          text="What should we keep doing?", qtype="text"))
    db.add(SurveyQuestion(survey_id=retro.id, ord=1,
                          text="What should we change before the flight build?", qtype="text"))

    # ------------------------------------------------------ feedback seeds
    # Meeting overload: 6 anonymous → already above the cohort of 5.
    meeting_feedback = [
        (priya, "Too many recurring meetings overlap with lab time. Standups plus program "
                "syncs eat most mornings and it is frustrating."),
        (avery, "Calendar is full of meetings where I'm optional. Could we make agendas "
                "mandatory for invites?"),
        (leo, "Manufacturing floor leads spend 2+ hours daily in meetings and syncs. "
              "It delays line support."),
        (noah, "Half my meetings could be a message thread. Meeting overload is real."),
        (elena, "Finance close week collides with program meetings every month. Painful "
                "calendar management."),
        (dana, "The number of standing invites keeps growing; meetings crowd out actual "
               "procurement work."),
    ]
    for author, body in meeting_feedback:
        submit_feedback(db, author, body=body, visibility="anonymous", category="friction")

    # Procurement: 4 anonymous → BELOW the cohort of 5. The live demo submits
    # the 5th to unlock the theme (Workflow 3).
    procurement_feedback = [
        (avery, "Purchase requisition approvals are a bottleneck — my test cable PO sat "
                "eleven days waiting for serial approvals."),
        (priya, "Procurement cycle time is slow and it is blocking test equipment orders. "
                "The approvals chain needs to be parallel."),
        (leo, "Ordering spare tooling takes weeks because every purchase above 10k goes "
              "through the same procurement queue."),
        (noah, "Supplier onboarding paperwork in procurement is duplicated across three "
               "systems. Frustrating and slow."),
    ]
    for author, body in procurement_feedback:
        submit_feedback(db, author, body=body, visibility="anonymous", category="process")

    # Below-threshold minor theme + named + confidential examples.
    submit_feedback(db, priya, body="The new shaker table booking system in the test lab "
                    "is great — much faster than email.", visibility="anonymous",
                    category="thought")
    submit_feedback(db, avery, body="Idea: publish a weekly 'decisions digest' from the "
                    "decision log so engineers stop re-litigating settled questions.",
                    visibility="named", category="idea", allow_followup=True,
                    project_tag="Phoenix")
    submit_feedback(db, leo, body="Suggestion: add a second harness technician shift "
                    "during September integration crunch.", visibility="named",
                    category="idea", department_tag="Manufacturing")
    submit_feedback(db, elena, body="I'm concerned expedite fees are being approved "
                    "without budget-owner visibility. Happy to discuss privately.",
                    visibility="confidential", category="concern", allow_followup=True)

    # ------------------------------------------------------ model gateway
    p_local = ModelProvider(
        org_id=org.id, name="BrainChain Local Synthesis", kind="mock",
        model="brainchain-local-1", enabled=True, is_external=False,
        allows_data_retention=False, allows_tool_use=True,
        max_context_tokens=64000, region="in-process")
    p_ext = ModelProvider(
        org_id=org.id, name="OpenAI-compatible endpoint (env-configured)",
        kind="openai_compatible", model="set via BRAINCHAIN_OPENAI_MODEL",
        enabled=True, is_external=True, allows_data_retention=False,
        allows_tool_use=False, max_context_tokens=128000,
        cost_limit_usd_month=500.0, region="us")
    db.add_all([p_local, p_ext])
    db.flush()
    db.add(ModelPolicy(
        org_id=org.id, name="External models — Public/Internal only",
        provider_id=p_ext.id, fallback_provider_id=p_local.id,
        max_classification_level=1, priority=5, enabled=True,
        logging_policy="metadata_only"))
    db.add(ModelPolicy(
        org_id=org.id, name="Local synthesis — all classifications",
        provider_id=p_local.id, max_classification_level=3, priority=10,
        enabled=True, logging_policy="metadata_only"))

    # ---------------------------------------------------------------- agents
    agent_defs = [
        ("research", "Research Agent",
         "Finds and synthesizes authorized company information with citations.",
         "research", ["knowledge.retrieve", "knowledge.graph"], []),
        ("planning", "Planning Agent",
         "Converts a goal into phases, milestones, dependencies, owners, risks and tasks.",
         "planning", ["knowledge.retrieve", "tasks.draft", "jira.draft"],
         ["modify_jira", "post_message"]),
        ("project_health", "Project Health Agent",
         "Reviews project data and identifies delays, blockers, missing owners and dependencies.",
         "monitoring", ["knowledge.retrieve", "tasks.read"], ["post_message"]),
        ("meeting_followup", "Meeting Follow-Up Agent",
         "Converts meeting transcripts into decisions, tasks, owners, deadlines and open questions.",
         "productivity", ["knowledge.retrieve", "tasks.draft", "email.draft"],
         ["send_email", "modify_jira"]),
        ("spend_supplier", "Spend & Supplier Agent",
         "Reviews spend, supplier, contract and project information for opportunities and risks.",
         "analysis", ["knowledge.retrieve", "spend.aggregate"],
         ["create_external_record"]),
        ("exec_brief", "Executive Briefing Agent",
         "Creates an evidence-backed summary of major company developments.",
         "reporting", ["knowledge.retrieve", "insights.compute"], []),
    ]
    agents: dict[str, Agent] = {}
    for key, name, desc, cat, tools, approvals in agent_defs:
        a = Agent(org_id=org.id, key=key, name=name, description=desc, category=cat,
                  tool_allowlist=tools, approval_required_actions=approvals)
        db.add(a)
        agents[key] = a
    db.flush()

    db.add(EvaluationRun(
        org_id=org.id, name="Retrieval smoke eval — July 2026", kind="retrieval",
        metrics={"queries": 25, "hit_rate@5": 0.88, "permission_violations": 0},
        notes="Nightly evaluation over the seeded corpus; zero authorized-scope violations."))

    db.commit()

    # ------------------------------------------------- live seeded activity
    # Run through the real services so conversations/runs/briefs are authentic.
    from .services.agents_engine import start_run
    from .services.assistant import ask
    from .services.insights import build_weekly_brief

    ask(db, avery,
        "What are the main risks affecting the Phoenix project this quarter?",
        mode="direct")
    ask(db, morgan, "When is the Phoenix flight readiness review?", mode="compare")

    start_run(db, agents["research"], avery,
              "Summarize everything we know about VoltCore battery lead times and their "
              "impact on Phoenix.")
    # Planning run proposes external actions → lands in awaiting_approval for
    # the Workflow 4 demo. Requested by Morgan so Taylor can decide it.
    start_run(db, agents["planning"], morgan,
              "Create a recovery plan for the Phoenix qualification schedule slip, "
              "including battery supply risk mitigation.")

    build_weekly_brief(db, org, jordan)

    db.commit()
    db.close()
    print("Seeded Helios Aerodyne demo data.")
    print(f"  Login password for every account: {DEMO_PASSWORD}")
    for email, role in [
        ("avery.chen@heliosaerodyne.com", "Employee (Engineering)"),
        ("morgan.reyes@heliosaerodyne.com", "Manager (Program Management)"),
        ("jordan.blake@heliosaerodyne.com", "Executive (COO)"),
        ("sam.okafor@heliosaerodyne.com", "Data Steward"),
        ("riley.novak@heliosaerodyne.com", "Security Administrator"),
        ("casey.kim@heliosaerodyne.com", "System Administrator"),
        ("taylor.brooks@heliosaerodyne.com", "Agent Approver / Manager"),
    ]:
        print(f"  {email:44s} {role}")


if __name__ == "__main__":
    seed()
