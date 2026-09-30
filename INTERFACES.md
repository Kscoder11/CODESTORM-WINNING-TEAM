# INTERFACES.md — PNG5 Team Contract

**Project:** PNG5 — Agent Permission Governor  
**Status:** Frozen team integration contract  
**Purpose:** Allow all 5 developers to work simultaneously without stepping on each other's implementation.

> This file defines the contracts between team members. Internal implementation can change, but these interfaces must remain stable unless the team explicitly agrees to a breaking change.

---

# 1. Team Ownership

| Member | Ownership | Primary Output |
|---|---|---|
| Member 1 | Backend Core & Authorization | Governor decision pipeline |
| Member 2 | Backend Gateway & Runtime | Controlled tool execution |
| Member 3 | Backend Security & Evaluation | Taint, lineage, scenarios, benchmark |
| Member 4 | Frontend Dashboard | SOC dashboard + live activity |
| Member 5 | Frontend Security UI | Approvals + audit + evaluation |

---

# 2. Golden Rule

The following boundary must never be violated:

```text
Agent
  ↓
POST /v1/actions
  ↓
Governor
  ↓
Decision
  ↓
Gateway / Executor
  ↓
Execution
```

The frontend, agent simulator, and gateway must never independently authorize an action.

Only the Governor's decision engine is authoritative.

---

# 3. Shared API Contract

## 3.1 POST /v1/sessions

**Owner:** Member 1

**Caller:** Orchestrator

Creates a new agent session.

### Request

```json
{
  "agent_name": "DataAgent",
  "task": "Generate quarterly report",
  "ttl": 3600,
  "grants": [
    {
      "action": "file.read",
      "target_glob": "file:/workspace/reports/*",
      "constraints": {}
    }
  ]
}
```

### Response

```json
{
  "session_id": "sess_001",
  "session_token": "opaque-session-token"
}
```

### Rules

- Only orchestrator can create sessions.
- Agent cannot create its own session.
- Session token is opaque.
- Session contains task and grants.
- Taint belongs to the session.
- New task IDs cannot reset taint because agents do not create sessions.

---

# 4. Action Request Contract

## 4.1 POST /v1/actions

**Owner:** Member 1  
**Used by:** Agent / Member 3 simulator

### Request

```json
{
  "action": "file.read",
  "target": "/workspace/reports/q3.txt",
  "params": {},
  "approval_id": null
}
```

### Allowed fields

```text
action
target
params
approval_id
```

### Forbidden fields

The agent MUST NOT provide:

```text
trust
sensitivity
environment
risk_score
policy
decision
permissions
grants
capabilities
```

Pydantic must use:

```python
model_config = ConfigDict(extra="forbid")
```

### Body limit

Maximum:

```text
64 KB
```

---

# 5. Action Response Contract

All frontend and simulator code must consume this structure.

```json
{
  "outcome": "ALLOW",
  "score": 10,
  "breakdown": {
    "base": 5,
    "sensitivity": 5,
    "environment": 0,
    "taint": 0,
    "signals": 0
  },
  "rules": [],
  "approval_id": null,
  "result": {
    "content": "..."
  },
  "timings": {
    "decision_ms": 3.2,
    "audit_ms": 1.1,
    "exec_ms": 4.8
  }
}
```

## Outcome enum

```text
ALLOW
CONSTRAIN
ESCALATE
DENY
```

No frontend or gateway may invent another outcome.

---

# 6. HTTP Status Contract

| Outcome | HTTP |
|---|---:|
| ALLOW | 200 |
| CONSTRAIN | 200 |
| ESCALATE | 202 |
| DENY | 403 |

Errors should use structured JSON.

Example:

```json
{
  "error": "authorization_denied",
  "reason": "HD3",
  "message": "Destructive shell command blocked"
}
```

Never expose secrets or internal credentials.

---

# 7. Canonical Request Contract

Member 1 owns canonicalization.

Every action must produce:

```text
canonical_action
canonical_target
canonical_params
request_hash
```

Hash:

```text
SHA256(
    session_id
    + action
    + canonical_target
    + canonical_params_json
)
```

The hash is used by:

- approvals;
- replay protection;
- audit;
- evaluation.

Frontend must display the hash but never calculate an alternative hash.

---

# 8. Resource Metadata Contract

Member 1 owns the Resource Registry.

The agent does NOT supply resource metadata.

Registry output:

```json
{
  "trust": "internal",
  "sensitivity": "confidential",
  "environment": "prod"
}
```

Allowed trust:

```text
trusted
internal
user
external
untrusted
```

Allowed sensitivity:

```text
public
internal
confidential
restricted
```

Allowed environment:

```text
dev
staging
prod
```

Unknown resources MUST resolve to:

```text
trust = untrusted
sensitivity = restricted
environment = prod
```

---

# 9. Hard-Deny Contract

Member 1 owns HD1–HD10.

```text
HD1 = secret/credential path
HD2 = path escape/symlink
HD3 = destructive/unparseable shell
HD4 = dangerous/illegal SQL
HD5 = disallowed egress
HD6 = private/metadata/non-HTTP target
HD7 = sensitive-data exfiltration armed
HD8 = untrusted lineage indicator match
HD9 = approval redemption failure
HD10 = missing grant
```

Hard-denies are authoritative.

Human approval cannot override:

```text
HD1–HD8
HD10
```

---

# 10. Risk Contract

Member 1 owns risk scoring.

```text
score = min(
  100,
  base
  + sensitivity
  + environment
  + taint
  + signals
)
```

## Base scores

```text
file.read   = 5
db.read     = 15
http.get    = 15
file.write  = 25
email.send  = 30
db.write    = 35
http.post   = 35
code.execute = 40
```

## Sensitivity

```text
public       = 0
internal     = 5
confidential = 15
restricted   = 25
```

## Environment

```text
dev     = 0
staging = 5
prod    = 20
```

## Taint

```text
trusted/internal = 0
user             = 5
external         = 10
untrusted        = 20
```

## Advisory signals

```text
injection            = +15
burst >20/10s        = +10
risky Python imports = +10
```

## Decision bands

```text
<30     ALLOW
30–54   CONSTRAIN
55–79   ESCALATE
>=80    DENY
```

---

# 11. Gateway Contract

**Owner:** Member 2

Member 2 provides controlled execution services to the Governor.

The Governor should depend on an interface, not gateway implementation details.

Conceptual interface:

```python
class ToolGateway(Protocol):

    async def execute(
        self,
        action: str,
        target: str,
        params: dict,
        constraints: dict | None = None,
    ) -> ToolResult:
        ...
```

## ToolResult

```python
@dataclass
class ToolResult:
    success: bool
    data: object | None
    error: str | None
    metadata: dict
```

Member 1 should be able to call the gateway without knowing whether the implementation is:

- file;
- HTTP;
- database;
- email;
- executor.

---

# 12. Gateway Types

Member 2 owns:

```text
FileGateway
HttpGateway
DatabaseGateway
EmailGateway
ExecutorClient
```

## FileGateway

Input:

```text
path
operation
constraints
```

Must re-check:

- realpath;
- containment;
- symlinks;
- size limits.

## HttpGateway

Input:

```text
method
url
params/body
constraints
```

Must enforce:

- allowlist;
- DNS validation;
- private-IP rejection;
- redirect validation;
- timeout;
- response-size cap.

## DatabaseGateway

Input:

```text
database
SQL
constraints
```

Must enforce:

- read-only reads;
- transaction writes;
- max rows;
- rollback on violation.

## EmailGateway

Input:

```text
recipient
subject
body
```

Uses internal outbox.

## ExecutorClient

Runs authorized code in isolated executor.

---

# 13. Ledger Contract

**Owner:** Member 3

Member 3 owns the provenance/taint ledger.

When a tool returns content, it must be possible to record:

```json
{
  "session_id": "sess_001",
  "source": "http:news.local/poisoned",
  "trust": "untrusted",
  "sensitivity": "public",
  "indicators": [
    "attacker.local",
    "evil.example"
  ],
  "injection_flag": true
}
```

## Ledger API

Conceptually:

```python
ledger.record(
    session_id=session_id,
    source=source,
    trust=trust,
    sensitivity=sensitivity,
    indicators=indicators,
    injection_flag=injection_flag,
)
```

And:

```python
ledger.get_session_taint(session_id)
ledger.get_indicators(session_id)
ledger.has_untrusted_indicator(session_id, value)
```

Member 1 consumes these results during authorization.

---

# 14. Injection Detector Contract

**Owner:** Member 3

Injection detection is advisory.

Interface:

```python
class InjectionDetector(Protocol):

    def analyze(self, content: str) -> InjectionResult:
        ...
```

Result:

```json
{
  "detected": true,
  "score": 0.92,
  "signals": [
    "ignore_previous_instructions",
    "credential_exfiltration"
  ]
}
```

Important:

```text
Injection detector ≠ authorization engine.
```

It may produce:

```text
+15 risk
```

and a UI badge.

It cannot independently authorize or deny an action.

---

# 15. Agent Scenario Contract

**Owner:** Member 3

All eight scenarios must be callable through a consistent interface.

```python
class Scenario(Protocol):

    name: str

    async def run(self) -> ScenarioResult:
        ...
```

Scenario result:

```json
{
  "scenario": "production_db_write",
  "expected": "ESCALATE",
  "actual": "ESCALATE",
  "passed": true,
  "side_effect_verified": true
}
```

Frozen scenarios:

```text
1. Safe file read
2. rm -rf /
3. Production DB update
4. Approval replay
5. Malicious email
6. Sensitive-data exfiltration
7. Benign post-poisoning write
8. Path traversal
```

---

# 16. Evaluation Contract

Member 3 owns benchmark structure.

Each case should contain:

```json
{
  "id": "ADV-001",
  "category": "path_traversal",
  "action": "file.read",
  "target": "...",
  "params": {},
  "expected_outcome": "DENY",
  "expected_rules": ["HD2"]
}
```

The evaluation runner produces:

```json
{
  "mode": "full",
  "total": 80,
  "attack_success_rate": 0.0,
  "benign_completion_rate": 0.95,
  "false_positive_rate": 0.05,
  "escalation_rate": 0.12,
  "p50_ms": 4.2,
  "p95_ms": 9.8,
  "p99_ms": 15.1
}
```

These values are examples of structure only.

Never hard-code benchmark results.

---

# 17. Approval Contract

**Backend owner:** Member 1  
**Frontend owner:** Member 5

## GET /v1/approvals

Returns:

```json
{
  "items": [
    {
      "id": "approval_001",
      "session_id": "sess_001",
      "agent_name": "DataAgent",
      "action": "db.write",
      "target": "db:prod/orders",
      "canonical_params": {
        "sql": "UPDATE orders SET ... WHERE ..."
      },
      "request_hash": "sha256...",
      "score": 70,
      "breakdown": {},
      "rules": [],
      "status": "PENDING",
      "expires_at": "..."
    }
  ]
}
```

## Approve

```text
POST /v1/approvals/{id}/approve
```

## Deny

```text
POST /v1/approvals/{id}/deny
```

Approval expires after 300 seconds.

Reviewer cannot be session creator.

---

# 18. Audit Contract

**Backend:** Member 1  
**Frontend:** Member 5

Audit event:

```json
{
  "seq": 42,
  "ts": "...",
  "type": "decision",
  "payload": {},
  "prev_hash": "...",
  "hash": "..."
}
```

Verification:

```text
GET /v1/audit/verify
```

Response:

```json
{
  "ok": true,
  "first_bad_seq": null
}
```

Tampered:

```json
{
  "ok": false,
  "first_bad_seq": 42
}
```

---

# 19. Metrics Contract

**Backend:** Member 1/3  
**Frontend:** Member 4/5

`GET /v1/metrics`

Example:

```json
{
  "actions": {
    "total": 1200,
    "allow": 700,
    "constrain": 180,
    "escalate": 120,
    "deny": 200
  },
  "latency": {
    "decision_p50_ms": 3.1,
    "decision_p95_ms": 8.4,
    "decision_p99_ms": 14.2,
    "audit_p95_ms": 2.1
  },
  "approvals": {
    "pending": 3,
    "approved": 17,
    "denied": 8
  }
}
```

Frontend must display measured values from the API.

---

# 20. SSE Contract

**Backend:** Member 1  
**Frontend:** Member 4

Endpoint:

```text
GET /v1/stream
```

Events may include:

```text
decision
approval
execution
audit
system
```

Example:

```text
event: decision
data: {
  "seq": 42,
  "action": "db.write",
  "outcome": "ESCALATE",
  "score": 70
}
```

Frontend must reconnect after connection loss.

---

# 21. Frontend Shared Types

Member 4 and Member 5 must share one frontend API/types layer.

Recommended:

```text
frontend/
├── lib/
│   └── api.ts
├── types/
│   ├── action.ts
│   ├── approval.ts
│   ├── audit.ts
│   ├── metrics.ts
│   └── scenario.ts
└── components/
```

Do not create duplicate versions of API types.

---

# 22. Frontend Ownership Boundary

## Member 4

Own:

```text
Dashboard
Live Activity
Action Detail
System Status
Metrics
SSE
```

## Member 5

Own:

```text
Approval Queue
Approval Detail
Audit Viewer
Audit Verification
Evaluation
Scenario Launcher
```

## Shared

```text
API client
types
layout
navigation
base components
```

Shared files should be changed only when necessary.

---

# 23. Frontend Rule

The frontend is NEVER a security boundary.

It must not:
- calculate authoritative risk;
- approve hard-denies;
- modify policy decisions;
- bypass the Governor;
- execute tools directly.

The frontend only requests and displays backend decisions.

---

# 24. Backend Ownership Boundary

## Member 1

Own:

```text
governor/
api/
core/
```

## Member 2

Own:

```text
gateway/
executor/
mock-web/
docker-compose.yml
```

## Member 3

Own:

```text
ledger/injection
agents/
evaluation/
security tests
chaos tests
performance tests
```

If Member 2 needs a core authorization change, request it from Member 1 instead of duplicating it.

If Member 3 needs risk behavior changed, coordinate with Member 1.

---

# 25. Integration Points

## Integration A — Member 1 ↔ Member 2

```text
Governor
   ↓
ToolGateway
   ↓
ToolResult
```

Member 1 decides.

Member 2 executes.

Neither duplicates the other's responsibility.

## Integration B — Member 1 ↔ Member 3

```text
Ledger / Injection Signals
          ↓
Governor
          ↓
Risk + Hard Rules
```

Member 3 supplies signals.

Member 1 remains authoritative for decisions.

## Integration C — Backend ↔ Member 4

```text
API + SSE
   ↓
Dashboard
```

## Integration D — Backend ↔ Member 5

```text
Approvals + Audit + Evaluation APIs
   ↓
Security UI
```

## Integration E — Member 4 ↔ Member 5

Share:
- API types;
- layout;
- UI primitives.

Do not share page ownership.

---

# 26. Mock Data Contract

Frontend developers may work before backend completion.

Create:

```text
frontend/mock/
```

Mock responses must use exactly the same schemas defined here.

When backend becomes available:

```text
mock API → real API
```

No UI redesign should be required.

---

# 27. Integration Sequence

### Phase 1 — Contract Freeze

All 5 members:

- review this file;
- agree on schemas;
- agree on endpoint names;
- agree on enums;
- agree on ownership.

### Phase 2 — Parallel Development

```text
M1 → Core
M2 → Gateway
M3 → Security/Evaluation
M4 → Dashboard
M5 → Approval/Audit
```

### Phase 3 — Backend Integration

```text
M1 + M2 + M3
```

Run all eight scenarios.

### Phase 4 — Frontend Integration

```text
M4 + M5 + backend
```

Connect real APIs.

### Phase 5 — Full System

Run:

```text
8 scenarios
+
held-out benchmark
+
side-effect oracles
+
load test
+
chaos tests
+
demo
```

---

# 28. Breaking Change Policy

A breaking change is any modification to:

- endpoint path;
- request field;
- response field;
- enum;
- authentication mechanism;
- request hash algorithm;
- decision semantics;
- hard-deny semantics.

Breaking changes require agreement from:

- Member 1;
- Member 3;
- affected frontend owner.

Document the change before implementation.

---

# 29. Git Rules

Recommended branches:

```text
main
dev
feature/member-1-core
feature/member-2-gateway
feature/member-3-security-eval
feature/member-4-dashboard
feature/member-5-approval-audit
```

Do not directly modify another member's owned implementation without coordination.

---

# 30. Final Parallel-Work Guarantee

The architecture is considered parallel-ready when:

- [ ] API schemas are frozen.
- [ ] Response types are frozen.
- [ ] Database schema is frozen.
- [ ] Gateway interface is frozen.
- [ ] Ledger interface is frozen.
- [ ] Scenario schema is frozen.
- [ ] Frontend shared types exist.
- [ ] Each member has a non-overlapping primary directory.
- [ ] Mock API responses exist for frontend.
- [ ] No developer needs another developer's unfinished implementation to begin basic work.

After these conditions are met, all five members should be able to work simultaneously.
