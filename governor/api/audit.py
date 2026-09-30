import json
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from governor.db import get_db, AuditEventModel
from governor.schemas import AuditVerifyResponse
from governor.api.auth import require_reviewer, require_admin
from governor.core.audit_chain import verify_audit_chain

router = APIRouter(prefix="/v1/audit", tags=["Audit"])

@router.get("")
def list_audit_events(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    role: str = Depends(require_reviewer)
):
    """Retrieves paginated structured audit events."""
    events = db.query(AuditEventModel).order_by(AuditEventModel.seq.desc()).offset(offset).limit(limit).all()
    results = []
    for e in events:
        try:
            payload = json.loads(e.payload_json)
        except Exception:
            payload = {}
        results.append({
            "seq": e.seq,
            "ts": e.ts.isoformat(),
            "type": e.type,
            "payload": payload,
            "prev_hash": e.prev_hash,
            "hash": e.hash
        })
    return {"items": results, "count": len(results)}

@router.get("/verify", response_model=AuditVerifyResponse)
def verify_audit_log_integrity(
    db: Session = Depends(get_db),
    role: str = Depends(require_admin)
):
    """Recomputes SHA256 audit chain integrity from sequence 1 to end."""
    res = verify_audit_chain(db)
    return AuditVerifyResponse(
        ok=res["ok"],
        first_bad_seq=res["first_bad_seq"]
    )
