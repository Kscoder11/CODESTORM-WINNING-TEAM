# Member 2 Instructions — Backend Gateway & Runtime Infrastructure

## Mission

Own the controlled execution environment.

## Primary Responsibilities

Implement:
- file gateway;
- HTTP gateway;
- DB gateway;
- email gateway;
- executor service;
- Docker socket proxy configuration;
- mock-web;
- Docker Compose;
- internal networks;
- runtime resource limits.

## File Gateway

Re-check:
- realpath;
- containment;
- symlinks;
- size limits.

Use `O_NOFOLLOW` where applicable.

## HTTP Gateway

- allow only approved domains;
- resolve DNS once;
- reject private/metadata addresses;
- manually follow redirects;
- re-evaluate every redirect;
- 1 MB response cap;
- 5 second timeout.

## Database Gateway

- reads are read-only;
- writes use transactions;
- enforce `max_rows`;
- rollback when constraints are violated.

## Email Gateway

Use outbox storage.

Only approved internal domains.

## Executor

Separate container.

Expected restrictions:
- no network;
- non-root;
- read-only root;
- tmpfs `/tmp`;
- dropped capabilities;
- no-new-privileges;
- resource limits;
- hard timeout;
- session-specific writable workspace.

Docker access must occur through the restricted socket proxy.

## Network Requirement

Agent must have no direct path to:
- database;
- email;
- mock-web;
- executor;
- Docker.

Only Governor is reachable.

## Tests

Prove:
- agent cannot reach backend services directly;
- executor cannot reach network;
- path escape fails;
- SSRF/private IP fails;
- redirects are rechecked;
- dangerous execution is contained;
- executor failure fails closed.

## Do Not Build

- frontend;
- policy/risk logic duplicated from Member 1;
- Kubernetes;
- custom kernel security.
