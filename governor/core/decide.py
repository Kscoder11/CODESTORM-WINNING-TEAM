import time
import json
import datetime
from sqlalchemy.orm import Session
from governor.config import settings
from governor.db import DecisionModel, SessionModel, GrantModel, LedgerModel, ApprovalModel
from governor.core.canon import canonicalize_action, compute_request_hash, CanonicalizationError
from governor.core.registry import registry
from governor.core.hard_rules import evaluate_hard_denies, HardDenyException
from governor.core.risk import calculate_risk_score
from governor.core.approvals import create_approval, redeem_approval_atomic
from governor.core.audit_chain import append_audit_event

def evaluate_action_request(
    db: Session,
    session: SessionModel,
    action: str,
    target: str,
    params: dict,
    approval_id: str = None,
    dry_run: bool = False
) -> dict:
    """
    Primary authorization pipeline function implementing the exact sequential pipeline:
    1. Schema & Canonicalization
    2. Resource Registry lookup
    3. Hard-Denies (HD1-HD10)
    4. Grants check
    5. Lineage & Taint check
    6. Risk calculation
    7. Decision synthesis
    8. Approval redemption (if approval_id provided)
    9. Audit logging
    """
    t0 = time.perf_counter()

    # --- Step 1: Canonicalization ---
    try:
        canon_target, canon_params = canonicalize_action(action, target, params)
        request_hash = compute_request_hash(session.id, action, canon_target, canon_params)
    except CanonicalizationError as ce:
        t_dec = (time.perf_counter() - t0) * 1000.0
        return {
            "outcome": "DENY",
            "score": 100,
            "breakdown": {"base": 40, "sensitivity": 25, "environment": 20, "taint": 15, "signals": 0},
            "rules": ["parse_error"],
            "approval_id": None,
            "result": None,
            "timings": {"decision_ms": round(t_dec, 2), "audit_ms": 0.0, "exec_ms": 0.0},
            "message": f"Canonicalization error: {str(ce)}"
        }

    # --- Step 2: Resource Registry ---
    resource_meta = registry.resolve(canon_target)
    trust = resource_meta["trust"]
    sensitivity = resource_meta["sensitivity"]
    env = resource_meta["env"]

    # --- Step 3 & 4: Grants & Session Ledger ---
    db_grants = db.query(GrantModel).filter(GrantModel.session_id == session.id).all()
    session_grants = [{"action": g.action, "target_glob": g.target_glob, "constraints": json.loads(g.constraints_json or "{}")} for g in db_grants]

    db_ledger = db.query(LedgerModel).filter(LedgerModel.session_id == session.id).all()
    session_ledger_entries = [
        {"trust": l.trust, "sensitivity": l.sensitivity, "source": l.source, "indicators": json.loads(l.indicators_json or "[]")}
        for l in db_ledger
    ]

    # Session Taint calculation (worst trust level in session ledger)
    session_taint = trust
    trust_priority = {"untrusted": 4, "external": 3, "user": 2, "internal": 1, "trusted": 0}
    worst_val = trust_priority.get(trust, 0)
    for entry in session_ledger_entries:
        t_val = trust_priority.get(entry.get("trust"), 0)
        if t_val > worst_val:
            worst_val = t_val
            session_taint = entry.get("trust")

    # --- Step 5: Approval object fetch if redemption ---
    approval_obj = None
    if approval_id:
        app_db = db.query(ApprovalModel).filter(ApprovalModel.id == approval_id).first()
        if app_db:
            approval_obj = {
                "id": app_db.id,
                "status": app_db.status,
                "request_hash": app_db.request_hash,
                "expires_at": app_db.expires_at
            }

    # --- Step 6: Hard-Denies Evaluation (HD1-HD10) ---
    rules_fired = []
    hard_deny_triggered = False
    hard_deny_reason = ""
    
    try:
        evaluate_hard_denies(
            action=action,
            canon_target=canon_target,
            canon_params=canon_params,
            session_grants=session_grants,
            session_ledger_entries=session_ledger_entries,
            approval_object=approval_obj,
            request_hash=request_hash
        )
    except HardDenyException as hde:
        hard_deny_triggered = True
        rules_fired.append(hde.rule_id)
        hard_deny_reason = hde.message

    # --- Step 7: Risk Calculation ---
    # Injection advisory signal (advisory flag)
    injection_advisory = False
    if session_ledger_entries:
        for l in db_ledger:
            if l.injection_flag:
                injection_advisory = True
                break

    score, breakdown, risk_outcome = calculate_risk_score(
        action=action,
        sensitivity=sensitivity,
        environment=env,
        session_taint=session_taint,
        injection_advisory=injection_advisory
    )

    if injection_advisory:
        rules_fired.append("INJECTION_ADVISORY")

    # Determine final outcome
    new_approval_id = None
    if hard_deny_triggered:
        final_outcome = "DENY"
        score = max(score, 80)
    elif approval_id:
        # Atomic Redemption check
        success = redeem_approval_atomic(db, approval_id, request_hash)
        if success:
            final_outcome = "ALLOW"
        else:
            final_outcome = "DENY"
            rules_fired.append("HD9")
            hard_deny_reason = "Approval redemption failed (expired, hash mismatch, or already consumed)."
    else:
        if risk_outcome == "ESCALATE":
            final_outcome = "ESCALATE"
            if not dry_run:
                new_approval_id = create_approval(
                    db=db,
                    session_id=session.id,
                    agent_name=session.agent_name,
                    action=action,
                    target=canon_target,
                    canonical_params=canon_params,
                    request_hash=request_hash,
                    score=score,
                    breakdown=breakdown,
                    rules=rules_fired
                )
        else:
            final_outcome = risk_outcome

    t_dec = (time.perf_counter() - t0) * 1000.0

    # --- Step 8: Audit Logging & Database Recording ---
    t_aud_0 = time.perf_counter()
    if not dry_run:
        dec_rec = DecisionModel(
            ts=datetime.datetime.utcnow(),
            session_id=session.id,
            action=action,
            canon_target=canon_target,
            canon_params_json=json.dumps(canon_params),
            request_hash=request_hash,
            outcome=final_outcome,
            score=score,
            breakdown_json=json.dumps(breakdown),
            rules_json=json.dumps(rules_fired),
            policy_version="1.0",
            decision_ms=round(t_dec, 2),
            audit_ms=0.0,
            exec_status="DRY_RUN" if dry_run else ("NOT_EXECUTED" if final_outcome in ("DENY", "ESCALATE") else "SUCCESS"),
            exec_ms=0.0,
            mode=settings.MODE
        )
        db.add(dec_rec)
        db.commit()

        # Audit event append
        audit_payload = {
            "session_id": session.id,
            "agent_name": session.agent_name,
            "action": action,
            "target": canon_target,
            "request_hash": request_hash,
            "outcome": final_outcome,
            "score": score,
            "breakdown": breakdown,
            "rules": rules_fired,
            "approval_id": new_approval_id or approval_id
        }
        append_audit_event(db, "AUTHORIZATION_DECISION", audit_payload)

    t_aud = (time.perf_counter() - t_aud_0) * 1000.0

    return {
        "outcome": final_outcome,
        "score": score,
        "breakdown": breakdown,
        "rules": rules_fired,
        "approval_id": new_approval_id or approval_id,
        "result": None,
        "timings": {
            "decision_ms": round(t_dec, 2),
            "audit_ms": round(t_aud, 2),
            "exec_ms": 0.0
        },
        "reason": hard_deny_reason if hard_deny_triggered else None
    }
