# Project Memory — PNG5

This file is the persistent project context for AI coding agents.

## Identity

Project: PNG5 — Agent Permission Governor

Theme: Generative AI & LLM Applications / AI Security Infrastructure

Core motto:

> The AI Agent should NEVER execute an action directly.

## Frozen Stack

Backend:
- Python 3.12
- FastAPI
- Pydantic v2
- SQLAlchemy 2
- SQLite WAL
- sqlglot
- bashlex
- httpx
- pyyaml
- pytest
- Locust

Frontend:
- Next.js 14
- TypeScript
- Tailwind
- SSE

## Frozen Security Decisions

- Server-side resource registry.
- Unknown resources → untrusted/restricted/prod.
- Session-bound taint.
- Opaque agent session token.
- Canonical request hashing.
- Atomic approval redemption.
- Hard-denies separate from risk score.
- Agent network has no direct egress.
- Separate executor service.
- Docker socket proxy.
- Injection detector is advisory.
- Canonicalization precedes policy evaluation.
- Held-out benchmark.
- Hash-chained audit.
- Scripted agent required.
- LLM agent optional.

## Roles

- orchestrator
- agent
- reviewer
- admin

## Modes

- full
- regex_only
- off

## Tools

- file.read
- file.write
- http.get
- http.post
- db.read
- db.write
- code.execute
- email.read
- email.send

## Decision Bands

- <30 ALLOW
- 30–54 CONSTRAIN
- 55–79 ESCALATE
- >=80 DENY

## Never Change Without Team Agreement

- hard-deny semantics;
- canonicalization order;
- approval hash binding;
- unknown-resource defaults;
- network isolation;
- held-out evaluation methodology;
- frozen scenario outcomes.

## Current Team Ownership

Member 1: Backend Core

Member 2: Gateway/Runtime

Member 3: Security/Evaluation

Member 4: Frontend Dashboard/Live Activity

Member 5: Frontend Approvals/Audit/Evaluation UI

## AI Agent Rules

When asked to implement:
1. Read MEMORY.md.
2. Read PRD.md.
3. Read STRUCTURE.md.
4. Read DESIGN.md.
5. Read the relevant member instruction.
6. Inspect existing repository state.
7. Do not modify another member's owned area without coordination.
8. Preserve API contracts.
9. Add tests with security-sensitive changes.
10. Never claim a test passed unless it was actually run.
11. Never fabricate benchmark or performance numbers.
12. Never weaken a hard-deny to make a demo pass.
