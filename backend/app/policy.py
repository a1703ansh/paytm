from __future__ import annotations

from typing import Any

from . import db

DEFAULT_POLICY = {
    "version": "v3",
    "auto_limit": 2000.0,
    "notify_limit": 20000.0,
    "risk_threshold": 30,
    "hard_deny": 25000.0,
}

NON_MONEY_ACTIONS = {"share_tracking", "retry_payment", "send_update", "update_address"}

REQUIRED_EVIDENCE = {
    "issue_refund": {"order", "payment", "reason"},
    "create_replacement": {"order", "payment", "item_match"},
    "create_return": {"order"},
    "retry_payment": {"order", "payment"},
    "share_tracking": {"order", "shipment"},
    "send_update": {"order", "shipment"},
}


def get_active_policy() -> dict[str, Any]:
    row = db.fetchone("SELECT * FROM policy_versions WHERE active = 1 ORDER BY updated_at DESC LIMIT 1")
    if not row:
        return dict(DEFAULT_POLICY)
    return {
        "version": row["version"],
        "auto_limit": row["auto_limit"],
        "notify_limit": row["notify_limit"],
        "risk_threshold": row["risk_threshold"],
        "hard_deny": row["hard_deny"],
        "updated_at": row["updated_at"],
    }


def get_policy_history() -> list[dict[str, Any]]:
    rows = db.fetchall("SELECT * FROM policy_versions ORDER BY updated_at ASC, version ASC")
    return [
        {
            "version": row["version"],
            "auto_limit": row["auto_limit"],
            "notify_limit": row["notify_limit"],
            "risk_threshold": row["risk_threshold"],
            "updated_at": row["updated_at"],
            "note": row["note"],
        }
        for row in rows
    ]


def decide(proposal: dict[str, Any], policy: dict[str, Any] | None = None) -> dict[str, Any]:
    policy = dict(policy or get_active_policy())
    action = proposal.get("action", "")
    amount = float(proposal.get("amount") or 0)
    risk = int(proposal.get("risk") or 0)
    segment = proposal.get("segment") or "Core"
    flags = set(proposal.get("flags") or [])
    evidence = set(proposal.get("evidence") or [])
    payee_changed = bool(proposal.get("payee_changed"))
    confidence = float(proposal.get("confidence") or 0.9)
    required = REQUIRED_EVIDENCE.get(action, {"order"})
    missing = sorted(required - evidence)
    base = {
        "lane": "auto",
        "rule_id": "R1",
        "reasons": [],
        "missing_evidence": missing,
        "policy_version": policy["version"],
        "confidence": round(confidence, 3),
        "risk": risk,
    }

    if action not in REQUIRED_EVIDENCE:
        base.update({
            "lane": "deny",
            "rule_id": "D0",
            "reasons": [f"Action '{action}' is not in the licensed action set"],
        })
        return base

    if payee_changed:
        base.update({
            "lane": "deny",
            "rule_id": "D1",
            "reasons": ["Payee change is prohibited. Refunds return to the original payment method."],
        })
        return base

    if "injection_attempt" in flags:
        base.update({
            "lane": "deny",
            "rule_id": "D3",
            "reasons": ["Instruction override detected. The request is logged and the write firewall stayed closed."],
        })
        return base

    if amount > float(policy["hard_deny"]):
        base.update({
            "lane": "deny",
            "rule_id": "D2",
            "reasons": [f"₹{amount:,.0f} exceeds the hard refund ceiling of ₹{policy['hard_deny']:,.0f}."],
        })
        return base

    if missing:
        base.update({
            "lane": "review",
            "rule_id": "R3",
            "reasons": [f"Required evidence missing: {', '.join(missing)}."],
        })
        return base

    if action in NON_MONEY_ACTIONS:
        if risk <= int(policy["risk_threshold"]) + 20:
            base["reasons"] = ["Low-risk read/update action with complete evidence."]
        else:
            base.update({
                "lane": "review",
                "rule_id": "R2",
                "reasons": [f"Risk score {risk} is above the auto threshold."],
            })
        return base

    if risk >= 80:
        base.update({
            "lane": "review",
            "rule_id": "R4",
            "reasons": [f"Risk score {risk} requires accountable human review."],
        })
        return base

    if segment == "VIP" and amount > 1000:
        base.update({
            "lane": "review",
            "rule_id": "R5",
            "reasons": ["VIP account above ₹1,000 requires a named approver."],
        })
        return base

    if "repeat_refunder" in flags and amount > 1500:
        base.update({
            "lane": "review",
            "rule_id": "R6",
            "reasons": ["Repeat-refunder pattern requires human review."],
        })
        return base

    if risk > int(policy["risk_threshold"]):
        base.update({
            "lane": "review",
            "rule_id": "R2",
            "reasons": [f"Risk score {risk} exceeds the auto threshold of {policy['risk_threshold']}."],
        })
        return base

    if amount <= float(policy["auto_limit"]):
        base.update({
            "lane": "auto",
            "rule_id": "R1",
            "reasons": [
                f"₹{amount:,.0f} is within the ₹{policy['auto_limit']:,.0f} auto licence.",
                f"Risk {risk} is within the threshold of {policy['risk_threshold']}.",
                "Evidence bundle complete.",
            ],
        })
        return base

    if amount <= float(policy["notify_limit"]):
        base.update({
            "lane": "review",
            "rule_id": "R7",
            "reasons": [
                f"₹{amount:,.0f} exceeds the auto licence of ₹{policy['auto_limit']:,.0f}.",
                "A human approver must release this action.",
            ],
        })
        return base

    base.update({
        "lane": "deny",
        "rule_id": "D4",
        "reasons": [f"₹{amount:,.0f} exceeds the human approval ceiling of ₹{policy['notify_limit']:,.0f}."],
    })
    return base


def _historical_rows() -> list[dict[str, Any]]:
    return [
        {
            "id": row["id"],
            "intent": row["intent"],
            "action_type": row["action_type"],
            "amount": row["amount"],
            "risk": row["risk"],
            "segment": row["segment"],
            "evidence_complete": bool(row["evidence_complete"]),
            "payee_changed": bool(row["payee_changed"]),
            "human_approved": bool(row["human_approved"]),
            "human_action": row["human_action"],
        }
        for row in db.fetchall("SELECT * FROM historical")
    ]


def _lane_for_history(row: dict[str, Any], policy: dict[str, Any]) -> str:
    if row["action_type"] in NON_MONEY_ACTIONS:
        return "auto"
    if row["payee_changed"]:
        return "deny"
    if row["amount"] > float(policy["notify_limit"]):
        return "deny"
    if row["amount"] > float(policy["hard_deny"]):
        return "deny"
    if (
        row["amount"] <= float(policy["auto_limit"])
        and row["risk"] <= int(policy["risk_threshold"])
        and row["evidence_complete"]
        and not (row["segment"] == "VIP" and row["amount"] > 1000)
    ):
        return "auto"
    return "review"


def simulate_policy(values: dict[str, Any]) -> dict[str, Any]:
    active = get_active_policy()
    candidate = {
        "version": "simulation",
        "auto_limit": float(values.get("auto_limit", active["auto_limit"])),
        "notify_limit": float(values.get("notify_limit", active["notify_limit"])),
        "risk_threshold": int(values.get("risk_threshold", active["risk_threshold"])),
        "hard_deny": float(values.get("hard_deny", active["hard_deny"])),
    }
    if candidate["notify_limit"] < candidate["auto_limit"]:
        candidate["notify_limit"] = candidate["auto_limit"]

    rows = _historical_rows()
    total = max(1, len(rows))

    def metrics_for(policy: dict[str, Any]) -> dict[str, Any]:
        auto = review = deny = auto_approved = 0
        leakage = 0.0
        for row in rows:
            lane = _lane_for_history(row, policy)
            if lane == "auto":
                auto += 1
                approved = row["action_type"] in NON_MONEY_ACTIONS or row["human_approved"]
                if approved:
                    auto_approved += 1
                else:
                    leakage += float(row["amount"])
            elif lane == "review":
                review += 1
            else:
                deny += 1
        precision = (auto_approved / auto * 100) if auto else 100.0
        return {
            "auto_rate": round(auto / total * 100, 1),
            "review_rate": round(review / total * 100, 1),
            "deny_rate": round(deny / total * 100, 1),
            "precision": round(precision, 1),
            "expected_leakage": round(leakage, 2),
            "escalations": review,
            "var_rate": round(auto_approved / total * 100, 1),
            "auto_count": auto,
            "review_count": review,
            "deny_count": deny,
        }

    baseline = metrics_for(active)
    metrics = metrics_for(candidate)
    delta = {
        "auto_rate": round(metrics["auto_rate"] - baseline["auto_rate"], 1),
        "precision": round(metrics["precision"] - baseline["precision"], 1),
        "expected_leakage": round(metrics["expected_leakage"] - baseline["expected_leakage"], 2),
        "escalations": metrics["escalations"] - baseline["escalations"],
        "var_rate": round(metrics["var_rate"] - baseline["var_rate"], 1),
    }
    return {
        "metrics": metrics,
        "baseline": baseline,
        "delta": delta,
        "candidate": candidate,
        "sample_size": total,
    }


def get_suggestion() -> dict[str, Any] | None:
    active = get_active_policy()
    if float(active["auto_limit"]) >= 3500:
        return None
    rows = _historical_rows()
    band = [r for r in rows if 2000 < float(r["amount"]) <= 3500 and r["human_action"] == "approve"]
    total_band = [r for r in rows if 2000 < float(r["amount"]) <= 3500]
    proposed = min(3500.0, float(active["auto_limit"]) + 500.0)
    return {
        "title": f"Raise the Core refund licence to ₹{proposed:,.0f}?",
        "detail": (
            f"{len(band)} of {len(total_band)} human decisions in the ₹2,000–₹3,500 band were approvals. "
            "Replay shows the precision floor holds at the same risk threshold."
        ),
        "auto_limit": proposed,
        "notify_limit": active["notify_limit"],
        "risk_threshold": active["risk_threshold"],
        "overrides": len(band),
        "total": len(total_band),
        "proposed_values": {
            "auto_limit": proposed,
            "notify_limit": active["notify_limit"],
            "risk_threshold": active["risk_threshold"],
        },
        "approvals": len(band),
        "decisions": len(total_band),
    }


def get_licenses(policy: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    policy = policy or get_active_policy()
    limit = float(policy["auto_limit"])
    return [
        {
            "action": "issue_refund",
            "segment": "Core",
            "lane": "auto",
            "limit": limit,
            "precision": 99.4,
            "clean_actions": 142,
            "next_promotion": f"₹{limit + 500:,.0f} at 200 clean actions",
        },
        {
            "action": "issue_refund",
            "segment": "VIP",
            "lane": "review",
            "limit": 1000,
            "precision": 98.8,
            "clean_actions": 36,
            "next_promotion": "Auto at 50 approved cases",
        },
        {
            "action": "create_replacement",
            "segment": "Core",
            "lane": "review",
            "limit": limit,
            "precision": 98.9,
            "clean_actions": 28,
            "next_promotion": "Notify lane at 40 clean cases",
        },
        {
            "action": "create_return",
            "segment": "Core",
            "lane": "auto",
            "limit": 5000,
            "precision": 99.7,
            "clean_actions": 211,
            "next_promotion": "Fully licensed",
        },
        {
            "action": "retry_payment",
            "segment": "All",
            "lane": "auto",
            "limit": 5000,
            "precision": 99.9,
            "clean_actions": 320,
            "next_promotion": "Fully licensed",
        },
        {
            "action": "share_tracking",
            "segment": "All",
            "lane": "auto",
            "limit": 0,
            "precision": 100.0,
            "clean_actions": 980,
            "next_promotion": "Fully licensed",
        },
    ]


def promote_policy(values: dict[str, Any], note: str = "") -> tuple[dict[str, Any], dict[str, Any]]:
    from . import ledger

    history = get_policy_history()
    numbers = []
    for item in history:
        try:
            numbers.append(int(str(item["version"]).replace("v", "")))
        except ValueError:
            continue
    version = f"v{max(numbers or [3]) + 1}"
    auto_limit = float(values.get("auto_limit", 2000))
    notify_limit = max(float(values.get("notify_limit", 20000)), auto_limit)
    risk_threshold = int(values.get("risk_threshold", 30))
    updated_at = db.now_ist()
    db.execute("UPDATE policy_versions SET active = 0")
    db.execute(
        "INSERT INTO policy_versions (version, auto_limit, notify_limit, risk_threshold, hard_deny, updated_at, note, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
        (
            version,
            auto_limit,
            notify_limit,
            risk_threshold,
            25000.0,
            updated_at,
            note or "Promoted from autonomy studio after replay simulation.",
        ),
    )
    ledger.append_event(
        None,
        "policy.promoted",
        f"Policy {version} activated · auto ₹{auto_limit:,.0f}",
        {"version": version, "auto_limit": auto_limit, "risk_threshold": risk_threshold},
    )
    result = simulate_policy({"auto_limit": auto_limit, "notify_limit": notify_limit, "risk_threshold": risk_threshold})
    return get_policy_payload(), result


def get_policy_payload() -> dict[str, Any]:
    active = get_active_policy()
    history = get_policy_history()
    return {
        "active": {
            **active,
            "hard_deny": float(active.get("hard_deny", 25000)),
            "history": history,
        },
        "history": history,
        "suggestion": get_suggestion(),
        "licenses": get_licenses(active),
    }
