import hashlib
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from governor.config import settings
from governor.db import init_db, SessionLocal, APIKeyModel
from governor.api.sessions import router as sessions_router
from governor.api.actions import router as actions_router
from governor.api.approvals import router as approvals_router
from governor.api.audit import router as audit_router
from governor.api.admin import router as admin_router
from governor.api.stream import router as stream_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="PNG5 Agent Permission Governor — Zero-Trust Runtime Authorization Engine"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Body Size Limit Middleware (Max 64 KB)
@app.middleware("http")
async def limit_body_size_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.MAX_BODY_BYTES:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"error": "payload_too_large", "message": f"Payload exceeds maximum 64 KB limit ({settings.MAX_BODY_BYTES} bytes)."}
                )
        except ValueError:
            pass
            
    response = await call_next(request)
    return response

# Register API Routers
app.include_router(sessions_router)
app.include_router(actions_router)
app.include_router(approvals_router)
app.include_router(audit_router)
app.include_router(admin_router)
app.include_router(stream_router)

@app.on_event("startup")
def on_startup():
    """Initialize database and seed bootstrap API keys."""
    init_db()
    
    # Seed default bootstrap keys into database if empty
    db = SessionLocal()
    try:
        if db.query(APIKeyModel).count() == 0:
            orch_h = hashlib.sha256(settings.ORCHESTRATOR_KEY.encode("utf-8")).hexdigest()
            rev_h = hashlib.sha256(settings.REVIEWER_KEY.encode("utf-8")).hexdigest()
            admin_h = hashlib.sha256(settings.ADMIN_KEY.encode("utf-8")).hexdigest()
            
            db.add(APIKeyModel(id="key_orch", role="orchestrator", key_hash=orch_h, label="Default Orchestrator Key"))
            db.add(APIKeyModel(id="key_rev", role="reviewer", key_hash=rev_h, label="Default Reviewer Key"))
            db.add(APIKeyModel(id="key_admin", role="admin", key_hash=admin_h, label="Default Admin Key"))
            db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("governor.main:app", host="0.0.0.0", port=8000, reload=True)
