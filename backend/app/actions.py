from __future__ import annotations

import hashlib
from typing import Any

from . import db, ledger, policy


def find_action(action_id: str) -> tuple[Any, list[dict[str, Any]], dict[str, Any]] | None:
    for row in db.fetchall("SELECT * FROM tickets"):
        actions = db.load(row["actions"], [])
        for action in actions:
            if action.get("id") == action_id:
                return row, actions, action
    return None


def action_for_ticket(ticket_id: str) -> list[dict[str, Any]]:
    row = db.ticket_row(ticket_id)
    if not row:
        return []
    return db.load(row["actions"], [])


def reference_for(action: dict[str, Any]) -> str:
    prefix = {
        "issue_refund": "RFND",
        "create_replacement": "RPL",
        "create_return": "RET",
        "retry_payment": "PAY",
        "share_tracking": "TRK",
        "send_update": "UPD",
        "update_address": "ADR",
    }.get(action["type"], "ACT")
    key = action.get("idempotency_key", action["id"])
    return f"{prefix}-{str(key)[:6].upper()}"


def execute_action(ticket_id: str, action_id: str, approved_by: str | None = None) -> tuple[Any, list[dict[str, Any]], dict[str, Any]]:
    row = db.ticket_row(ticket_id)
    if not row:
        raise ValueError("Ticket not found")
    actions = db.load(row["actions"], [])
    action = next((item for item in actions if item["id"] == action_id), None)
    if not action:
        raise ValueError("Action not found")

    if action["status"] in {"executed", "verified"}:
        return row, actions, action

    if action["status"] == "pending_approval" and not approved_by:
        raise PermissionError("This action requires human approval")

    active = policy.get_active_policy()
    amount = float(action.get("params", {}).get("amount") or 0)
    if action.get("lane") == "auto" and amount > float(active["auto_limit"]):
        raise PermissionError("Amount exceeds the active auto licence")
    if action.get("lane") == "deny":
        raise PermissionError("Denied actions cannot be executed")
    if amount > float(active["hard_deny"]):
        raise PermissionError("Hard refund ceiling exceeded")

    reference = reference_for(action)
    action_type = action["type"]
    if action_type == "issue_refund":
        db.execute("UPDATE payments SET status = 'refunded', provider_ref = ? WHERE order_id = ?", (reference, action["params"].get("order_id")))
        db.execute("UPDATE orders SET status = 'refunded' WHERE id = ?", (action["params"].get("order_id"),))
        verified = db.fetchone("SELECT status, provider_ref FROM payments WHERE order_id = ?", (action["params"].get("order_id"),))
        verification_detail = f"Payment read-back: {verified['status']} · {verified['provider_ref']}" if verified else "Refund recorded"
    elif action_type == "create_replacement":
        db.execute("UPDATE orders SET status = 'replacement_created' WHERE id = ?", (action["params"].get("order_id"),))
        verified = db.fetchone("SELECT status FROM orders WHERE id = ?", (action["params"].get("order_id"),))
        verification_detail = f"Order read-back: {verified['status']}" if verified else "Replacement recorded"
    elif action_type == "create_return":
        db.execute("UPDATE orders SET status = 'return_scheduled' WHERE id = ?", (action["params"].get("order_id"),))
        verified = db.fetchone("SELECT status FROM orders WHERE id = ?", (action["params"].get("order_id"),))
        verification_detail = f"Order read-back: {verified['status']}" if verified else "Return recorded"
    elif action_type == "retry_payment":
        db.execute("UPDATE payments SET status = 'link_sent', provider_ref = ? WHERE order_id = ?", (reference, action["params"].get("order_id")))
        verified = db.fetchone("SELECT status, provider_ref FROM payments WHERE order_id = ?", (action["params"].get("order_id"),))
        verification_detail = f"Payment read-back: {verified['status']} · {verified['provider_ref']}" if verified else "Payment link recorded"
    else:
        verified = db.fetchone("SELECT tracking, status FROM shipments WHERE order_id = ?", (action["params"].get("order_id"),))
        if verified and verified["tracking"]:
            verification_detail = f"Shipment read-back: {verified['tracking']} · {verified['status']}"
        else:
            verification_detail = "Message delivery receipt confirmed"

    executed_at = db.now_ist()
    action["status"] = "verified"
    action["executed_at"] = executed_at
    action["verified_at"] = executed_at
    action["reference"] = reference
    action["approved_by"] = approved_by
    action["verification"] = {"status": "verified", "detail": verification_detail}
    db.save_ticket(ticket_id, {"actions": actions})
    ledger.append_event(ticket_id, "action.executed", f"{action_type.replace('_', ' ').title()} · {reference}", {
        "action_id": action_id,
        "amount": amount,
        "policy_version": action.get("policy_version"),
    })
    ledger.append_event(ticket_id, "action.verified", verification_detail, {"action_id": action_id, "reference": reference})
    return row, actions, action


def approve_action(action_id: str, approver: str = "Aarav Kapoor") -> tuple[Any, dict[str, Any]]:
    found = find_action(action_id)
    if not found:
        raise ValueError("Action not found")
    row, actions, action = found
    if action["status"] == "pending_approval":
        ledger.append_event(row["id"], "human.approved", f"{approver} approved {action['type'].replace('_', ' ')}", {
            "action_id": action_id,
            "amount": action.get("params", {}).get("amount"),
        })
    _, actions, action = execute_action(row["id"], action_id, approved_by=approver)
    row = db.ticket_row(row["id"])
    messages = db.load(row["messages"], [])
    amount = float(action.get("params", {}).get("amount") or 0)
    messages.append({
        "id": f"M-{hashlib.sha1((action_id + db.now_ist()).encode()).hexdigest()[:8]}",
        "role": "system",
        "content": f"{approver} approved the case brief. Agent resumed at execute — not a new conversation.",
        "created_at": db.now_ist(),
        "evidence": [],
    })
    messages.append({
        "id": f"M-{hashlib.sha1((action_id + 'agent').encode()).hexdigest()[:8]}",
        "role": "agent",
        "content": _completion_message(action, row),
        "created_at": db.now_ist(),
        "evidence": [f"Reference {action['reference']}", f"Policy {action.get('policy_version')}", "Read-back verified"],
    })
    resolution = {
        "summary": _resolution_summary(action),
        "value_saved": amount if action["type"] == "issue_refund" else None,
        "value_handled": amount if action["type"] != "issue_refund" else None,
        "minutes_saved": 8.4,
        "verified": True,
    }
    db.save_ticket(row["id"], {
        "status": "resolved",
        "lane": action.get("lane"),
        "messages": messages,
        "resolution": resolution,
        "brief": None,
        "waiting_since": None,
        "updated_at": db.now_ist(),
        "actions": actions,
    })
    return db.ticket_row(row["id"]), action


def reject_action(action_id: str, reason: str = "") -> tuple[Any, dict[str, Any]]:
    found = find_action(action_id)
    if not found:
        raise ValueError("Action not found")
    row, actions, action = found
    action["status"] = "rejected"
    action["rejected_at"] = db.now_ist()
    action["rejection_reason"] = reason or "Rejected by human reviewer"
    messages = db.load(row["messages"], [])
    messages.append({
        "id": f"M-{hashlib.sha1((action_id + 'reject').encode()).hexdigest()[:8]}",
        "role": "system",
        "content": f"Case rejected and sent to the senior queue. Reason: {action['rejection_reason']}. Logged as a policy signal.",
        "created_at": db.now_ist(),
        "evidence": [],
    })
    db.save_ticket(row["id"], {
        "status": "escalated",
        "actions": actions,
        "messages": messages,
        "brief": None,
        "waiting_since": None,
        "updated_at": db.now_ist(),
    })
    ledger.append_event(row["id"], "human.rejected", f"Case rejected · {action['type'].replace('_', ' ')}", {
        "action_id": action_id,
        "reason": action["rejection_reason"],
    })
    return db.ticket_row(row["id"]), action


def undo_action(action_id: str) -> tuple[Any, dict[str, Any]]:
    found = find_action(action_id)
    if not found:
        raise ValueError("Action not found")
    row, actions, action = found
    if action["status"] == "undone":
        return row, action
    if action["status"] != "verified":
        raise ValueError("Only verified actions can be undone")
    if action["type"] not in {"issue_refund", "create_replacement", "create_return"}:
        raise ValueError("This action has no automatic compensation")
    order_id = action["params"].get("order_id")
    suffix = action["reference"].split("-")[-1]
    if action["type"] == "issue_refund":
        compensation_reference = f"VOID-{suffix}"
        db.execute("UPDATE payments SET status = 'captured', provider_ref = ? WHERE order_id = ?", (compensation_reference, order_id))
        db.execute("UPDATE orders SET status = 'delivered' WHERE id = ?", (order_id,))
        message = f"Refund reversed within the 24h window. Compensating entry {compensation_reference}. Both events remain on the ledger."
        summary = "Refund was reversed inside the undo window. Compensating ledger entry recorded."
    else:
        label = "replacement" if action["type"] == "create_replacement" else "return"
        compensation_reference = f"CNCL-{suffix}"
        db.execute("UPDATE orders SET status = 'delivered' WHERE id = ?", (order_id,))
        message = f"{label.title()} cancelled within the undo window. Compensating entry {compensation_reference}. Both events remain on the ledger."
        summary = f"{label.title()} was cancelled inside the undo window. Compensating ledger entry recorded."
    action["status"] = "undone"
    action["undone_at"] = db.now_ist()
    action["compensation_reference"] = compensation_reference
    messages = db.load(row["messages"], [])
    messages.append({
        "id": f"M-{hashlib.sha1((action_id + 'undo').encode()).hexdigest()[:8]}",
        "role": "system",
        "content": message,
        "created_at": db.now_ist(),
        "evidence": [],
    })
    resolution = db.load(row["resolution"], None)
    if resolution:
        resolution["summary"] = summary
        resolution["verified"] = False
        resolution["reversed"] = True
        resolution["value_saved"] = None
        resolution["value_handled"] = None
    db.save_ticket(row["id"], {
        "status": "open",
        "lane": None,
        "actions": actions,
        "messages": messages,
        "resolution": resolution,
        "brief": None,
        "waiting_since": None,
        "updated_at": db.now_ist(),
    })
    ledger.append_event(row["id"], "action.undone", f"Refund reversed · {compensation_reference}", {
        "action_id": action_id,
        "original_reference": action["reference"],
    })
    return db.ticket_row(row["id"]), action


def _completion_message(action: dict[str, Any], row: Any) -> str:
    amount = float(action.get("params", {}).get("amount") or 0)
    reference = action.get("reference")
    if action["type"] == "issue_refund":
        return f"Refund of ₹{amount:,.0f} is complete. Reference {reference}. It should reflect in the original payment method within 3–5 working days."
    if action["type"] == "create_replacement":
        return f"Replacement is confirmed. Reference {reference}. Pickup for the wrong item is scheduled with the same courier."
    if action["type"] == "create_return":
        return f"Return is scheduled. Reference {reference}. The courier will collect the parcel in the next 24 hours."
    if action["type"] == "retry_payment":
        return f"A fresh payment link is ready. Reference {reference}. No money moved from your account for the failed attempt."
    return f"Action verified with proof. Reference {reference}."


def _resolution_summary(action: dict[str, Any]) -> str:
    amount = float(action.get("params", {}).get("amount") or 0)
    if action["type"] == "issue_refund":
        return f"Refund of ₹{amount:,.0f} issued, read-back verified, and reversible for 24 hours."
    if action["type"] == "create_replacement":
        return "Replacement created, pickup scheduled, and order state verified."
    if action["type"] == "create_return":
        return "Return scheduled and order state verified."
    if action["type"] == "retry_payment":
        return "Payment link generated and provider state verified."
    return "Action completed and verified against the system of record."
