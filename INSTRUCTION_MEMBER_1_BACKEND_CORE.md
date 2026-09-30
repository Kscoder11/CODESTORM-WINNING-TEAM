# Member 1 Instructions — Backend Core & Authorization

## Mission

Own the Governor's central authorization pipeline.

## Primary Responsibilities

Implement and integrate:
- Pydantic request/response schemas;
- API-key authentication;
- session creation/validation;
- canonicalization;
- resource registry;
- hard-deny rules HD1–HD10;
- grants;
- risk scoring;
- decision synthesis;
- approval state machine;
- request-hash redemption;
- audit chain.

## Required Pipeline

```text
Auth
→ Schema
→ Canonicalize
→ Registry
→ Hard-Deny
→ Grants
→ Lineage input
→ Risk
→ Decision
→ Approval redemption
→ Audit
```

## Security Rules

Never accept agent-supplied:
- trust;
- sensitivity;
- environment.

Unknown resources must use conservative labels.

Never allow approval to override HD1–HD8 or HD10.

Approval must bind to:
```text
SHA256(session_id + action + canonical_target + canonical_params)
```

## Tests You Own

- schema rejects forbidden metadata;
- path canonicalization;
- URL canonicalization;
- SQL parsing;
- shell parsing;
- every hard-deny rule;
- risk arithmetic;
- approval replay;
- approval payload swap;
- expired approval;
- self-approval;
- audit-chain verification.

## Deliverable

A stable backend core that Member 2 and Member 3 can call without bypassing the authorization pipeline.

## Do Not Build

- frontend;
- Docker sandbox internals;
- LLM classifier;
- unrelated authentication systems;
- PostgreSQL;
- JWT capability tokens.
