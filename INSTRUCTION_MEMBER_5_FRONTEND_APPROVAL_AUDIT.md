# Member 5 Instructions — Frontend Approvals, Audit & Evaluation

## Mission

Build the judge-facing security controls: human approval, audit verification, tamper demonstration, and benchmark results.

## Primary Pages

### Approval Queue

Show:
- agent;
- task;
- action;
- target;
- risk score;
- score breakdown;
- triggered rules;
- provenance chain;
- exact canonical request;
- expiration countdown.

Buttons:
- Approve;
- Deny.

Approval UI must make clear that human approval does NOT override hard-denies.

### Audit Viewer

Show:
- sequence;
- timestamp;
- action;
- outcome;
- request hash;
- previous hash;
- current hash;
- execution status.

### Audit Verification

Call:

`GET /v1/audit/verify`

Show:
- chain intact;
- first bad sequence if corrupted.

### Tamper Demo

Provide a controlled UI flow that demonstrates:
1. audit chain is valid;
2. a demo row is modified;
3. verification fails.

Do not provide arbitrary destructive database editing functionality.

### Evaluation Page

Show:
- OFF;
- REGEX_ONLY;
- FULL;
- attack success;
- benign completion;
- false-positive rate;
- escalation rate;
- p50/p95/p99;
- confidence intervals.

### Scenario Launcher

Allow judges to trigger the eight scripted scenarios.

## Design Principles

- Approval actions must feel deliberate.
- Clearly distinguish DENY from ESCALATE.
- Display rule IDs.
- Display measured metrics, not fabricated claims.
- Keep the UI fast and reliable.

## Development Strategy

Build using mock API responses first.

Integrate with backend once endpoints stabilize.

## Tests

Verify:
- approval list;
- approve;
- deny;
- expired approval;
- error state;
- audit verification;
- tamper failure;
- benchmark rendering;
- scenario launch.

## Do Not Build

- frontend authorization;
- independent risk calculations;
- fake benchmark values;
- complex animations;
- unrelated pages.
