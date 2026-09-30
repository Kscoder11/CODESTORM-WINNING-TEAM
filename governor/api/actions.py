from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from governor.db import get_db, SessionModel
from governor.schemas import ActionRequest, ActionResponse
from governor.api.auth import get_agent_session
from governor.core.decide import evaluate_action_request

router = APIRouter(prefix="/v1/actions", tags=["Actions"])

@router.post("", response_model=ActionResponse)
def authorize_action(
    payload: ActionRequest,
    dry_run: bool = Query(False, description="Evaluates authorization without execution side-effects"),
    session: SessionModel = Depends(get_agent_session),
    db: Session = Depends(get_db)
):
    """
    Primary authorization and evaluation endpoint for autonomous AI agents.
    Evaluates requested action against canonicalizer, resource registry, hard-denies, grants,
    provenance taint, and dynamic risk engine.
    """
    res = evaluate_action_request(
        db=db,
        session=session,
        action=payload.action,
        target=payload.target,
        params=payload.params,
        approval_id=payload.approval_id,
        dry_run=dry_run
    )
    
    outcome = res["outcome"]
    
    # Map HTTP status codes per team contract:
    # 200 -> ALLOW / CONSTRAIN
    # 202 -> ESCALATE
    # 403 -> DENY
    if outcome in ("ALLOW", "CONSTRAIN"):
        status_code = status.HTTP_200_OK
    elif outcome == "ESCALATE":
        status_code = status.HTTP_202_ACCEPTED
    else:
        status_code = status.HTTP_403_FORBIDDEN
        
    return JSONResponse(status_code=status_code, content=res)
