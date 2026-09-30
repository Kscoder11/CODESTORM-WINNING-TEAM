from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict

# --- Session Schemas ---

class GrantSpec(BaseModel):
    action: str
    target_glob: str
    constraints: Dict[str, Any] = Field(default_factory=dict)

class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_name: str
    task: str
    ttl: int = 3600
    grants: List[GrantSpec] = Field(default_factory=list)

class CreateSessionResponse(BaseModel):
    session_id: str
    session_token: str

# --- Action Request & Response Schemas ---

class ActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    
    action: str
    target: str
    params: Dict[str, Any] = Field(default_factory=dict)
    approval_id: Optional[str] = None

class RiskBreakdown(BaseModel):
    base: int = 0
    sensitivity: int = 0
    environment: int = 0
    taint: int = 0
    signals: int = 0

class ExecutionTimings(BaseModel):
    decision_ms: float = 0.0
    audit_ms: float = 0.0
    exec_ms: float = 0.0

class ActionResponse(BaseModel):
    outcome: str  # ALLOW | CONSTRAIN | ESCALATE | DENY
    score: int
    breakdown: RiskBreakdown
    rules: List[str] = Field(default_factory=list)
    approval_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    timings: ExecutionTimings

# --- Approval Schemas ---

class ApprovalItem(BaseModel):
    id: str
    session_id: str
    agent_name: str
    action: str
    target: str
    canonical_params: Dict[str, Any]
    request_hash: str
    score: int
    breakdown: RiskBreakdown
    rules: List[str]
    status: str  # PENDING | APPROVED | DENIED | EXPIRED | CONSUMED
    created_at: str
    expires_at: str

class ListApprovalsResponse(BaseModel):
    items: List[ApprovalItem]

class ReviewApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reviewer_id: str
    reason: Optional[str] = None

class ReviewApprovalResponse(BaseModel):
    status: str
    approval_id: str
    message: str

# --- Audit & System Schemas ---

class AuditVerifyResponse(BaseModel):
    ok: bool
    first_bad_seq: Optional[int] = None

class SystemMetricsResponse(BaseModel):
    total_decisions: int
    outcomes: Dict[str, int]
    p50_ms: float
    p95_ms: float
    p99_ms: float
    approval_latency_median_s: float
