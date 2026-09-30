import time
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from governor.db import get_db, DecisionModel, ApprovalModel
from governor.schemas import SystemMetricsResponse
from governor.api.auth import require_admin
from governor.core.registry import registry

router = APIRouter(tags=["Admin & Telemetry"])

@router.get("/healthz", status_code=status.HTTP_200_OK)
def health_check():
    """System health check endpoint."""
    return {"status": "ok", "service": "PNG5 Agent Permission Governor", "timestamp": time.time()}

@router.post("/v1/policies/reload", status_code=status.HTTP_200_OK)
def reload_policies(
    db: Session = Depends(get_db),
    role: str = Depends(require_admin)
):
    """Admin-only policy reload. Uses last-good-wins on parse failure."""
    try:
        registry.reload()
        return {"status": "reloaded", "message": "Resource registry reloaded successfully."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Policy reload failed: {str(e)}. Retaining last known good policy."
        )

@router.get("/v1/metrics", response_model=SystemMetricsResponse)
def get_system_metrics(db: Session = Depends(get_db)):
    """
    Returns empirical decision metrics, outcome counts, decision latency percentiles,
    and median approval decision time.
    """
    decisions = db.query(DecisionModel).all()
    total_decisions = len(decisions)
    
    outcomes = {"ALLOW": 0, "CONSTRAIN": 0, "ESCALATE": 0, "DENY": 0}
    latencies = []
    
    for d in decisions:
        outcomes[d.outcome] = outcomes.get(d.outcome, 0) + 1
        latencies.append(d.decision_ms)
        
    latencies.sort()
    
    def percentile(arr, p):
        if not arr:
            return 0.0
        k = (len(arr) - 1) * p
        f = int(k)
        c = f + 1 if f + 1 < len(arr) else f
        return round(arr[f] + (arr[c] - arr[f]) * (k - f), 2)
        
    p50_ms = percentile(latencies, 0.50)
    p95_ms = percentile(latencies, 0.95)
    p99_ms = percentile(latencies, 0.99)
    
    # Calculate median approval review latency
    approvals = db.query(ApprovalModel).filter(ApprovalModel.status.in_(["APPROVED", "DENIED"])).all()
    app_latencies = []
    for a in approvals:
        if a.consumed_at or a.reviewer:
            duration = (a.expires_at - a.created_at).total_seconds()
            app_latencies.append(duration)
            
    app_latencies.sort()
    median_app_latency = percentile(app_latencies, 0.50) if app_latencies else 0.0
    
    return SystemMetricsResponse(
        total_decisions=total_decisions,
        outcomes=outcomes,
        p50_ms=p50_ms,
        p95_ms=p95_ms,
        p99_ms=p99_ms,
        approval_latency_median_s=median_app_latency
    )
