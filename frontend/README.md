# PNG5 — Agent Permission Governor (Frontend Console)

Runtime security operations console and human-in-the-loop dashboard for the PNG5 Agent Permission Governor.

> **Core Motto:** The AI Agent should NEVER execute an action directly.

## Features

- **SOC Security Dashboard**: Real-time action counts, outcome distribution (ALLOW, CONSTRAIN, ESCALATE, DENY), latency percentiles (p50/p95/p99), and system health.
- **Human-In-The-Loop Approval Queue**: Reviewer interface for escalated requests bound to canonical SHA-256 request hashes with 300s TTL countdown.
- **Hard-Deny Rule Matrix**: Independent enforcement of HD1–HD10 security constraints.
- **Tamper-Evident Audit Viewer**: Cryptographic hash-chain verification (`/v1/audit/verify`) and controlled tamper demonstration.
- **Evaluation & Scenario Launcher**: Run the 8 frozen demo scenarios and inspect held-out benchmark comparative metrics (OFF vs REGEX vs FULL).
- **Interactive Security CLI**: Integrated terminal for operator diagnostics and emergency kill-switch.

## Running Locally

```bash
npm install
npm run dev
```
