# PNG5 — Agent Permission Governor

## Project Status

**Status:** Frozen implementation blueprint  
**Problem:** PNG5 — Agent Permission Governor  
**Theme:** Generative AI & LLM Applications / AI Security Infrastructure

> **Core Motto:** The AI Agent should NEVER execute an action directly.

This documentation pack is the shared source of truth for the five-member hackathon team. It converts the frozen engineering blueprint into implementation-facing documentation without starting implementation.

## Source of Truth

The frozen blueprint defines:
- server-side resource labels;
- session-bound taint;
- request-hash-bound approvals;
- hard-deny rules separate from risk scoring;
- agent network isolation;
- a separate executor behind a Docker socket proxy;
- deterministic/advisory injection detection;
- canonicalization before policy evaluation;
- a 200-case held-out benchmark;
- separate decision/audit/execution latency;
- hash-chained audit logging;
- scripted agent plus optional LLM agent.

Do not redesign these decisions without team agreement.

## Team

| Member | Primary Ownership |
|---|---|
| Member 1 | Backend Core & Authorization |
| Member 2 | Backend Gateway & Runtime Infrastructure |
| Member 3 | Backend Security, Provenance & Evaluation |
| Member 4 | Frontend Security Operations Dashboard |
| Member 5 | Frontend Approvals, Audit & Evaluation UI |

## Shared Engineering Rules

1. Never allow an agent to execute directly.
2. Never trust agent-supplied provenance, sensitivity, or environment labels.
3. Unknown resources default to `untrusted / restricted / prod`.
4. Hard-denies cannot be overridden by human approval.
5. Approval is bound to the canonical request hash.
6. Canonicalization happens before policy evaluation.
7. Deterministic authorization remains authoritative.
8. LLM functionality is optional and never security-critical.
9. Every meaningful decision is auditable.
10. Measure actual performance; never fabricate results.
11. Freeze core features at hour 16.
12. Do not introduce unnecessary microservices or enterprise infrastructure.
