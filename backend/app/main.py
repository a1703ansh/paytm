from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import actions, agent, db, evals, groq_agent, ledger, policy, seed, serializers


class RejectRequest(BaseModel):
    reason: str = ""


class RunRequest(BaseModel):
    mode: Literal["scripted", "live"] = "scripted"


class PolicyValues(BaseModel):
    auto_limit: float = 2000
    notify_limit: float = 20000
    risk_threshold: int = 30


class PromoteRequest(PolicyValues):
    note: str = ""


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    seed.ensure_seeded()
    yield


app = FastAPI(title="ResolveOS API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/tickets")
def list_tickets() -> dict[str, Any]:
    rows = db.fetchall("SELECT * FROM tickets ORDER BY created_at DESC")
    return {"tickets": [serializers.ticket_summary(row) for row in rows]}


@app.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id: str) -> dict[str, Any]:
    ticket = serializers.ticket_detail(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@app.post("/api/tickets/{ticket_id}/run")
def run_ticket(ticket_id: str, payload: RunRequest | None = None) -> dict[str, Any]:
    mode = payload.mode if payload else "scripted"
    ticket, message = agent.run_agent(ticket_id, mode)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    latest = ticket["actions"][-1] if ticket.get("actions") else {}
    reasons = latest.get("reasons")
    if not isinstance(reasons, list):
        reasons = [reasons] if reasons else []
    if not reasons and latest.get("denial_reason"):
        reasons = [latest["denial_reason"]]
    if not reasons:
        brief = ticket.get("brief") or {}
        escalation_reason = brief.get("escalation_reason") if isinstance(brief, dict) else None
        if escalation_reason:
            reasons = [escalation_reason]
    decision = {
        "lane": latest.get("lane") or ticket.get("lane"),
        "rule_id": latest.get("rule_id"),
        "policy_version": latest.get("policy_version"),
        "reasons": reasons,
    }
    return {
        "ticket": ticket,
        "message": message,
        "decision": decision,
        "agent_run": db.latest_agent_run(ticket_id),
    }


@app.get("/api/agent/status")
def agent_status() -> dict[str, Any]:
    return groq_agent.status()


@app.get("/api/agent/runs/{run_id}")
def get_agent_run(run_id: str) -> dict[str, Any]:
    run = db.agent_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return run


@app.post("/api/tickets/{ticket_id}/reset")
def reset_ticket(ticket_id: str) -> dict[str, Any]:
    seed.reset_ticket(ticket_id)
    ticket = serializers.ticket_detail(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ticket": ticket}


@app.post("/api/actions/{action_id}/approve")
def approve_action(action_id: str) -> dict[str, Any]:
    try:
        row, action = actions.approve_action(action_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ticket": serializers.ticket_detail(row["id"]), "action": action}


@app.post("/api/actions/{action_id}/reject")
def reject_action(action_id: str, payload: RejectRequest) -> dict[str, Any]:
    try:
        row, action = actions.reject_action(action_id, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ticket": serializers.ticket_detail(row["id"]), "action": action}


@app.post("/api/actions/{action_id}/undo")
def undo_action(action_id: str) -> dict[str, Any]:
    try:
        row, action = actions.undo_action(action_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ticket": serializers.ticket_detail(row["id"]), "action": action}


@app.get("/api/approvals")
def get_approvals() -> dict[str, Any]:
    return {"approvals": serializers.approvals()}


@app.get("/api/dashboard")
def get_dashboard() -> dict[str, Any]:
    active = policy.get_active_policy()
    simulation = policy.simulate_policy(active)
    metrics = simulation["metrics"]
    rows = policy._historical_rows()
    historical_approved = round(metrics["var_rate"] / 100 * len(rows))
    live_rows = db.fetchall("SELECT * FROM tickets")
    live_resolved = [row for row in live_rows if row["status"] == "resolved"]
    live_auto = [row for row in live_resolved if row["lane"] == "auto"]
    eligible = len(rows) + len(live_resolved)
    autonomous = historical_approved + len(live_auto)
    var_rate = round(autonomous / max(1, eligible) * 100, 1)
    blocked_value = 0.0
    for row in rows:
        if policy._lane_for_history(row, active) == "deny":
            blocked_value += float(row["amount"])
    for row in live_rows:
        for action in db.load(row["actions"], []):
            if action.get("lane") == "deny" or action.get("status") == "denied":
                blocked_value += float(action.get("params", {}).get("amount") or 0)
    intent_rows = db.fetchall("SELECT intent, COUNT(*) AS count FROM historical GROUP BY intent ORDER BY count DESC")
    daily = [
        {"day": "Mon", "auto": 24, "review": 8, "blocked": 2},
        {"day": "Tue", "auto": 27, "review": 6, "blocked": 1},
        {"day": "Wed", "auto": 26, "review": 7, "blocked": 3},
        {"day": "Thu", "auto": 31, "review": 5, "blocked": 2},
        {"day": "Fri", "auto": 29, "review": 6, "blocked": 1},
        {"day": "Sat", "auto": 22, "review": 9, "blocked": 2},
        {"day": "Sun", "auto": 24, "review": 7, "blocked": 1},
    ]
    live_lane = {"auto": len(live_auto), "review": 0, "deny": 0}
    for row in live_rows:
        if row["status"] in {"waiting_human"}:
            live_lane["review"] += 1
        if row["status"] in {"blocked"}:
            live_lane["deny"] += 1
    policy_blocks = db.fetchone(
        "SELECT COUNT(*) AS count FROM ledger WHERE type IN ('policy.denied', 'injection.blocked')"
    )
    return {
        "kpis": {
            "var_rate": var_rate,
            "autonomous_resolutions": autonomous,
            "eligible_tickets": eligible,
            "auto_precision": metrics["precision"],
            "aht_before": 9.2,
            "aht_after": 0.8,
            "cost_before": 42,
            "cost_after": 6.2,
            "blocked_value": round(blocked_value, 2),
            "escalation_rate": metrics["review_rate"],
            "reopen_rate": 1.4,
        },
        "lane_mix": [
            {"lane": "auto", "count": metrics["auto_count"] + live_lane["auto"]},
            {"lane": "review", "count": metrics["review_count"] + live_lane["review"]},
            {"lane": "deny", "count": metrics["deny_count"] + live_lane["deny"]},
        ],
        "intent_mix": [{"intent": row["intent"], "count": row["count"]} for row in intent_rows],
        "daily": daily,
        "recent_events": ledger.recent_events(8),
        "licenses": policy.get_licenses(active),
        "trust": {
            "evidence_coverage": 98.6,
            "verification_rate": 100.0,
            "policy_blocks": policy_blocks["count"] if policy_blocks else 0,
            "override_rate": 4.2,
        },
        "policy": active,
    }


@app.get("/api/policy")
def get_policy() -> dict[str, Any]:
    return policy.get_policy_payload()


@app.post("/api/policy/simulate")
def simulate_policy(payload: PolicyValues) -> dict[str, Any]:
    return policy.simulate_policy(payload.model_dump())


@app.post("/api/policy/promote")
def promote_policy(payload: PromoteRequest) -> dict[str, Any]:
    values = {
        "auto_limit": payload.auto_limit,
        "notify_limit": payload.notify_limit,
        "risk_threshold": payload.risk_threshold,
    }
    policy_payload, simulation = policy.promote_policy(values, payload.note)
    return {"policy": policy_payload, "metrics": simulation["metrics"], "simulation": simulation}


@app.get("/api/evals/adversarial")
def adversarial_evals() -> dict[str, Any]:
    return evals.run_adversarial()


@app.post("/api/demo/reset")
def reset_demo() -> dict[str, Any]:
    seed.reset_demo()
    return {"status": "ok", "seeded": True}
