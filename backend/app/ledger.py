from __future__ import annotations

import hashlib
from typing import Any

from . import db

GENESIS = "0" * 64


def append_event(ticket_id: str | None, event_type: str, label: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    previous = db.fetchone("SELECT hash FROM ledger ORDER BY id DESC LIMIT 1")
    prev_hash = previous["hash"] if previous else GENESIS
    ts = db.now_ist()
    material = f"{prev_hash}|{ts}|{event_type}|{label}|{db.dump(payload)}"
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
    db.execute(
        "INSERT INTO ledger (ticket_id, type, label, payload, prev_hash, hash, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (ticket_id, event_type, label, db.dump(payload), prev_hash, digest, ts),
    )
    row = db.fetchone("SELECT * FROM ledger ORDER BY id DESC LIMIT 1")
    return dict(row) if row else {}


def recent_events(limit: int = 8) -> list[dict[str, Any]]:
    rows = db.fetchall("SELECT * FROM ledger ORDER BY id DESC LIMIT ?", (limit,))
    return [
        {
            "id": f"L-{row['id']}",
            "type": row["type"],
            "label": row["label"],
            "ticket_id": row["ticket_id"],
            "ts": row["ts"],
        }
        for row in rows
    ]


def verify_chain() -> bool:
    rows = db.fetchall("SELECT * FROM ledger ORDER BY id ASC")
    prev = GENESIS
    for row in rows:
        material = f"{prev}|{row['ts']}|{row['type']}|{row['label']}|{row['payload']}"
        digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
        if digest != row["hash"] or row["prev_hash"] != prev:
            return False
        prev = row["hash"]
    return True


def for_ticket(ticket_id: str) -> list[dict[str, Any]]:
    rows = db.fetchall("SELECT * FROM ledger WHERE ticket_id = ? ORDER BY id ASC", (ticket_id,))
    return [dict(row) for row in rows]
