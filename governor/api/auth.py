import hashlib
from fastapi import Header, HTTPException, Security, Depends, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from governor.db import get_db, APIKeyModel, SessionModel
from governor.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

def get_role_from_key(raw_key: str, db: Session) -> str:
    """Verifies API key and returns role ('orchestrator', 'reviewer', 'admin')."""
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API Key header 'X-API-Key' or Bearer token."
        )
        
    # Check default settings keys for bootstrapping demo
    if raw_key == settings.ORCHESTRATOR_KEY:
        return "orchestrator"
    if raw_key == settings.REVIEWER_KEY:
        return "reviewer"
    if raw_key == settings.ADMIN_KEY:
        return "admin"
        
    # Query database for registered API keys
    key_h = hash_key(raw_key)
    key_obj = db.query(APIKeyModel).filter(APIKeyModel.key_hash == key_h).first()
    if not key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or unrecognized API key."
        )
    return key_obj.role

def require_orchestrator(api_key: str = Depends(api_key_header), db: Session = Depends(get_db)) -> str:
    role = get_role_from_key(api_key, db)
    if role not in ("orchestrator", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Orchestrator role required.")
    return role

def require_reviewer(api_key: str = Depends(api_key_header), db: Session = Depends(get_db)) -> str:
    role = get_role_from_key(api_key, db)
    if role not in ("reviewer", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviewer role required.")
    return role

def require_admin(api_key: str = Depends(api_key_header), db: Session = Depends(get_db)) -> str:
    role = get_role_from_key(api_key, db)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required.")
    return role

def get_agent_session(
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
) -> SessionModel:
    """Authenticates agent opaque session token and returns active session."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header."
        )
        
    token = authorization.replace("Bearer ", "").strip() if authorization.startswith("Bearer ") else authorization.strip()
    token_h = hash_key(token)
    
    session = db.query(SessionModel).filter(SessionModel.token_hash == token_h).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent session token."
        )
        
    if session.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Agent session is '{session.status}'."
        )
        
    return session
