# Connector interface

Connectors bring enterprise content into the knowledge layer while preserving each
item's provenance and permissions. In the MVP every connector is a **mock behind the
real interface**: only the upstream fetch is simulated — parsing, transcript
extraction, permission mapping, chunking, embedding, counters, health, and audit are
the production path.

## Anatomy

- **`DataSource`** — the governed asset: name, kind, owner, department,
  classification, retention policy.
- **`Connector`** — the live pipe: provider, status (`connected|error|paused`),
  health (`healthy|degraded|failing`), sync frequency, last sync, items
  synced/skipped, permission-error count, and `config.pending_items` (the mock
  upstream queue).
- **`SyncJob`** — one auditable execution: trigger (manual/scheduled), timing,
  counts, and a structured log the UI renders line by line.

Ten connectors ship seeded: Zoom, Slack, Jira, SharePoint (contracts), ERP spend
feed, Google Drive, Engineering wiki, SharePoint (policies), Teams, Email.

## Sync lifecycle (`services/connectors.py::run_sync`)

1. Create `SyncJob(running)` and start the structured log.
2. For each pending upstream item:
   - **Permission errors fail closed** — the item is skipped, counted, and logged;
     nothing partial enters the knowledge base.
   - Otherwise a `SourceItem` is recorded and the item flows through
     `ingest_document()`: normalization → classification → retention → chunking →
     embedding → ACL writes (explicit item ACL, else department, else org).
   - `kind == "transcript"` additionally runs the extractor: speaker turns →
     decisions, action items (with owners and deadline phrases), risk mentions, open
     questions → `Meeting`, `Decision`, and `Task` rows.
3. Counters/health update; the job finishes `success|failed`; an `AuditEvent` is
   written.

Manual sync: `POST /connectors/{id}/sync` (data steward / system admin / security
admin). Scheduled sync: `workers/runner.py` runs due connectors by frequency.

## Adding a live connector

1. Implement a fetcher that yields the same item dicts the mock queue holds
   (`external_id, kind, title, content, doc_type, created_at, meta, acl,
   classification_id?, permission_error?`).
2. Store credentials in env / a secret store — never in `Connector.config`.
3. Map the source system's ACLs into `acl` tuples (`org|department|group|role|user`).
   Mirroring source permissions is the connector's core responsibility.
4. Set `is_mock=False`; everything downstream (parsing, extraction, storage, audit,
   UI) is already the production path.
5. Add incremental cursors to `config` and let the worker's frequency table schedule
   it.
