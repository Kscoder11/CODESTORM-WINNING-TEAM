# PRD — PNG5 Agent Permission Governor

## 1. Product Overview

PNG5 is a runtime authorization and enforcement layer positioned between an AI agent and the tools/execution environment.

The agent may propose an action, but the Governor determines whether the action can execute.

## 2. Problem

Autonomous agents can:
- access sensitive files;
- modify databases;
- call external services;
- execute code;
- send data externally;
- follow malicious instructions embedded in external content.

Traditional application authorization is often static and disconnected from agent context.

PNG5 provides context-aware, least-privilege runtime enforcement.

## 3. Product Goal

Build a working hackathon-grade Governor that:

- authenticates agents through session tokens;
- validates and canonicalizes actions;
- resolves server-side resource metadata;
- enforces hard security rules;
- verifies session grants;
- tracks provenance and taint;
- calculates explainable risk;
- allows, constrains, escalates, or denies actions;
- supports human approval for high-risk legitimate operations;
- executes approved actions through controlled gateways/sandbox;
- produces tamper-evident audit records;
- provides measurable evaluation.

## 4. Target Users

### Agent
Requests actions through the Governor.

### Orchestrator
Creates sessions and grants least-privilege scopes.

### Reviewer
Approves or denies escalated actions.

### Administrator
Manages policies, audit verification, and emergency suspension.

### Judge / Evaluator
Uses the dashboard and benchmark results to verify security behavior.

## 5. Supported Tools

- `file.read`
- `file.write`
- `http.get`
- `http.post`
- `db.read`
- `db.write`
- `code.execute`
- `email.read`
- `email.send`

## 6. Core Outcomes

| Risk/Rule State | Outcome |
|---|---|
| Score < 30 | ALLOW |
| Score 30–54 | CONSTRAIN |
| Score 55–79 | ESCALATE |
| Score >= 80 | DENY |
| Hard-deny rule | DENY |

Hard-denies are independent of the numerical risk score.

## 7. Required Demo Scenarios

1. Safe file read → ALLOW.
2. `rm -rf /` → HD3 → DENY.
3. Production DB update → score 70 → ESCALATE → human approval → execute.
4. Approval replay/query modification → HD9 → DENY.
5. Malicious email destination/lineage → DENY.
6. Sensitive read followed by external exfiltration → HD7/HD8 → DENY.
7. Benign post-poisoning workspace write → CONSTRAIN.
8. Path traversal/secret access → DENY.

## 8. Non-Goals

Do not build:
- Kubernetes;
- custom kernel modules;
- complex IAM;
- custom LLMs;
- fine-tuning;
- RAG/vector databases;
- blockchain audit;
- mobile apps;
- multi-agent orchestration;
- unnecessary microservices;
- full OpenShell clone.

## 9. Success Criteria

The MVP is successful when:
- all eight scenarios behave as specified;
- agent network isolation is tested;
- agent metadata spoofing is rejected;
- approval replay/swap is rejected;
- hard-denies remain non-overridable;
- audit chain verifies and detects tampering;
- held-out benchmark runs once;
- latency is measured separately for decision, audit, and execution;
- chaos tests fail closed;
- Docker Compose starts the complete demo stack.
