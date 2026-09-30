# API Contract — PNG5

## Authentication

### Orchestrator
API key.

### Reviewer
API key.

### Admin
API key.

### Agent
Opaque session token.

## Endpoints

### POST /v1/sessions

Creates a session.

Request concept:
- agent_name
- task
- ttl
- grants[]

Response:
- session_id
- session_token

Only orchestrator can create sessions.

### POST /v1/actions

Agent authorization/execution endpoint.

Request:
- action
- target
- params
- optional approval_id

Agent cannot submit:
- trust
- sensitivity
- environment
- arbitrary policy metadata.

Response includes:
- outcome;
- score;
- breakdown;
- triggered rules;
- approval_id when escalated;
- result when executed;
- timings.

HTTP semantics:
- 200 → ALLOW/CONSTRAIN
- 202 → ESCALATE
- 403 → DENY

### POST /v1/actions?dry_run=true

Evaluation-only execution.

Must not create real side effects.

### GET /v1/approvals

Reviewer approval queue.

Returns:
- exact canonical action;
- parameters;
- request hash;
- risk breakdown;
- provenance chain;
- expiration.

### POST /v1/approvals/{id}/approve

Approves a pending request.

Reviewer cannot be session creator.

### POST /v1/approvals/{id}/deny

Denies a pending request.

### GET /v1/audit

Admin/reviewer audit inspection.

### GET /v1/audit/verify

Admin-only hash-chain verification.

Returns:
- `ok`;
- `first_bad_seq` when invalid.

### GET /v1/stream

SSE stream for:
- decisions;
- approvals;
- execution results;
- audit events;
- system events.

### POST /v1/policies/reload

Admin-only policy reload.

Use last-good-wins on parse failure.

### POST /v1/sessions/{id}/suspend

Emergency session kill switch.

### GET /v1/metrics

Returns measured:
- outcome counts;
- p50;
- p95;
- p99;
- approval latency;
- execution timing.

### GET /healthz

Health status.

## Error Principles

Errors must:
- be structured;
- include stable reason/rule IDs where appropriate;
- avoid leaking secrets;
- never silently bypass security controls.
