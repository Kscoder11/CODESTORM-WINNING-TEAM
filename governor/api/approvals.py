import json
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from governor.db import get_db, ApprovalModel, DecisionModel, SessionModel
from governor.schemas import (
    ListApprovalsResponse, ApprovalItem, ReviewApprovalRequest, ReviewApprovalResponse, RiskBreakdown
)
from governor.api.auth import require_reviewer
from governor.core.approvals import approve_request, deny_request, ApprovalError

router = APIRouter(prefix="/v1/approvals", tags=["Approvals"])

@router.get("", response_model=ListApprovalsResponse)
def list_approvals(
    status_filter: Optional[str] = Query("PENDING", alias="status"),
    db: Session = Depends(get_db),
    role: str = Depends(require_reviewer)
):
    """Reviewer approval queue listing with exact canonical action details."""
    query = db.query(ApprovalModel)
    if status_filter:
        query = query.filter(ApprovalModel.status == status_filter.upper())
        
    approvals = query.order_by(ApprovalModel.created_at.desc()).all()
    items = []
    
    for app in approvals:
        # Join with decision to get metadata
        dec = db.query(DecisionModel).filter(DecisionModel.request_hash == app.request_hash).first()
        sess = db.query(SessionModel).filter(SessionModel.id == dec.session_id).first() if dec else None
        
        breakdown_dict = json.loads(dec.breakdown_json) if dec else {}
        rules_list = json.loads(dec.rules_json) if dec else []
        params_dict = json.loads(dec.canon_params_json) if dec else {}
        
        items.append(ApprovalItem(
            id=app.id,
            session_id=dec.session_id if dec else "unknown",
            agent_name=sess.agent_name if sess else "unknown",
            action=dec.action if dec else "unknown",
            target=dec.canon_target if dec else "unknown",
            canonical_params=params_dict,
            request_hash=app.request_hash,
            score=dec.score if dec else 70,
            breakdown=RiskBreakdown(**breakdown_dict) if breakdown_dict else RiskBreakdown(),
            rules=rules_list,
            status=app.status,
            created_at=app.created_at.isoformat(),
            expires_at=app.expires_at.isoformat()
        ))
        
    return ListApprovalsResponse(items=items)

@router.post("/{approval_id}/approve", response_model=ReviewApprovalResponse)
def approve_action(
    approval_id: str,
    payload: ReviewApprovalRequest,
    db: Session = Depends(get_db),
    role: str = Depends(require_reviewer)
):
    """Reviewer approves pending request."""
    # Find session creator for self-approval check
    app_db = db.query(ApprovalModel).filter(ApprovalModel.id == approval_id).first()
    if not app_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found.")
        
    dec = db.query(DecisionModel).filter(DecisionModel.request_hash == app_db.request_hash).first()
    sess = db.query(SessionModel).filter(SessionModel.id == dec.session_id).first() if dec else None
    session_creator = sess.created_by if sess else None

    try:
        updated = approve_request(
            db=db,
            approval_id=approval_id,
            reviewer_id=payload.reviewer_id,
            session_creator=session_creator
        )
        return ReviewApprovalResponse(
            status=updated.status,
            approval_id=updated.id,
            message="Request approved successfully. Agent can now redeem approval with request hash."
        )
    except ApprovalError as ae:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ae))

@router.post("/{approval_id}/deny", response_model=ReviewApprovalResponse)
def deny_action(
    approval_id: str,
    payload: ReviewApprovalRequest,
    db: Session = Depends(get_db),
    role: str = Depends(require_reviewer)
):
    """Reviewer denies pending request."""
    try:
        updated = deny_request(
            db=db,
            approval_id=approval_id,
            reviewer_id=payload.reviewer_id
        )
        return ReviewApprovalResponse(
            status=updated.status,
            approval_id=updated.id,
            message="Request denied successfully."
        )
    except ApprovalError as ae:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ae))
