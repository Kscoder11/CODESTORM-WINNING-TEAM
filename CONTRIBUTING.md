# Team Working Rules — PNG5

## Branch Ownership

Recommended branches:

```text
main
dev
feature/member-1-core
feature/member-2-gateway
feature/member-3-security-eval
feature/member-4-dashboard
feature/member-5-approval-audit
```

Do not push directly to `main` during development.

## Integration Order

1. Member 1 freezes schemas/API contracts.
2. Members 2 and 3 integrate against those contracts.
3. Members 4 and 5 use mock data until backend endpoints stabilize.
4. Integrate backend first.
5. Integrate frontend.
6. Run all eight scenarios.
7. Freeze features.
8. Benchmark.
9. Load/chaos test.
10. Demo rehearsal.

## Change Rules

Security-sensitive changes require review by at least one backend/security member.

Changes to frozen decisions require explicit team agreement.

## Commit Style

Use small, descriptive commits:

```text
feat(core): add request canonicalization
feat(gateway): add SSRF-safe HTTP gateway
feat(security): add session lineage ledger
feat(ui): add approval queue
test(security): add approval replay cases
```

## Before Merge

- tests pass;
- no unrelated changes;
- no secrets;
- no fake benchmark values;
- no bypasses introduced for demos.
