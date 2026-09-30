# Definition of Done — PNG5

## Core Security

- [ ] Agent cannot directly reach execution resources.
- [ ] Session tokens work.
- [ ] Agent metadata spoofing is rejected.
- [ ] Unknown resources receive conservative labels.
- [ ] Canonicalization occurs before policy evaluation.
- [ ] HD1–HD10 implemented and tested.
- [ ] Grants enforce least privilege.
- [ ] Risk arithmetic matches frozen scenarios.
- [ ] Approval is request-hash-bound.
- [ ] Approval redemption is atomic.
- [ ] Hard-denies cannot be overridden.

## Provenance

- [ ] Tool outputs enter ledger.
- [ ] Trust/sensitivity are stored.
- [ ] Indicators are extracted.
- [ ] Lineage rule works.
- [ ] Injection detection is advisory.

## Runtime

- [ ] File gateway secure.
- [ ] HTTP gateway SSRF-resistant.
- [ ] SQL gateway constrained.
- [ ] Email outbox enforced.
- [ ] Executor isolated.
- [ ] Socket proxy restricted.
- [ ] Agent network isolated.

## Audit

- [ ] Decisions audited.
- [ ] Hash chain generated.
- [ ] `/v1/audit/verify` works.
- [ ] Tamper demo detects modification.

## Evaluation

- [ ] 200 cases exist.
- [ ] 120 dev cases.
- [ ] 80 blind held-out cases.
- [ ] Held-out set frozen at hour 10.
- [ ] Single held-out run at hour 18.
- [ ] Three baselines measured.
- [ ] Side-effect oracles work.
- [ ] Confidence intervals generated.
- [ ] Actual latency recorded.

## Frontend

- [ ] Dashboard works.
- [ ] Live SSE feed works.
- [ ] Approval queue works.
- [ ] Audit viewer works.
- [ ] Evaluation page works.
- [ ] Scenario launcher works.
- [ ] Error/loading states work.

## Operations

- [ ] Docker Compose starts stack.
- [ ] Health endpoint works.
- [ ] Chaos tests fail closed.
- [ ] README is complete.
- [ ] Demo rehearsed.
- [ ] No fabricated benchmark claims.
