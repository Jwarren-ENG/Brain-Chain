"""Background worker entry point.

The MVP runs sync jobs in-process (the API calls services.connectors.run_sync
directly), so nothing needs to be running here for the demo. This runner
exists so the job layer has a home when you move to Redis + a real queue:
point it at the same service functions Celery/Dramatiq tasks would call —
the job logic itself does not change.

Usage:
    .venv/bin/python workers/runner.py            # run all due scheduled syncs once
    .venv/bin/python workers/runner.py --loop     # poll every 60s
"""
from __future__ import annotations

import sys
import time
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from app.db import SessionLocal  # noqa: E402
from app.models import Connector, utcnow  # noqa: E402
from app.services.connectors import run_sync  # noqa: E402

FREQUENCY = {
    "15 minutes": timedelta(minutes=15),
    "hourly": timedelta(hours=1),
    "6 hours": timedelta(hours=6),
    "daily": timedelta(days=1),
    "nightly": timedelta(days=1),
}


def run_due_syncs() -> int:
    db = SessionLocal()
    ran = 0
    try:
        for connector in db.query(Connector).filter(Connector.status == "connected").all():
            interval = FREQUENCY.get(connector.sync_frequency, timedelta(hours=1))
            due = not connector.last_sync_at or utcnow() - connector.last_sync_at >= interval
            if due and connector.config.get("pending_items"):
                job = run_sync(db, connector, trigger="scheduled")
                print(f"[worker] synced {connector.display_name}: {job.status} "
                      f"({job.items_processed} in / {job.items_skipped} skipped)")
                ran += 1
    finally:
        db.close()
    return ran


if __name__ == "__main__":
    if "--loop" in sys.argv:
        print("[worker] polling for due connector syncs every 60s (Ctrl-C to stop)")
        while True:
            run_due_syncs()
            time.sleep(60)
    else:
        count = run_due_syncs()
        print(f"[worker] done — {count} sync job(s) executed")
