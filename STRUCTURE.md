# System Structure — PNG5

## 1. Runtime Structure

```text
Orchestrator
    |
    | POST /v1/sessions
    v
Agent
    |
    | POST /v1/actions
    v
Governor
    |
    +--> Authentication
    +--> Schema Validation
    +--> Canonicalization
    +--> Resource Registry
    +--> Hard-Deny Rules
    +--> Grants
    +--> Lineage/Taint
    +--> Risk Engine
    +--> Decision Engine
    +--> Approval Redemption
    +--> Audit Chain
    |
    +--> Tool Gateway
    +--> Executor Service
    +--> Mock Web
    |
    +--> SSE --> Frontend
```

## 2. Repository Structure

```text
agent-governor/
├── governor/
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── schemas.py
│   ├── api/
│   │   ├── sessions.py
│   │   ├── actions.py
│   │   ├── approvals.py
│   │   ├── audit.py
│   │   ├── stream.py
│   │   └── admin.py
│   └── core/
│       ├── canon.py
│       ├── registry.py
│       ├── hard_rules.py
│       ├── grants.py
│       ├── ledger.py
│       ├── injection.py
│       ├── risk.py
│       ├── decide.py
│       ├── approvals.py
│       └── audit_chain.py
├── gateway/
│   ├── files.py
│   ├── http.py
│   ├── db.py
│   ├── email.py
│   └── executor_client.py
├── executor/
│   ├── app.py
│   └── Dockerfile
├── mock-web/
│   └── app.py
├── agents/
│   ├── scripted.py
│   ├── llm_agent.py
│   └── scenarios.py
├── policies/
│   ├── policy.yaml
│   └── resources.yaml
├── demo/
│   ├── seed.py
│   ├── prod.db
│   ├── staging.db
│   └── workspace/
├── evaluation/
│   ├── dev.json
│   ├── heldout.json
│   ├── runner.py
│   ├── oracles.py
│   └── report.py
├── tests/
│   ├── unit/
│   ├── security/
│   ├── integration/
│   ├── chaos/
│   └── perf/
├── frontend/
├── docker-compose.yml
├── .env.example
└── README.md
```

## 3. Network Structure

### agent_net
Contains:
- agent;
- governor.

Agent has no direct egress.

### backend_net
Contains:
- governor;
- gateway/executor;
- socket proxy;
- mock-web.

### ui_net
Contains frontend and required UI-facing services.

## 4. Data Ownership

| Data | Owner |
|---|---|
| Sessions | Governor |
| Grants | Governor |
| Taint ledger | Governor |
| Policies | Governor/Admin |
| Tool credentials | Gateway/Governor boundary |
| Approvals | Governor |
| Audit chain | Governor |
| Benchmark data | Evaluation |
| UI state | Frontend |
