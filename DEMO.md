# Four-Minute Demo Script — PNG5

## 0:00–0:40 — Architecture

Show:

```text
Agent
 ↓
Governor
 ↓
Decision
 ↓
Gateway / Executor
```

Say:

> The agent never receives direct access to tools. Every action must pass through the Governor.

Show agent network isolation.

## 0:40–1:20 — Safe + Destructive

### Safe

Run scenario 1.

Expected:
- score 10;
- ALLOW.

### Destructive

Run scenario 2.

Expected:
- HD3;
- DENY.

## 1:20–2:20 — Human Approval + Replay

Run production DB update.

Expected:
- score 70;
- ESCALATE.

Reviewer approves.

Action executes.

Then modify one character in the query.

Expected:
- request hash mismatch;
- DENY.

This demonstrates approval is bound to the exact request.

## 2:20–3:10 — Prompt Injection + Provenance

Run malicious webpage/exfiltration scenario.

Compare:
- OFF → attack reaches sentinel;
- FULL → blocked.

Show:
- untrusted provenance;
- injection badge;
- HD7/HD8.

Then run benign post-poisoning file write.

Expected:
- CONSTRAIN rather than blindly blocking legitimate work.

## 3:10–4:00 — Evaluation + Tamper

Show:
- OFF;
- REGEX_ONLY;
- FULL;
- held-out benchmark;
- confidence intervals;
- p95 latency.

Then show audit tampering.

Run `/v1/audit/verify`.

Expected:
- verification failure.

Finish with:

> The Governor separates what an agent wants to do from what it is actually authorized to do.
