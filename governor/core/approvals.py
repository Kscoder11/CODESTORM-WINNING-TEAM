import uuid
import datetime
import json
from sqlalchemy.orm import Session
from governor.db import ApprovalModel, SessionModel
from governor.config import settings

class ApprovalError(Exception):
    pass

def create_approval(
    db: Session,
    session_id: str,
    agent_name: str,
    action: str,
    target: str,
    canonical_params: dict,
    request_hash: str,
    score: int,
    breakdown: dict,
    rules: list,
    ttl_seconds: int = settings.APPROVAL_TTL_SECONDS
) -> str:
    """Create a new pending approval record in the database."""
    approval_id = f"app_{uuid.uuid4().hex[:12]}"
    now = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(seconds=ttl_seconds)
    
    # Store request details in metadata/json
    meta = {
        "session_id": session_id,
        "agent_name": agent_name,
        "action": action,
        "target": target,
        "canonical_params": canonical_params,
        "score": score,
        "breakdown": breakdown,
        "rules": rules
    }
    
    approval = ApprovalModel(
        id=approval_id,
        request_hash=request_hash,
        decision_seq=None,
        status="PENDING",
        reviewer=None,
        created_at=now,
        expires_at=expires_at,
    )
    db.add(approval)
    db.commit()
    return approval_id

def approve_request(db: Session, approval_id: str, reviewer_id: str, session_creator: str = None) -> ApprovalModel:
    """Reviewer approves a pending request."""
    now = datetime.datetime.utcnow()
    approval = db.query(ApprovalModel).filter(ApprovalModel.id == approval_id).first()
    if not approval:
        raise ApprovalError("Approval request not found.")
        
    if approval.status != "PENDING":
        raise ApprovalError(f"Cannot approve request in status '{approval.status}'.")
        
    if approval.expires_at < now:
        approval.status = "EXPIRED"
        db.commit()
        raise ApprovalError("Approval request has expired.")
        
    if session_creator and reviewer_id == session_creator:
        raise ApprovalError("Reviewer cannot be the session creator.")
        
    approval.status = "APPROVED"
    approval.reviewer = reviewer_id
    db.commit()
    db.refresh(approval)
    return approval

def deny_request(db: Session, approval_id: str, reviewer_id: str) -> ApprovalModel:
    """Reviewer denies a pending request."""
    now = datetime.datetime.utcnow()
    approval = db.query(ApprovalModel).filter(ApprovalModel.id == approval_id).first()
    if not approval:
        raise ApprovalError("Approval request not found.")
        
    if approval.status != "PENDING":
        raise ApprovalError(f"Cannot deny request in status '{approval.status}'.")
        
    approval.status = "DENIED"
    approval.reviewer = reviewer_id
    db.commit()
    db.refresh(approval)
    return approval

def redeem_approval_atomic(db: Session, approval_id: str, request_hash: str) -> bool:
    """
    Atomic Compare-And-Set redemption of approval token:
    UPDATE approvals SET status='CONSUMED', consumed_at=now WHERE id=? AND status='APPROVED' AND request_hash=? AND expires_at>now
    Returns True if exactly 1 row was updated, False otherwise.
    """
    now = datetime.datetime.utcnow()
    
    result = db.query(ApprovalModel).filter(
        ApprovalModel.id == approval_id,
        ApprovalModel.status == "APPROVED",
        ApprovalModel.request_hash == request_hash,
        ApprovalModel.expires_at > now
    ).update(
        {"status": "CONSUMED", "consumed_at": now},
        synchronize_session=False
    )
    db.commit()
    return result == 1
