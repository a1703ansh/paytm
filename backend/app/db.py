from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "resolveos.db"

_conn: sqlite3.Connection | None = None
_lock = threading.RLock()


SCHEMA = """
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    segment TEXT,
    ltv REAL,
    risk INTEGER,
    flags TEXT
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    total REAL,
    currency TEXT,
    placed_at TEXT,
    status TEXT,
    items TEXT
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    method TEXT,
    amount REAL,
    status TEXT,
    payee TEXT,
    provider_ref TEXT
);

CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    carrier TEXT,
    tracking TEXT,
    status TEXT,
    eta TEXT,
    events TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    subject TEXT,
    intent TEXT,
    channel TEXT,
    status TEXT,
    sentiment TEXT,
    priority TEXT,
    risk INTEGER,
    confidence REAL,
    lane TEXT,
    customer_id TEXT,
    order_id TEXT,
    amount_at_risk REAL,
    created_at TEXT,
    updated_at TEXT,
    waiting_since TEXT,
    messages TEXT,
    trace TEXT,
    actions TEXT,
    brief TEXT,
    resolution TEXT,
    seed_state TEXT
);

CREATE TABLE IF NOT EXISTS historical (
    id TEXT PRIMARY KEY,
    intent TEXT,
    action_type TEXT,
    amount REAL,
    risk INTEGER,
    segment TEXT,
    evidence_complete INTEGER,
    payee_changed INTEGER,
    human_approved INTEGER,
    human_action TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS policy_versions (
    version TEXT PRIMARY KEY,
    auto_limit REAL,
    notify_limit REAL,
    risk_threshold INTEGER,
    hard_deny REAL,
    updated_at TEXT,
    note TEXT,
    active INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT,
    type TEXT,
    label TEXT,
    payload TEXT,
    prev_hash TEXT,
    hash TEXT,
    ts TEXT
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    ticket_id TEXT,
    mode TEXT,
    provider TEXT,
    model TEXT,
    prompt_version TEXT,
    status TEXT,
    fallback_used INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    tool_calls TEXT,
    proposal TEXT,
    policy TEXT,
    execution TEXT,
    rationale TEXT,
    error TEXT,
    input_hash TEXT,
    created_at TEXT
);
"""


def now_ist() -> str:
    tz = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(tz).replace(microsecond=0).isoformat()


def get_conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
        return _conn


def init_db() -> None:
    with _lock:
        conn = get_conn()
        conn.executescript(SCHEMA)
        conn.commit()


def reset_database() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None
        if DB_PATH.exists():
            DB_PATH.unlink()
        init_db()


def fetchall(sql: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    with _lock:
        return get_conn().execute(sql, params).fetchall()


def fetchone(sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
    with _lock:
        return get_conn().execute(sql, params).fetchone()


def execute(sql: str, params: tuple[Any, ...] = ()) -> None:
    with _lock:
        conn = get_conn()
        conn.execute(sql, params)
        conn.commit()


def execute_many(sql: str, rows: list[tuple[Any, ...]]) -> None:
    with _lock:
        conn = get_conn()
        conn.executemany(sql, rows)
        conn.commit()


def load(value: str | None, default: Any = None) -> Any:
    if value is None or value == "":
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def ticket_row(ticket_id: str) -> sqlite3.Row | None:
    return fetchone("SELECT * FROM tickets WHERE id = ?", (ticket_id,))


def save_ticket(ticket_id: str, fields: dict[str, Any]) -> None:
    allowed = {
        "subject",
        "intent",
        "channel",
        "status",
        "sentiment",
        "priority",
        "risk",
        "confidence",
        "lane",
        "customer_id",
        "order_id",
        "amount_at_risk",
        "created_at",
        "updated_at",
        "waiting_since",
        "messages",
        "trace",
        "actions",
        "brief",
        "resolution",
    }
    parts = []
    values: list[Any] = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        parts.append(f"{key} = ?")
        if key in {"messages", "trace", "actions", "brief", "resolution"}:
            values.append(dump(value))
        else:
            values.append(value)
    if not parts:
        return
    values.append(ticket_id)
    execute(f"UPDATE tickets SET {', '.join(parts)} WHERE id = ?", tuple(values))


AGENT_RUN_FIELDS = (
    "id",
    "ticket_id",
    "mode",
    "provider",
    "model",
    "prompt_version",
    "status",
    "fallback_used",
    "latency_ms",
    "input_tokens",
    "output_tokens",
    "tool_calls",
    "proposal",
    "policy",
    "execution",
    "rationale",
    "error",
    "input_hash",
    "created_at",
)
AGENT_RUN_JSON_FIELDS = {"tool_calls", "proposal", "policy", "execution"}
AGENT_RUN_INT_FIELDS = {"latency_ms", "input_tokens", "output_tokens"}


def _agent_run_from_row(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    for field in AGENT_RUN_JSON_FIELDS:
        default = [] if field == "tool_calls" else None
        result[field] = load(result.get(field), default)
    result["fallback_used"] = bool(result.get("fallback_used"))
    for field in AGENT_RUN_INT_FIELDS:
        result[field] = int(result.get(field) or 0)
    return result


def save_agent_run(run: dict[str, Any]) -> dict[str, Any]:
    record = dict(run)
    record.setdefault("created_at", now_ist())
    values: list[Any] = []
    for field in AGENT_RUN_FIELDS:
        value = record.get(field)
        if field in AGENT_RUN_JSON_FIELDS:
            value = None if value is None else dump(value)
        elif field == "fallback_used":
            value = 1 if value else 0
        elif field in AGENT_RUN_INT_FIELDS:
            value = int(value or 0)
        values.append(value)
    placeholders = ", ".join("?" for _ in AGENT_RUN_FIELDS)
    execute(
        f"INSERT OR REPLACE INTO agent_runs ({', '.join(AGENT_RUN_FIELDS)}) VALUES ({placeholders})",
        tuple(values),
    )
    return record


def latest_agent_run(ticket_id: str) -> dict[str, Any] | None:
    row = fetchone(
        "SELECT * FROM agent_runs WHERE ticket_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
        (ticket_id,),
    )
    return _agent_run_from_row(row) if row else None


def agent_run(run_id: str) -> dict[str, Any] | None:
    row = fetchone("SELECT * FROM agent_runs WHERE id = ?", (run_id,))
    return _agent_run_from_row(row) if row else None
