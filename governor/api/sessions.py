import uuid
import secrets
import json
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from governor.db import get_db, SessionModel, GrantModel
from governor.schemas import CreateSessionRequest, CreateSessionResponse
from governor.api.auth import require_orchestrator, require_admin, hash_key

router = APIRouter(prefix="/v1/sessions", tags=["Sessions"])

@router.post("", response_model=CreateSessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: CreateSessionRequest,
    db: Session = Depends(get_db),
    role: str = Depends(require_orchestrator)
):
    """
    Creates a new agent session with least-privilege grants.
    Only orchestrator can call. Agent credentials are provided as an opaque session token.
    """
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    raw_token = f"token_{secrets.token_urlsafe(32)}"
    token_h = hash_key(raw_token)
    
    now = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(seconds=payload.ttl)
    
    session_rec = SessionModel(
        id=session_id,
        token_hash=token_h,
        agent_name=payload.agent_name,
        task=payload.task,
        status="ACTIVE",
        created_by="orchestrator",
        created_at=now,
        expires_at=expires_at
    )
    db.add(session_rec)
    
    for g in payload.grants:
        grant_rec = GrantModel(
            session_id=session_id,
            action=g.action,
            target_glob=g.target_glob,
            constraints_json=json.dumps(g.constraints)
        )
        db.add(grant_rec)
        
    db.commit()
    
    return CreateSessionResponse(
        session_id=session_id,
        session_token=raw_token
    )

@router.post("/{session_id}/suspend", status_code=status.HTTP_200_OK)
def suspend_session(
    session_id: str,
    db: Session = Depends(get_db),
    role: str = Depends(require_admin)
):
    """Emergency session kill switch. Admin role required."""
    sess = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
        
    sess.status = "SUSPENDED"
    db.commit()
    return {"status": "SUSPENDED", "session_id": session_id}
