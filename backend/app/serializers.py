from __future__ import annotations

from typing import Any

from . import db


def customer(customer_id: str) -> dict[str, Any] | None:
    row = db.fetchone("SELECT * FROM customers WHERE id = ?", (customer_id,))
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "segment": row["segment"],
        "ltv": row["ltv"],
        "risk": row["risk"],
        "flags": db.load(row["flags"], []),
    }


def order(order_id: str) -> dict[str, Any] | None:
    row = db.fetchone("SELECT * FROM orders WHERE id = ?", (order_id,))
    if not row:
        return None
    return {
        "id": row["id"],
        "customer_id": row["customer_id"],
        "total": row["total"],
        "currency": row["currency"],
        "placed_at": row["placed_at"],
        "status": row["status"],
        "items": db.load(row["items"], []),
    }


def payment(order_id: str) -> dict[str, Any] | None:
    row = db.fetchone("SELECT * FROM payments WHERE order_id = ?", (order_id,))
    if not row:
        return None
    return {
        "id": row["id"],
        "order_id": row["order_id"],
        "method": row["method"],
        "amount": row["amount"],
        "status": row["status"],
        "payee": row["payee"],
        "provider_ref": row["provider_ref"],
    }


def shipment(order_id: str) -> dict[str, Any] | None:
    row = db.fetchone("SELECT * FROM shipments WHERE order_id = ?", (order_id,))
    if not row:
        return None
    return {
        "id": row["id"],
        "order_id": row["order_id"],
        "carrier": row["carrier"],
        "tracking": row["tracking"],
        "status": row["status"],
        "eta": row["eta"],
        "events": db.load(row["events"], []),
    }


def ticket_summary(row: Any) -> dict[str, Any]:
    customer_row = customer(row["customer_id"])
    return {
        "id": row["id"],
        "subject": row["subject"],
        "customer_name": customer_row["name"] if customer_row else "Unknown",
        "customer_segment": customer_row["segment"] if customer_row else "Core",
        "intent": row["intent"],
        "channel": row["channel"],
        "order_id": row["order_id"],
        "status": row["status"],
        "lane": row["lane"],
        "sentiment": row["sentiment"],
        "priority": row["priority"],
        "amount_at_risk": row["amount_at_risk"],
        "updated_at": row["updated_at"],
        "waiting_since": row["waiting_since"],
    }


def ticket_detail(ticket_id: str) -> dict[str, Any] | None:
    row = db.ticket_row(ticket_id)
    if not row:
        return None
    return {
        "id": row["id"],
        "subject": row["subject"],
        "intent": row["intent"],
        "channel": row["channel"],
        "status": row["status"],
        "lane": row["lane"],
        "sentiment": row["sentiment"],
        "priority": row["priority"],
        "risk": row["risk"],
        "confidence": row["confidence"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "waiting_since": row["waiting_since"],
        "amount_at_risk": row["amount_at_risk"],
        "customer": customer(row["customer_id"]),
        "order": order(row["order_id"]),
        "payment": payment(row["order_id"]),
        "shipment": shipment(row["order_id"]),
        "messages": db.load(row["messages"], []),
        "trace": db.load(row["trace"], []),
        "actions": db.load(row["actions"], []),
        "brief": db.load(row["brief"], None),
        "resolution": db.load(row["resolution"], None),
        "agent_run": db.latest_agent_run(ticket_id),
    }


def approvals() -> list[dict[str, Any]]:
    rows = db.fetchall("SELECT * FROM tickets WHERE status = 'waiting_human' ORDER BY waiting_since ASC")
    result = []
    for row in rows:
        actions = db.load(row["actions"], [])
        for action in actions:
            if action.get("status") == "pending_approval":
                result.append({
                    "ticket": ticket_summary(row),
                    "action": action,
                    "brief": action.get("brief") or db.load(row["brief"], None),
                    "waiting_since": row["waiting_since"],
                })
                break
    return result
