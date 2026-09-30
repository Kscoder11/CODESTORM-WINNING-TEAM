# Team Operating Plan — 5 Members

## Team Split

### Backend / Security — 3 members

**Member 1 — Core Authorization**
- schemas;
- authentication/session;
- canonicalization;
- resource registry;
- hard-denies;
- grants;
- risk;
- decision engine;
- approvals;
- audit chain.

**Member 2 — Gateway & Runtime**
- file gateway;
- HTTP gateway;
- DB gateway;
- email gateway;
- executor;
- Docker socket proxy;
- mock web;
- Docker Compose;
- network isolation.

**Member 3 — Security & Evaluation**
- ledger;
- lineage;
- injection advisory;
- scripted scenarios;
- optional LLM agent;
- benchmark dataset;
- runner;
- side-effect oracles;
- security/performance/chaos tests.

### Frontend — 2 members

**Member 4 — SOC Dashboard & Live Activity**
- dashboard;
- metrics cards;
- live SSE activity;
- action detail;
- system status;
- responsive layout.

**Member 5 — Approvals, Audit & Evaluation**
- approval queue;
- approve/deny flows;
- audit viewer;
- chain verification;
- tamper demo;
- evaluation report;
- scenario launcher.

## Shared Integration Rules

- Backend owns API contracts.
- Frontend must not duplicate authorization logic.
- Member 1 publishes stable Pydantic/API contracts first.
- Member 2 publishes Docker/service contracts.
- Member 3 publishes evaluation schemas and expected outcomes.
- Members 4/5 can build against mock JSON while APIs are being finalized.
- No member changes frozen security semantics independently.
- All security rule changes require team review.
