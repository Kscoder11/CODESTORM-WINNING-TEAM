# Security Requirements — PNG5

## Security Boundaries

### Agent Boundary
Agent can only communicate with Governor.

### Governor Boundary
Governor evaluates every action and is the only trusted decision point.

### Gateway Boundary
Gateways execute only actions authorized by Governor.

### Executor Boundary
Executor is isolated from network and host privileges.

## Threats

- prompt injection;
- privilege escalation;
- path traversal;
- symlink escape;
- SSRF;
- metadata service access;
- SQL injection/dangerous SQL;
- shell injection;
- data exfiltration;
- approval replay;
- approval payload swapping;
- confused deputy;
- session reset/taint reset;
- policy corruption;
- executor failure;
- audit tampering.

## Required Defenses

Every threat must map to:
- detection;
- enforcement;
- test.

## Fail-Closed Requirements

Any uncertainty in:
- canonicalization;
- session validity;
- approval redemption;
- grant validation;
- security policy parsing;
- executor availability

must not silently permit execution.

## Residual Limitations

1. Literal lineage matching can miss paraphrases.
2. Resource labels determine classification quality.
3. Single-worker/in-memory state limits scaling.
4. SQLite is demo-oriented.
5. Socket proxy reduces but does not eliminate Docker risk.

These limitations must be documented rather than hidden.
