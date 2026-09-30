# Data Model — PNG5

Database: `governor.db`

SQLite runs in WAL mode.

## api_keys

```text
id
role
key_hash
label
```

Roles:
- orchestrator
- reviewer
- admin

## sessions

```text
id
token_hash
agent_name
task
status
created_by
created_at
expires_at
```

A session is the security boundary for taint and grants.

## grants

```text
session_id
action
target_glob
constraints_json
```

Grants implement least privilege.

## ledger

```text
id
session_id
source
trust
sensitivity
indicators_json
injection_flag
ts
```

Stores provenance/taint information from tool outputs.

## decisions

```text
seq
ts
session_id
action
canon_target
canon_params_json
request_hash
outcome
score
breakdown_json
rules_json
policy_version
decision_ms
audit_ms
exec_status
exec_ms
mode
```

## approvals

```text
id
request_hash
decision_seq
status
reviewer
created_at
expires_at
consumed_at
```

Statuses:
- PENDING
- APPROVED
- DENIED
- EXPIRED
- CONSUMED

## audit_events

```text
seq
ts
type
payload_json
prev_hash
hash
```

Hash:

```text
SHA256(prev_hash || canonical(payload))
```

## Seed Resources

- `demo/prod.db`
- `demo/staging.db`
- seeded workspace
- seeded mailbox

## Resource Registry

Unknown targets default to:

```text
trust = untrusted
sensitivity = restricted
environment = prod
```
