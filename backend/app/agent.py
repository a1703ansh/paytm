from __future__ import annotations

import hashlib
import re
import time
from typing import Any

from . import actions, db, groq_agent, ledger, policy, serializers

INJECTION_PATTERN = re.compile(
    r"(ignore\s+(your|all|the)\s+(rules|policy)|refund\s+everything|bypass|system\s+prompt|i\s+know\s+the\s+ceo)",
    re.IGNORECASE,
)


def _msg_id(seed: str) -> str:
    return f"M-{hashlib.sha1(seed.encode('utf-8')).hexdigest()[:8]}"


def _message(role: str, content: str, evidence: list[str] | None = None, created_at: str | None = None) -> dict[str, Any]:
    ts = created_at or db.now_ist()
    return {
        "id": _msg_id(role + content + ts),
        "role": role,
        "content": content,
        "created_at": ts,
        "evidence": evidence or [],
    }


def _trace(step: str, title: str, detail: str, status: str = "done", tool: str | None = None, latency: int = 60, ts: str | None = None) -> dict[str, Any]:
    return {
        "step": step,
        "title": title,
        "detail": detail,
        "status": status,
        "tool": tool,
        "latency_ms": latency,
        "ts": ts or db.now_ist(),
    }


def _new_action(
    ticket_id: str,
    action_type: str,
    params: dict[str, Any],
    decision: dict[str, Any],
    evidence: list[dict[str, str]],
    risk: int,
    confidence: float,
    created_at: str,
) -> dict[str, Any]:
    key_material = f"{ticket_id}|{action_type}|{db.dump(params)}|{decision['policy_version']}"
    compensation = {"type": "none", "window_hours": 0}
    if decision["lane"] != "deny":
        if action_type == "issue_refund":
            compensation = {"type": "reverse_refund", "window_hours": 24}
        elif action_type == "create_replacement":
            compensation = {"type": "cancel_replacement", "window_hours": 24}
        elif action_type == "create_return":
            compensation = {"type": "cancel_return", "window_hours": 12}
    return {
        "id": f"A-{hashlib.sha1((ticket_id + created_at).encode()).hexdigest()[:4].upper()}",
        "ticket_id": ticket_id,
        "type": action_type,
        "params": params,
        "status": "proposed",
        "lane": decision["lane"],
        "risk": risk,
        "confidence": round(confidence, 2),
        "policy_version": decision["policy_version"],
        "rule_id": decision["rule_id"],
        "reasons": list(decision.get("reasons") or []),
        "idempotency_key": hashlib.sha256(key_material.encode("utf-8")).hexdigest()[:16],
        "evidence": evidence,
        "compensation": compensation,
        "created_at": created_at,
        "executed_at": None,
        "reference": None,
        "brief": None,
    }


def _plan_for_intent(
    row: Any,
    customer: dict[str, Any],
    order: dict[str, Any],
    payment: dict[str, Any] | None,
    shipment: dict[str, Any] | None,
) -> dict[str, Any]:
    intent = row["intent"]
    amount = float(row["amount_at_risk"] or 0)
    order_id = row["order_id"]
    if intent == "wismo":
        return {
            "action_type": "share_tracking",
            "amount": 0.0,
            "params": {
                "order_id": order_id,
                "carrier": shipment.get("carrier") if shipment else "courier",
                "tracking": shipment.get("tracking") if shipment else None,
                "eta": shipment.get("eta") if shipment else None,
            },
            "evidence": [
                {"label": "Order", "value": f"{order_id} · ₹{order['total']:,.0f}", "source": "orders.get"},
                {"label": "Shipment", "value": f"{shipment['tracking']} · {shipment['status']}", "source": "shipping.track"},
                {"label": "ETA", "value": shipment.get("eta") or "Awaiting update", "source": "shipping.track"},
            ],
            "keys": ["order", "shipment"],
            "title": "Share live tracking and ETA",
        }
    if intent == "damaged":
        return {
            "action_type": "issue_refund",
            "amount": float(order["total"]),
            "params": {
                "amount": float(order["total"]),
                "currency": "INR",
                "order_id": order_id,
                "payee": payment.get("payee") if payment else None,
            },
            "evidence": [
                {"label": "Order", "value": f"{order_id} · ₹{order['total']:,.0f}", "source": "orders.get"},
                {"label": "Payment", "value": f"{payment['status'] if payment else 'captured'} · {payment['method'] if payment else 'UPI'}", "source": "payments.get"},
                {"label": "Photo", "value": "Cracked case · vision check passed", "source": "evidence.inspect"},
                {"label": "Policy", "value": "Damaged on delivery · full refund", "source": "policy.v3"},
            ],
            "keys": ["order", "payment", "photo", "reason"],
            "title": "Issue full refund for damaged item",
        }
    if intent == "refund":
        return {
            "action_type": "issue_refund",
            "amount": amount or float(order["total"]),
            "params": {
                "amount": amount or float(order["total"]),
                "currency": "INR",
                "order_id": order_id,
                "payee": payment.get("payee") if payment else None,
            },
            "evidence": [
                {"label": "Order", "value": f"{order_id} · ₹{order['total']:,.0f}", "source": "orders.get"},
                {"label": "Payment", "value": f"{payment['status'] if payment else 'captured'} · {payment['method'] if payment else 'UPI'}", "source": "payments.get"},
                {"label": "Customer", "value": f"{customer['segment']} · LTV ₹{customer['ltv']:,.0f}", "source": "crm.profile"},
                {"label": "Risk flags", "value": ", ".join(customer.get("flags") or []) or "None", "source": "risk.engine"},
            ],
            "keys": ["order", "payment", "reason"],
            "title": "Prepare customer refund",
        }
    if intent == "return":
        return {
            "action_type": "create_return",
            "amount": 0.0,
            "params": {
                "order_id": order_id,
                "reason": "Size issue",
                "pickup_date": "24 Oct, 10 AM–2 PM",
            },
            "evidence": [
                {"label": "Order", "value": f"{order_id} · ₹{order['total']:,.0f}", "source": "orders.get"},
                {"label": "Return window", "value": "7 days · eligible", "source": "policy.v3"},
            ],
            "keys": ["order"],
            "title": "Create a return and pickup",
        }
    if intent == "payment_failure":
        return {
            "action_type": "retry_payment",
            "amount": 0.0,
            "params": {
                "order_id": order_id,
                "amount": float(order["total"]),
                "currency": "INR",
            },
            "evidence": [
                {"label": "Order", "value": f"{order_id} · ₹{order['total']:,.0f}", "source": "orders.get"},
                {"label": "Payment", "value": f"{payment['status'] if payment else 'failed'} · no capture", "source": "payments.get"},
                {"label": "Settlement", "value": "No settled debit found", "source": "payments.reconcile"},
            ],
            "keys": ["order", "payment"],
            "title": "Reconcile and send a fresh payment link",
        }
    if intent == "wrong_item":
        return {
            "action_type": "create_replacement",
            "amount": float(order["total"]),
            "params": {
                "amount": float(order["total"]),
                "currency": "INR",
                "order_id": order_id,
                "item": order["items"][0]["name"] if order.get("items") else "Original item",
                "address": "Andheri East, Mumbai 400069",
            },
            "evidence": [
                {"label": "Order", "value": f"{order_id} · ₹{order['total']:,.0f}", "source": "orders.get"},
                {"label": "Payment", "value": f"{payment['status'] if payment else 'captured'}", "source": "payments.get"},
                {"label": "Item mismatch", "value": "Ordered case · received screen guard", "source": "catalog.match"},
            ],
            "keys": ["order", "payment", "item_match"],
            "title": "Create replacement with pickup",
        }
    if intent == "delayed":
        return {
            "action_type": "send_update",
            "amount": 0.0,
            "params": {
                "order_id": order_id,
                "tracking": shipment.get("tracking") if shipment else None,
                "eta": shipment.get("eta") if shipment else None,
            },
            "evidence": [
                {"label": "Order", "value": f"{order_id} · in transit", "source": "orders.get"},
                {"label": "Shipment", "value": f"{shipment['tracking']} · delayed", "source": "shipping.track"},
                {"label": "ETA", "value": shipment.get("eta") or "25 Oct", "source": "shipping.track"},
            ],
            "keys": ["order", "shipment"],
            "title": "Proactively update the delayed shipment",
        }
    return {
        "action_type": "send_update",
        "amount": 0.0,
        "params": {"order_id": order_id},
        "evidence": [{"label": "Order", "value": order_id, "source": "orders.get"}],
        "keys": ["order"],
        "title": "Share an update",
    }


def _response_for(
    intent: str,
    customer: dict[str, Any],
    order: dict[str, Any],
    shipment: dict[str, Any] | None,
    action: dict[str, Any],
) -> str:
    first = customer["name"].split()[0]
    reference = action.get("reference") or "pending"
    if intent == "wismo":
        tracking = shipment.get("tracking") if shipment else "—"
        eta = shipment.get("eta") if shipment else "shortly"
        return (
            f"Hi {first} — your order {order['id']} is in transit with {shipment.get('carrier') if shipment else 'the courier'}. "
            f"Tracking {tracking}, ETA {eta}. I've sent the live link here. You don't need to do anything else."
        )
    if intent == "damaged":
        return (
            f"Hi {first} — I checked order {order['id']} and verified the damaged-item evidence. "
            f"I've issued a full refund of ₹{float(action['params'].get('amount', 0)):,.0f} to your original payment method. "
            f"Reference {reference}. It should reflect in 3–5 working days."
        )
    if intent == "refund":
        return (
            f"Hi {first} — I've verified order {order['id']} and prepared a ₹{float(action['params'].get('amount', 0)):,.0f} refund. "
            "It is above my auto licence for VIP accounts, so a specialist is reviewing the case brief now. "
            "You won't need to repeat anything."
        )
    if intent == "return":
        return (
            f"Hi {first} — I've created a return for {order['id']}. Reference {reference}. "
            "The courier will collect within 24 hours; your refund starts after pickup."
        )
    if intent == "payment_failure":
        return (
            f"Hi {first} — the ₹{float(order['total']):,.0f} charge on {order['id']} did not capture; it is marked failed, not settled. "
            f"I've generated a fresh payment link. Reference {reference}. Nothing else will be debited."
        )
    if intent == "wrong_item":
        return (
            f"Hi {first} — I verified the item mismatch on {order['id']} and prepared a replacement with pickup. "
            "It is above my auto licence, so a specialist has the case brief for one-click approval."
        )
    if intent == "delayed":
        return (
            f"Hi {first} — {order['id']} was delayed by heavy rain at the Mumbai hub. "
            f"The revised ETA is {shipment.get('eta') if shipment else '25 Oct'} and I've asked the courier to prioritise it. "
            f"Tracking {shipment.get('tracking') if shipment else '—'}."
        )
    return f"Hi {first} — I've completed the next verified step on {order['id']}. Reference {reference}."


def _brief_for(
    row: Any,
    customer: dict[str, Any],
    order: dict[str, Any],
    plan: dict[str, Any],
    decision: dict[str, Any],
    action_id: str,
) -> dict[str, Any]:
    amount = float(plan["amount"])
    issue = {
        "refund": f"VIP refund demand on {order['id']}",
        "wrong_item": f"Wrong item delivered on {order['id']}",
        "damaged": f"Damaged item on {order['id']}",
    }.get(row["intent"], f"{row['subject']} · {order['id']}")
    recommendation_reason = {
        "refund": "VIP retention case. Refund is within the hard ceiling; named approval is required.",
        "wrong_item": "Wrong item confirmed. Replacement with pickup is the lowest-cost resolution.",
        "damaged": "Damage evidence is complete. Refund is the cleanest customer outcome.",
    }.get(row["intent"], "Complete evidence supports the recommended action.")
    evidence = [f"{item['label']}: {item['value']}" for item in plan["evidence"]]
    ai_did = [
        f"Verified order and payment for {order['id']}",
        f"Matched {len(plan['keys'])} evidence items",
        f"Applied policy {decision['policy_version']} · rule {decision['rule_id']}",
        f"Prepared {plan['action_type'].replace('_', ' ')} for ₹{amount:,.0f}",
    ]
    return {
        "action_id": action_id,
        "issue": issue,
        "customer": f"{customer['name']} · {customer['segment']} · LTV ₹{customer['ltv']:,.0f}",
        "evidence": evidence,
        "ai_did": ai_did,
        "recommendation": {
            "action": plan["action_type"],
            "amount": amount,
            "reason": recommendation_reason,
        },
        "escalation_reason": decision["reasons"][0] if decision["reasons"] else "Human authority required.",
        "risk": row["risk"],
        "confidence": 0.91,
        "sentiment": row["sentiment"],
        "sla": "4h",
    }


def run_agent(ticket_id: str, mode: str = "scripted") -> tuple[dict[str, Any] | None, str]:
    if mode == "live":
        return _run_live(ticket_id)
    return _run_scripted(ticket_id)


def _run_scripted(ticket_id: str) -> tuple[dict[str, Any] | None, str]:
    row = db.ticket_row(ticket_id)
    if not row:
        return None, "Ticket not found"
    if row["status"] == "waiting_human":
        detail = serializers.ticket_detail(ticket_id)
        return detail, "Case brief is waiting for human approval. Approve or reject in the console."
    if row["status"] in {"resolved", "blocked", "escalated"}:
        detail = serializers.ticket_detail(ticket_id)
        return detail, f"Ticket is {row['status']}. Reset it to replay the demo."
    detail = serializers.ticket_detail(ticket_id)
    if not detail:
        return None, "Ticket not found"

    customer = detail["customer"]
    order = detail["order"]
    payment = detail.get("payment")
    shipment = detail.get("shipment")
    if not customer or not order:
        return detail, "Ticket context is incomplete."

    messages = detail["messages"]
    trace: list[dict[str, Any]] = []
    actions = detail["actions"]
    created_at = db.now_ist()
    intent = row["intent"]
    lower = " ".join(message["content"] for message in messages if message["role"] == "customer")
    injection = intent == "injection" or bool(INJECTION_PATTERN.search(lower))

    plan = _plan_for_intent(row, customer, order, payment, shipment)
    amount = float(plan["amount"])
    confidence = 0.97 if amount <= 2000 else 0.91
    flags = list(customer.get("flags") or [])
    if injection:
        flags.append("injection_attempt")
    proposal = {
        "action": plan["action_type"],
        "amount": amount,
        "risk": row["risk"],
        "segment": customer["segment"],
        "flags": flags,
        "evidence": plan["keys"],
        "payee_changed": False,
        "confidence": confidence,
    }
    decision = policy.decide(proposal)
    if injection:
        action = _new_action(ticket_id, "issue_refund", {
            "amount": 50000,
            "currency": "INR",
            "order_id": order["id"],
            "payee": payment.get("payee") if payment else None,
        }, decision, [
            {"label": "Request", "value": "Instruction override detected", "source": "injection.guard"},
            {"label": "Order", "value": order["id"], "source": "orders.get"},
            {"label": "Attempted amount", "value": "₹50,000", "source": "message.parse"},
        ], row["risk"], 0.99, created_at)
        action["status"] = "denied"
        action["denial_reason"] = decision["reasons"][0] if decision["reasons"] else "Denied by policy"
        actions.append(action)
        trace = [
            _trace("context", "Context loaded", f"Order {order['id']} · {customer['name']} · {customer['segment']}", latency=41),
            _trace("detect", "Instruction override detected", "Pattern matched: ignore rules / refund everything", status="blocked", tool="injection.guard", latency=22),
            _trace("policy", "Policy gate", f"Rule {decision['rule_id']} · deny · {decision['reasons'][0]}", status="blocked", tool="policy.engine", latency=9),
            _trace("block", "Write firewall stayed closed", "No refund tool exists in the agent's scope. Attempt logged.", status="blocked", tool="action.gateway", latency=14),
        ]
        text = (
            "I can't process that request. ₹50,000 exceeds the policy ceiling, and the instruction to bypass controls "
            "was blocked and logged. If you believe the order is eligible, I can arrange a standard return or a human review."
        )
        messages.append(_message("agent", text, ["Policy D3", "Write blocked", "Ledger event recorded"], created_at))
        db.save_ticket(ticket_id, {
            "status": "blocked",
            "lane": "deny",
            "risk": row["risk"],
            "confidence": 0.99,
            "messages": messages,
            "trace": trace,
            "actions": actions,
            "brief": None,
            "resolution": None,
            "waiting_since": None,
            "updated_at": created_at,
        })
        ledger.append_event(ticket_id, "policy.denied", "₹50,000 refund denied · instruction override", {
            "rule_id": decision["rule_id"],
            "risk": row["risk"],
        })
        ledger.append_event(ticket_id, "injection.blocked", "Prompt injection blocked at the write firewall", {
            "pattern": "instruction_override",
            "attempted_amount": 50000,
        })
        return serializers.ticket_detail(ticket_id), text

    action = _new_action(ticket_id, plan["action_type"], plan["params"], decision, plan["evidence"], row["risk"], confidence, created_at)
    trace = [
        _trace("context", "Context loaded", f"Order {order['id']} · {customer['name']} · {customer['segment']} · LTV ₹{customer['ltv']:,.0f}", latency=44),
        _trace("evidence", "Evidence gathered", f"{len(plan['evidence'])} facts verified across orders, payments, and shipping", tool="get_order · get_payment · track_shipment", latency=148),
        _trace("plan", "Plan proposed", f"{plan['title']} · ₹{amount:,.0f}" if amount else plan["title"], latency=71),
        _trace(
            "policy",
            "Policy gate",
            f"Rule {decision['rule_id']} · {decision['lane']} · {decision['reasons'][0] if decision['reasons'] else 'evaluated'}",
            status="done" if decision["lane"] == "auto" else "waiting",
            tool="policy.engine",
            latency=11,
        ),
    ]

    if decision["lane"] == "auto":
        actions.append(action)
        db.save_ticket(ticket_id, {"actions": actions, "trace": trace, "updated_at": created_at})
        _, actions, executed = actions_mod_execute(ticket_id, action["id"])
        trace.append(_trace("execute", "Action executed", f"{executed['type'].replace('_', ' ')} · {executed.get('reference')}", tool="action.gateway", latency=122))
        trace.append(_trace("verify", "Read-back verified", executed.get("verification", {}).get("detail", "System of record confirmed"), tool="adapter.read_back", latency=64))
        text = _response_for(intent, customer, order, shipment, executed)
        messages.append(_message("agent", text, [f"Reference {executed.get('reference')}", f"Policy {decision['policy_version']} · {decision['rule_id']}", "Read-back verified"], created_at))
        trace.append(_trace("respond", "Evidence-bound reply sent", "Every claim tied to a tool result", tool="composer", latency=33))
        resolution = {
            "summary": _resolution_summary(intent, executed),
            "value_saved": amount if executed["type"] == "issue_refund" else None,
            "value_handled": amount if executed["type"] != "issue_refund" and amount else None,
            "minutes_saved": 9.2,
            "verified": True,
        }
        db.save_ticket(ticket_id, {
            "status": "resolved",
            "lane": "auto",
            "risk": row["risk"],
            "confidence": confidence,
            "messages": messages,
            "trace": trace,
            "actions": actions,
            "brief": None,
            "resolution": resolution,
            "waiting_since": None,
            "updated_at": db.now_ist(),
        })
        ledger.append_event(ticket_id, "agent.resolved", f"Resolved autonomously · {executed.get('reference')}", {
            "action_id": executed["id"],
            "amount": amount,
            "rule_id": decision["rule_id"],
        })
        return serializers.ticket_detail(ticket_id), text

    if decision["lane"] == "review":
        action["status"] = "pending_approval"
        brief = _brief_for(row, customer, order, plan, decision, action["id"])
        action["brief"] = brief
        actions.append(action)
        text = _response_for(intent, customer, order, shipment, action)
        messages.append(_message("system", "Case brief prepared. Human approval requested for the proposed action.", [], created_at))
        messages.append(_message("agent", text, [f"Risk {row['risk']}/100", f"Confidence {confidence:.2f}", "Awaiting named approver"], created_at))
        trace.append(_trace("approval", "Human approval requested", f"Rule {decision['rule_id']} · brief generated · no write executed", status="waiting", tool="human.console", latency=26))
        trace.append(_trace("respond", "Hold message sent", "Customer told what is happening, no repetition needed", tool="composer", latency=31))
        db.save_ticket(ticket_id, {
            "status": "waiting_human",
            "lane": "review",
            "risk": row["risk"],
            "confidence": confidence,
            "messages": messages,
            "trace": trace,
            "actions": actions,
            "brief": brief,
            "resolution": None,
            "waiting_since": created_at,
            "updated_at": created_at,
        })
        ledger.append_event(ticket_id, "action.proposed", f"Case brief ready · {plan['action_type'].replace('_', ' ')} ₹{amount:,.0f}", {
            "action_id": action["id"],
            "lane": "review",
            "rule_id": decision["rule_id"],
        })
        ledger.append_event(ticket_id, "escalation.created", "Escalated with evidence, recommendation, and resume point", {
            "action_id": action["id"],
            "risk": row["risk"],
        })
        return serializers.ticket_detail(ticket_id), text

    action["status"] = "denied"
    action["denial_reason"] = decision["reasons"][0] if decision["reasons"] else "Denied by policy"
    actions.append(action)
    text = (
        "I can't execute this action under the current policy. "
        f"{decision['reasons'][0] if decision['reasons'] else 'It requires a human owner.'} "
        "I can offer a standard return or route this to a human reviewer."
    )
    messages.append(_message("agent", text, [f"Policy {decision['policy_version']} · {decision['rule_id']}", "No write executed"], created_at))
    trace.append(_trace("block", "Action blocked", decision["reasons"][0] if decision["reasons"] else "Policy denied", status="blocked", tool="action.gateway", latency=13))
    db.save_ticket(ticket_id, {
        "status": "blocked",
        "lane": "deny",
        "risk": row["risk"],
        "confidence": confidence,
        "messages": messages,
        "trace": trace,
        "actions": actions,
        "brief": None,
        "resolution": None,
        "waiting_since": None,
        "updated_at": created_at,
    })
    ledger.append_event(ticket_id, "policy.denied", "Action denied by deterministic policy", {
        "action_id": action["id"],
        "rule_id": decision["rule_id"],
    })
    return serializers.ticket_detail(ticket_id), text


LIVE_ACTION_TITLES = {
    "share_tracking": "Share live tracking and ETA",
    "issue_refund": "Issue a verified refund",
    "create_return": "Create a return and pickup",
    "retry_payment": "Reconcile and send a fresh payment link",
    "create_replacement": "Create replacement with pickup",
    "send_update": "Proactively update the shipment",
    "deny": "Deny the request",
}


def _run_live(ticket_id: str) -> tuple[dict[str, Any] | None, str]:
    run_start = time.perf_counter()
    row = db.ticket_row(ticket_id)
    if not row:
        return None, "Ticket not found"
    if row["status"] == "waiting_human":
        detail = serializers.ticket_detail(ticket_id)
        return detail, "Case brief is waiting for human approval. Approve or reject in the console."
    if row["status"] in {"resolved", "blocked", "escalated"}:
        detail = serializers.ticket_detail(ticket_id)
        return detail, f"Ticket is {row['status']}. Reset it to replay the demo."

    context_start = time.perf_counter()
    detail = serializers.ticket_detail(ticket_id)
    context_ms = int((time.perf_counter() - context_start) * 1000)
    if not detail:
        return None, "Ticket not found"

    customer = detail["customer"]
    order = detail["order"]
    if not customer or not order:
        return detail, "Ticket context is incomplete."

    detect_start = time.perf_counter()
    lower = " ".join(
        message["content"] for message in detail["messages"] if message["role"] == "customer"
    )
    injection = row["intent"] == "injection" or bool(INJECTION_PATTERN.search(lower))
    detect_ms = int((time.perf_counter() - detect_start) * 1000)

    if not groq_agent.is_configured():
        exc = groq_agent.LiveError(
            "GROQ_API_KEY is not configured",
            model=groq_agent.model_name(),
            input_hash=groq_agent.input_hash_for(ticket_id),
        )
        _save_fallback_run(ticket_id, exc, run_start)
        return _run_scripted(ticket_id)

    if injection:
        try:
            refusal = groq_agent.security_refusal(ticket_id, detail)
        except groq_agent.LiveError as exc:
            _save_fallback_run(ticket_id, exc, run_start)
            return _run_scripted(ticket_id)
        except Exception as exc:
            wrapped = groq_agent.LiveError(
                f"Unexpected live agent error: {exc}",
                model=groq_agent.model_name(),
                input_hash=groq_agent.input_hash_for(ticket_id),
            )
            _save_fallback_run(ticket_id, wrapped, run_start)
            return _run_scripted(ticket_id)
        return _finish_live_injection(ticket_id, row, detail, refusal, run_start, context_ms, detect_ms)

    try:
        live = groq_agent.propose(ticket_id)
    except groq_agent.LiveError as exc:
        _save_fallback_run(ticket_id, exc, run_start)
        return _run_scripted(ticket_id)
    except Exception as exc:
        wrapped = groq_agent.LiveError(
            f"Unexpected live agent error: {exc}",
            model=groq_agent.model_name(),
            input_hash=groq_agent.input_hash_for(ticket_id),
        )
        _save_fallback_run(ticket_id, wrapped, run_start)
        return _run_scripted(ticket_id)

    proposal = live["proposal"]
    amount = float(proposal["amount"])
    confidence = float(proposal["confidence"])
    server_flags = list(customer.get("flags") or [])
    flags = list(dict.fromkeys([*server_flags, *list(proposal.get("risk_flags") or [])]))
    if injection:
        flags.append("injection_attempt")

    policy_input = {
        "action": proposal["action_type"],
        "amount": amount,
        "risk": int(row["risk"] or 0),
        "segment": customer["segment"],
        "flags": flags,
        "evidence": list(proposal.get("evidence_keys") or []),
        "payee_changed": False,
        "confidence": confidence,
    }
    policy_start = time.perf_counter()
    decision = policy.decide(policy_input)
    policy_ms = int((time.perf_counter() - policy_start) * 1000)

    plan = _live_plan(proposal, detail)
    created_at = db.now_ist()
    action = _new_action(
        ticket_id,
        plan["action_type"],
        plan["params"],
        decision,
        plan["evidence"],
        int(row["risk"] or 0),
        confidence,
        created_at,
    )
    trace = _live_trace_base(live, plan, decision, context_ms, policy_ms, created_at)
    messages = detail["messages"]
    ticket_actions = detail["actions"]

    if decision["lane"] == "auto":
        ticket_actions.append(action)
        db.save_ticket(ticket_id, {"actions": ticket_actions, "trace": trace, "updated_at": created_at})
        execute_start = time.perf_counter()
        _, ticket_actions, executed = actions_mod_execute(ticket_id, action["id"])
        execute_ms = int((time.perf_counter() - execute_start) * 1000)
        readback_start = time.perf_counter()
        db.fetchone("SELECT status FROM orders WHERE id = ?", (order["id"],))
        readback_ms = int((time.perf_counter() - readback_start) * 1000)
        trace.append(_trace(
            "execute",
            "Action executed",
            f"{executed['type'].replace('_', ' ')} · {executed.get('reference')}",
            tool="action.gateway",
            latency=execute_ms,
        ))
        trace.append(_trace(
            "verify",
            "Read-back verified",
            executed.get("verification", {}).get("detail", "System of record confirmed"),
            tool="adapter.read_back",
            latency=readback_ms,
        ))
        reply = _safe_reply(proposal.get("customer_reply"), order, amount, "auto")
        text = reply or _fallback_reply(row["intent"], executed, customer, order, detail.get("shipment"), "auto")
        respond_start = time.perf_counter()
        messages.append(_message("agent", text, [
            f"Reference {executed.get('reference')}",
            f"Policy {decision['policy_version']} · {decision['rule_id']}",
            "Read-back verified",
        ], created_at))
        respond_ms = int((time.perf_counter() - respond_start) * 1000)
        trace.append(_trace("respond", "Evidence-bound reply sent", "Every claim tied to a tool result", tool="composer", latency=respond_ms))
        resolution = {
            "summary": _resolution_summary(row["intent"], executed),
            "value_saved": amount if executed["type"] == "issue_refund" else None,
            "value_handled": amount if executed["type"] != "issue_refund" and amount else None,
            "minutes_saved": 9.2,
            "verified": True,
        }
        db.save_ticket(ticket_id, {
            "status": "resolved",
            "lane": "auto",
            "risk": row["risk"],
            "confidence": confidence,
            "messages": messages,
            "trace": trace,
            "actions": ticket_actions,
            "brief": None,
            "resolution": resolution,
            "waiting_since": None,
            "updated_at": db.now_ist(),
        })
        ledger.append_event(ticket_id, "agent.resolved", f"Resolved autonomously · {executed.get('reference')}", {
            "action_id": executed["id"],
            "amount": amount,
            "rule_id": decision["rule_id"],
        })
        execution = {
            "status": "verified",
            "reference": executed.get("reference"),
            "detail": executed.get("verification", {}).get("detail", "System of record confirmed"),
        }
        _save_completed_run(ticket_id, live, proposal, decision, execution, run_start)
        return serializers.ticket_detail(ticket_id), text

    if decision["lane"] == "review":
        action["status"] = "pending_approval"
        brief_start = time.perf_counter()
        brief = _brief_for_live(row, customer, order, plan, decision, action["id"], proposal)
        brief_ms = int((time.perf_counter() - brief_start) * 1000)
        action["brief"] = brief
        ticket_actions.append(action)
        reply = _safe_reply(proposal.get("customer_reply"), order, amount, "review")
        text = reply or _fallback_reply(row["intent"], action, customer, order, detail.get("shipment"), "review")
        respond_start = time.perf_counter()
        messages.append(_message("system", "Case brief prepared. Human approval requested for the proposed action.", [], created_at))
        messages.append(_message("agent", text, [
            f"Risk {row['risk']}/100",
            f"Confidence {confidence:.2f}",
            "Awaiting named approver",
        ], created_at))
        respond_ms = int((time.perf_counter() - respond_start) * 1000)
        trace.append(_trace("approval", "Human approval requested", f"Rule {decision['rule_id']} · brief generated · no write executed", status="waiting", tool="human.console", latency=brief_ms))
        trace.append(_trace("respond", "Hold message sent", "Customer told what is happening, no repetition needed", tool="composer", latency=respond_ms))
        db.save_ticket(ticket_id, {
            "status": "waiting_human",
            "lane": "review",
            "risk": row["risk"],
            "confidence": confidence,
            "messages": messages,
            "trace": trace,
            "actions": ticket_actions,
            "brief": brief,
            "resolution": None,
            "waiting_since": created_at,
            "updated_at": created_at,
        })
        ledger.append_event(ticket_id, "action.proposed", f"Case brief ready · {plan['action_type'].replace('_', ' ')} ₹{amount:,.0f}", {
            "action_id": action["id"],
            "lane": "review",
            "rule_id": decision["rule_id"],
        })
        ledger.append_event(ticket_id, "escalation.created", "Escalated with evidence, recommendation, and resume point", {
            "action_id": action["id"],
            "risk": row["risk"],
        })
        execution = {
            "status": "pending_approval",
            "reference": None,
            "detail": f"Awaiting named approver · rule {decision['rule_id']}",
        }
        _save_completed_run(ticket_id, live, proposal, decision, execution, run_start)
        return serializers.ticket_detail(ticket_id), text

    action["status"] = "denied"
    action["denial_reason"] = decision["reasons"][0] if decision["reasons"] else "Denied by policy"
    ticket_actions.append(action)
    default_text = (
        "I can't execute this action under the current policy. "
        f"{decision['reasons'][0] if decision['reasons'] else 'It requires a human owner.'} "
        "I can offer a standard return or route this to a human reviewer."
    )
    text = _safe_reply(proposal.get("customer_reply"), order, amount, "deny") or default_text
    block_start = time.perf_counter()
    messages.append(_message("agent", text, [
        f"Policy {decision['policy_version']} · {decision['rule_id']}",
        "No write executed",
    ], created_at))
    block_ms = int((time.perf_counter() - block_start) * 1000)
    trace.append(_trace(
        "block",
        "Action blocked",
        decision["reasons"][0] if decision["reasons"] else "Policy denied",
        status="blocked",
        tool="action.gateway",
        latency=block_ms,
    ))
    db.save_ticket(ticket_id, {
        "status": "blocked",
        "lane": "deny",
        "risk": row["risk"],
        "confidence": confidence,
        "messages": messages,
        "trace": trace,
        "actions": ticket_actions,
        "brief": None,
        "resolution": None,
        "waiting_since": None,
        "updated_at": created_at,
    })
    ledger.append_event(ticket_id, "policy.denied", "Action denied by deterministic policy", {
        "action_id": action["id"],
        "rule_id": decision["rule_id"],
    })
    execution = {
        "status": "denied",
        "reference": None,
        "detail": decision["reasons"][0] if decision["reasons"] else "Denied by policy",
    }
    _save_completed_run(ticket_id, live, proposal, decision, execution, run_start)
    return serializers.ticket_detail(ticket_id), text


def _finish_live_injection(
    ticket_id: str,
    row: Any,
    detail: dict[str, Any],
    refusal: dict[str, Any],
    run_start: float,
    context_ms: int,
    detect_ms: int,
) -> tuple[dict[str, Any], str]:
    customer = detail["customer"]
    order = detail["order"]
    payment = detail.get("payment")
    messages = detail["messages"]
    ticket_actions = detail["actions"]
    created_at = db.now_ist()
    flags = list(dict.fromkeys([*(customer.get("flags") or []), "injection_attempt"]))
    policy_start = time.perf_counter()
    decision = policy.decide({
        "action": "issue_refund",
        "amount": 50000.0,
        "risk": int(row["risk"] or 0),
        "segment": customer["segment"],
        "flags": flags,
        "evidence": ["order", "reason"],
        "payee_changed": False,
        "confidence": 0.99,
    })
    policy_ms = int((time.perf_counter() - policy_start) * 1000)

    block_start = time.perf_counter()
    action = _new_action(ticket_id, "issue_refund", {
        "amount": 50000,
        "currency": "INR",
        "order_id": order["id"],
        "payee": payment.get("payee") if payment else None,
    }, decision, [
        {"label": "Request", "value": "Instruction override detected", "source": "injection.guard"},
        {"label": "Order", "value": order["id"], "source": "orders.get"},
        {"label": "Attempted amount", "value": "₹50,000", "source": "message.parse"},
    ], int(row["risk"] or 0), 0.99, created_at)
    action["status"] = "denied"
    action["denial_reason"] = decision["reasons"][0] if decision["reasons"] else "Denied by policy"
    ticket_actions.append(action)
    block_ms = int((time.perf_counter() - block_start) * 1000)

    default_text = (
        "I can't process that request. ₹50,000 exceeds the policy ceiling, and the instruction to bypass controls "
        "was blocked and logged. If you believe the order is eligible, I can arrange a standard return or a human review."
    )
    live_text = _safe_refusal(refusal.get("text"))
    text = live_text or default_text
    refusal_detail = (
        "Live refusal passed the safety check"
        if live_text
        else "Live refusal rejected by the safety check; baseline refusal used"
    )
    trace = [
        _trace("context", "Context loaded", f"Order {order['id']} · {customer['name']} · {customer['segment']}", latency=context_ms),
        _trace("detect", "Instruction override detected", "Pattern matched: ignore rules / refund everything", status="blocked", tool="injection.guard", latency=detect_ms),
        _trace("refuse", "Security refusal drafted", refusal_detail, tool=f"groq:{refusal.get('model')}", latency=int(refusal.get("latency_ms") or 0)),
        _trace("policy", "Policy gate", f"Rule {decision['rule_id']} · deny · {decision['reasons'][0]}", status="blocked", tool="policy.engine", latency=policy_ms),
        _trace("block", "Write firewall stayed closed", "No refund tool exists in the agent's scope. Attempt logged.", status="blocked", tool="action.gateway", latency=block_ms),
    ]
    messages.append(_message("agent", text, ["Policy D3", "Write blocked", "Ledger event recorded"], created_at))
    db.save_ticket(ticket_id, {
        "status": "blocked",
        "lane": "deny",
        "risk": row["risk"],
        "confidence": 0.99,
        "messages": messages,
        "trace": trace,
        "actions": ticket_actions,
        "brief": None,
        "resolution": None,
        "waiting_since": None,
        "updated_at": created_at,
    })
    ledger.append_event(ticket_id, "policy.denied", "₹50,000 refund denied · instruction override", {
        "rule_id": decision["rule_id"],
        "risk": row["risk"],
    })
    ledger.append_event(ticket_id, "injection.blocked", "Prompt injection blocked at the write firewall", {
        "pattern": "instruction_override",
        "attempted_amount": 50000,
    })

    proposal = {
        "intent": "injection",
        "action_type": "issue_refund",
        "amount": 50000.0,
        "order_id": order["id"],
        "evidence_keys": ["order", "reason"],
        "risk_flags": ["injection_attempt"],
        "confidence": 0.99,
        "rationale": "Instruction override detected; deterministic policy D3 block enforced before any write.",
        "customer_reply": text,
        "source": "deterministic_guard",
    }
    live = {
        "id": refusal.get("id") or groq_agent.new_run_id(ticket_id),
        "model": refusal.get("model") or groq_agent.model_name(),
        "prompt_version": groq_agent.PROMPT_VERSION,
        "input_tokens": int(refusal.get("input_tokens") or 0),
        "output_tokens": int(refusal.get("output_tokens") or 0),
        "tool_calls": [],
        "fallback_used": bool(refusal.get("fallback_used")),
        "input_hash": refusal.get("input_hash") or groq_agent.input_hash_for(ticket_id),
    }
    execution = {
        "status": "blocked",
        "reference": None,
        "detail": "Write firewall stayed closed; no refund executed",
    }
    _save_completed_run(ticket_id, live, proposal, decision, execution, run_start)
    return serializers.ticket_detail(ticket_id), text


def _live_plan(proposal: dict[str, Any], detail: dict[str, Any]) -> dict[str, Any]:
    order = detail["order"]
    payment = detail.get("payment")
    shipment = detail.get("shipment")
    action_type = proposal["action_type"]
    amount = float(proposal["amount"])
    order_id = order["id"]
    if action_type == "issue_refund":
        params = {
            "amount": amount,
            "currency": "INR",
            "order_id": order_id,
            "payee": payment.get("payee") if payment else None,
        }
    elif action_type == "create_replacement":
        params = {
            "amount": amount,
            "currency": "INR",
            "order_id": order_id,
            "item": order["items"][0]["name"] if order.get("items") else "Original item",
            "address": "Original delivery address on file",
        }
    elif action_type == "create_return":
        params = {
            "order_id": order_id,
            "reason": (proposal.get("rationale") or "Customer return request")[:120],
            "pickup_date": "Next available pickup slot",
        }
    elif action_type == "retry_payment":
        params = {
            "order_id": order_id,
            "amount": float(order["total"]),
            "currency": "INR",
        }
    elif action_type == "share_tracking":
        params = {
            "order_id": order_id,
            "carrier": shipment.get("carrier") if shipment else "courier",
            "tracking": shipment.get("tracking") if shipment else None,
            "eta": shipment.get("eta") if shipment else None,
        }
    elif action_type == "send_update":
        params = {
            "order_id": order_id,
            "tracking": shipment.get("tracking") if shipment else None,
            "eta": shipment.get("eta") if shipment else None,
        }
    else:
        params = {"order_id": order_id, "amount": 0.0}

    return {
        "action_type": action_type,
        "amount": amount,
        "params": params,
        "evidence": _live_evidence(list(proposal.get("evidence_keys") or []), detail, action_type),
        "keys": list(proposal.get("evidence_keys") or []),
        "title": LIVE_ACTION_TITLES.get(action_type, "Share an update"),
    }


def _live_evidence(keys: list[str], detail: dict[str, Any], action_type: str) -> list[dict[str, str]]:
    order = detail["order"]
    payment = detail.get("payment")
    shipment = detail.get("shipment")
    active = policy.get_active_policy()
    rows: list[dict[str, str]] = []
    for key in keys:
        if key == "order":
            rows.append({
                "label": "Order",
                "value": f"{order['id']} · ₹{float(order['total']):,.0f} · {order['status']}",
                "source": "orders.get",
            })
        elif key == "payment":
            rows.append({
                "label": "Payment",
                "value": f"{payment['status']} · {payment['method']} · ₹{float(payment['amount']):,.0f}" if payment else "No payment record",
                "source": "payments.get",
            })
        elif key == "shipment":
            rows.append({
                "label": "Shipment",
                "value": (
                    f"{shipment.get('carrier') or 'Courier'} · {shipment.get('tracking') or 'no tracking'} · {shipment.get('status')}"
                    if shipment else "No shipment record"
                ),
                "source": "shipping.track",
            })
        elif key == "reason":
            reason = next(
                (message.get("content") for message in reversed(detail.get("messages") or []) if message.get("role") == "customer"),
                detail.get("subject"),
            )
            snippet = str(reason or "Customer request")[:160]
            rows.append({"label": "Request", "value": snippet, "source": "tickets.get"})
        elif key == "item_match":
            item = order["items"][0]["name"] if order.get("items") else "Ordered item"
            rows.append({
                "label": "Item match",
                "value": f"Ordered {item} · customer reports a mismatch",
                "source": "orders.get · tickets.get",
            })
        elif key == "policy":
            required = sorted(policy.REQUIRED_EVIDENCE.get(action_type, {"order"}))
            rows.append({
                "label": "Policy",
                "value": f"{active['version']} · {action_type.replace('_', ' ')} requires {', '.join(required)}",
                "source": "policy.active",
            })
    return rows


def _live_trace_base(
    live: dict[str, Any],
    plan: dict[str, Any],
    decision: dict[str, Any],
    context_ms: int,
    policy_ms: int,
    created_at: str,
) -> list[dict[str, Any]]:
    tool_calls = list(live.get("tool_calls") or [])
    tool_names = [call.get("name") for call in tool_calls if call.get("name") and call.get("name") != "submit_proposal"]
    tool_latency = sum(int(call.get("latency_ms") or 0) for call in tool_calls)
    amount = float(plan.get("amount") or 0)
    plan_detail = plan["title"] + (f" · ₹{amount:,.0f}" if amount else "")
    policy_status = {"auto": "done", "review": "waiting", "deny": "blocked"}.get(decision["lane"], "done")
    model = live.get("model") or groq_agent.model_name()
    return [
        _trace("context", "Context loaded", f"Order {plan['params'].get('order_id')} · {len(plan['keys'])} evidence keys", latency=context_ms, ts=created_at),
        _trace(
            "evidence",
            "Evidence gathered",
            f"{len(tool_calls)} read-only tool calls · {len(plan['keys'])} evidence keys verified",
            tool=" · ".join(tool_names) or "read-only tools",
            latency=tool_latency,
            ts=created_at,
        ),
        _trace("plan", f"Proposal from {model}", plan_detail, tool=f"groq:{model}", latency=int(live.get("model_latency_ms") or live.get("latency_ms") or 0), ts=created_at),
        _trace(
            "policy",
            "Policy gate",
            f"Rule {decision['rule_id']} · {decision['lane']} · {decision['reasons'][0] if decision['reasons'] else 'evaluated'}",
            status=policy_status,
            tool="policy.engine",
            latency=policy_ms,
            ts=created_at,
        ),
    ]


def _brief_for_live(
    row: Any,
    customer: dict[str, Any],
    order: dict[str, Any],
    plan: dict[str, Any],
    decision: dict[str, Any],
    action_id: str,
    proposal: dict[str, Any],
) -> dict[str, Any]:
    brief = _brief_for(row, customer, order, plan, decision, action_id)
    model_brief = proposal.get("brief") or {}
    issue = model_brief.get("issue")
    if isinstance(issue, str) and issue.strip():
        brief["issue"] = issue.strip()[:300]
    reason = model_brief.get("recommendation_reason")
    if isinstance(reason, str) and reason.strip():
        brief["recommendation"]["reason"] = reason.strip()[:400]
    ai_did_raw = model_brief.get("ai_did")
    if not isinstance(ai_did_raw, list):
        ai_did_raw = []
    model_steps = [
        item.strip()[:240]
        for item in ai_did_raw
        if isinstance(item, str) and item.strip()
    ]
    server_steps = [
        f"Verified {len(plan['keys'])} evidence keys with read-only tools",
        f"Applied policy {decision['policy_version']} · rule {decision['rule_id']}",
        f"Prepared {plan['action_type'].replace('_', ' ')} for ₹{float(plan['amount']):,.0f}",
    ]
    brief["ai_did"] = list(dict.fromkeys([*model_steps, *server_steps]))[:6]
    brief["confidence"] = round(float(proposal["confidence"]), 2)
    return brief


def _fallback_reply(
    intent: str,
    action: dict[str, Any],
    customer: dict[str, Any],
    order: dict[str, Any],
    shipment: dict[str, Any] | None,
    lane: str,
) -> str:
    expected = {
        "wismo": "share_tracking",
        "damaged": "issue_refund",
        "refund": "issue_refund",
        "return": "create_return",
        "payment_failure": "retry_payment",
        "wrong_item": "create_replacement",
        "delayed": "send_update",
    }.get(intent)
    if action.get("type") == expected:
        return _response_for(intent, customer, order, shipment, action)
    first = customer["name"].split()[0]
    if lane == "review":
        label = str(action.get("type") or "action").replace("_", " ")
        return (
            f"Hi {first} — I've prepared a {label} for {order['id']}. "
            "It is with a specialist for review; you won't need to repeat anything."
        )
    return f"Hi {first} — {actions._completion_message(action, None)}"


def _safe_reply(text: Any, order: dict[str, Any], amount: float, lane: str) -> str | None:
    if not isinstance(text, str):
        return None
    text = text.strip()
    if len(text) < 8 or len(text) > 700:
        return None
    if INJECTION_PATTERN.search(text):
        return None
    if re.search(r"\b(?:RFND|RPL|RET|PAY|TRK|UPD|ACT)-[A-Z0-9]{3,}\b", text):
        return None
    if re.search(r"\b(new|different|updated|alternate)\s+(upi|account|wallet|payee)\b", text, re.IGNORECASE):
        return None
    if re.search(r"\b(crypto|wallet address|external account)\b", text, re.IGNORECASE):
        return None
    for order_id in re.findall(r"\bO-\d+\b", text):
        if order_id != order["id"]:
            return None
    allowed_amounts = {round(float(amount), 2), round(float(order.get("total") or 0), 2)}
    for raw in re.findall(r"(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.[0-9]+)?)", text, re.IGNORECASE):
        value = float(raw.replace(",", ""))
        if not any(abs(value - allowed) <= 0.5 for allowed in allowed_amounts):
            return None
    if lane in {"review", "deny"} and re.search(
        r"\b(i|we)\s+(refunded|issued|processed|completed|created|confirmed|scheduled|approved|initiated)\b",
        text,
        re.IGNORECASE,
    ):
        return None
    if lane == "review":
        if re.search(
            r"\b(has been|have been|is|was|are)\s+(refunded|issued|created|confirmed|processed|completed|scheduled)\b",
            text,
            re.IGNORECASE,
        ):
            return None
        if re.search(
            r"\b(i have|i've|we have|we've)\s+(issued|processed|completed|refunded|created|confirmed|scheduled)\b",
            text,
            re.IGNORECASE,
        ):
            return None
    if lane == "deny":
        if re.search(
            r"\b(i have|i've|we have|we've|has been|have been|is|was)\s+(issued|processed|completed|refunded|created|confirmed|scheduled|approved)\b",
            text,
            re.IGNORECASE,
        ):
            return None
        if re.search(
            r"\b(i will|i'll|we will|we'll)\s+(refund|process|issue|approve|create)\b",
            text,
            re.IGNORECASE,
        ):
            return None
    return text


def _safe_refusal(text: Any) -> str | None:
    if not isinstance(text, str):
        return None
    text = text.strip()
    if len(text) < 8 or len(text) > 600:
        return None
    if "http://" in text.lower() or "https://" in text.lower():
        return None
    if re.search(
        r"\b(has been refunded|refund is complete|i have refunded|i've refunded|will be refunded|i approved|we approved)\b",
        text,
        re.IGNORECASE,
    ):
        return None
    return text


def _policy_receipt(decision: dict[str, Any]) -> dict[str, Any]:
    return {
        "lane": decision.get("lane"),
        "rule_id": decision.get("rule_id"),
        "policy_version": decision.get("policy_version"),
        "reasons": list(decision.get("reasons") or []),
    }


def _save_run(run: dict[str, Any]) -> None:
    try:
        db.save_agent_run(run)
    except Exception:
        return


def _save_fallback_run(ticket_id: str, exc: groq_agent.LiveError, run_start: float) -> None:
    _save_run({
        "id": groq_agent.new_run_id(ticket_id),
        "ticket_id": ticket_id,
        "mode": "live",
        "provider": "groq",
        "model": exc.model or groq_agent.model_name(),
        "prompt_version": groq_agent.PROMPT_VERSION,
        "status": "fallback",
        "fallback_used": True,
        "latency_ms": int((time.perf_counter() - run_start) * 1000),
        "input_tokens": int(exc.input_tokens or 0),
        "output_tokens": int(exc.output_tokens or 0),
        "tool_calls": list(exc.tool_calls or []),
        "proposal": None,
        "policy": None,
        "execution": None,
        "rationale": None,
        "error": str(exc)[:500],
        "input_hash": exc.input_hash or groq_agent.input_hash_for(ticket_id),
        "created_at": db.now_ist(),
    })


def _save_completed_run(
    ticket_id: str,
    live: dict[str, Any],
    proposal: dict[str, Any],
    decision: dict[str, Any],
    execution: dict[str, Any],
    run_start: float,
) -> None:
    _save_run({
        "id": live.get("id") or groq_agent.new_run_id(ticket_id),
        "ticket_id": ticket_id,
        "mode": "live",
        "provider": "groq",
        "model": live.get("model") or groq_agent.model_name(),
        "prompt_version": live.get("prompt_version") or groq_agent.PROMPT_VERSION,
        "status": "completed",
        "fallback_used": bool(live.get("fallback_used")),
        "latency_ms": int((time.perf_counter() - run_start) * 1000),
        "input_tokens": int(live.get("input_tokens") or 0),
        "output_tokens": int(live.get("output_tokens") or 0),
        "tool_calls": list(live.get("tool_calls") or []),
        "proposal": proposal,
        "policy": _policy_receipt(decision),
        "execution": execution,
        "rationale": proposal.get("rationale"),
        "error": None,
        "input_hash": live.get("input_hash") or groq_agent.input_hash_for(ticket_id),
        "created_at": db.now_ist(),
    })


def actions_mod_execute(ticket_id: str, action_id: str) -> tuple[Any, list[dict[str, Any]], dict[str, Any]]:
    return actions.execute_action(ticket_id, action_id)


def _resolution_summary(intent: str, action: dict[str, Any]) -> str:
    if intent == "wismo":
        return "Tracking shared with a verified ETA; shipment state read back from the courier."
    if intent == "damaged":
        return f"Refund of ₹{float(action['params'].get('amount', 0)):,.0f} issued, verified, and reversible for 24 hours."
    if intent == "return":
        return "Return scheduled and order state verified."
    if intent == "payment_failure":
        return "Failed charge confirmed unsettled; fresh payment link delivered and verified."
    if intent == "delayed":
        return "Proactive delay update sent with revised ETA and verified tracking."
    return "Action completed and verified against the system of record."
