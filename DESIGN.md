# Security & Technical Design — PNG5

## 1. Core Security Principle

The agent can request an action but cannot directly execute it.

## 2. Exact Authorization Pipeline

1. Authenticate session token.
2. Validate request schema with `extra="forbid"`.
3. Enforce 64 KB body limit.
4. Canonicalize action inputs.
5. Resolve resource metadata from server-side registry.
6. Run HD1–HD10.
7. Verify grants.
8. Update/read lineage and taint.
9. Calculate risk score.
10. Synthesize decision.
11. If approval is being redeemed, atomically consume the exact request-bound approval.
12. Append audit event.
13. Execute through the gateway.
14. Label resulting content and update ledger.

## 3. Canonicalization

### Files
- Unicode NFKC.
- Strip zero-width/control characters.
- `realpath`.
- Containment under `/workspace`.
- `lstat` each component.
- Reject symlinks.
- Gateway re-check at open time.
- Use `O_NOFOLLOW`.

### URLs
- Parse URL.
- Lowercase host.
- IDNA normalization.
- Reject userinfo.
- HTTP/HTTPS only.
- Resolve DNS once.
- Reject private, loopback, link-local and metadata addresses.
- Re-check redirects.

### SQL
Use `sqlglot` to derive:
- statement type;
- tables;
- WHERE presence;
- multi-statement status.

### Shell
Use `bashlex` and normalize into argv.

### Email
Extract recipient domains.

## 4. Hard-Deny Rules

| Rule | Meaning |
|---|---|
| HD1 | Secret/credential path |
| HD2 | Path escape/symlink |
| HD3 | Destructive/unparseable shell |
| HD4 | Dangerous/illegal SQL |
| HD5 | Disallowed egress |
| HD6 | Private/metadata/non-HTTP target |
| HD7 | Sensitive-data exfiltration armed |
| HD8 | Untrusted lineage indicator match |
| HD9 | Approval redemption failure |
| HD10 | Missing least-privilege grant |

Human approval cannot override HD1–HD8 or HD10.

## 5. Risk Model

```text
score = min(
  100,
  base_action
  + sensitivity
  + environment
  + session_taint
  + advisory_signals
)
```

### Base

| Action | Points |
|---|---:|
| file.read | 5 |
| db.read | 15 |
| http.get | 15 |
| file.write | 25 |
| email.send | 30 |
| db.write | 35 |
| http.post | 35 |
| code.execute | 40 |

### Sensitivity
- public 0
- internal 5
- confidential 15
- restricted 25

### Environment
- dev 0
- staging 5
- prod 20

### Taint
- trusted/internal 0
- user 5
- external 10
- untrusted 20

### Advisory Signals
- injection +15
- burst >20/10s +10
- risky Python imports +10

## 6. Decisions

- `<30`: ALLOW
- `30–54`: CONSTRAIN
- `55–79`: ESCALATE
- `>=80`: DENY

## 7. Provenance

Resource metadata is never accepted from the agent.

Registry provides:
- trust;
- sensitivity;
- environment.

Unknown targets:
- untrusted;
- restricted;
- prod.

The ledger records indicators from tool outputs. Indicators include emails, hostnames, URLs, paths and identifiers of six or more characters.

## 8. Approval Security

Approval contains:
- request hash;
- original decision;
- reviewer;
- status;
- timestamps.

Redemption:
- recompute canonical request hash;
- re-run hard-denies;
- atomic CAS;
- consume once;
- reject changed payloads;
- reject expired approvals.

Reviewer cannot be the session creator.

## 9. Audit Security

Each audit event contains:
- sequence;
- timestamp;
- type;
- canonical payload;
- previous hash;
- current hash.

```text
hash = SHA256(prev_hash || canonical(payload))
```

`/v1/audit/verify` recomputes the chain.

## 10. Runtime Isolation

Executor:
- separate container;
- non-root;
- no network;
- read-only root filesystem;
- tmpfs `/tmp`;
- dropped capabilities;
- no-new-privileges;
- memory/CPU/PID limits;
- hard timeout;
- only session workspace mounted writable.

Docker socket is never directly exposed to Governor or Agent.

## 11. Failure Policy

Security-sensitive failures must fail closed.

Examples:
- invalid canonicalization → DENY;
- malformed policy → retain last known good policy;
- expired session → DENY;
- expired approval → DENY;
- missing grant → DENY;
- executor unavailable → no fallback to host;
- unknown resource → conservative labels.
