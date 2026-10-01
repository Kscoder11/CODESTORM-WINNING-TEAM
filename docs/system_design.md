# PNG5 NOMOS — System Design & Architecture Specification

## 1. Executive Summary
PNG5 NOMOS is an enterprise-grade AI Permission Governor and Autonomous Development IDE that bridges AI agent autonomy with mathematical Zero-Trust security guarantees and cryptographic auditability.

## 2. Multi-Tier Architecture Overview
- **Tier 1: Frontend Workspace & Monaco IDE**
  - Monaco code editor with syntax highlighting, multi-tab editing, split diffing.
  - Live preview engine with hot-reload and multi-device viewports.
  - Activity bar and recursive file tree explorer.
- **Tier 2: Intelligent Risk-Based Middleware & Prompt Classifier**
  - Analyzes prompt intent, extracts target resources, calculates risk scores (0.0 to 1.0).
  - Hard Denial Invariants (HD1–HD10) enforce non-overrideable safety rules.
- **Tier 3: Policy Governor Daemon**
  - Evaluates mathematical invariants across action types, scopes, and taint provenance.
  - Issues 5-minute cryptographic human approval tickets for sensitive actions.
- **Tier 4: Model Context Protocol (MCP) Execution Gateway**
  - Controlled execution layer hosting verified tools (`read_project_file`, `edit_project_file`, `create_project_file`, `run_project_command`).
- **Tier 5: Cryptographic SHA-256 Audit Ledger**
  - Immutable hash chain binding every prompt, tool execution, decision, and operator authorization.

## 3. Data Flow & Security Boundaries
1. User prompt is submitted to `/api/chat`.
2. Middleware classifies intent and evaluates risk score.
3. If risk <= 30%: Auto-allowed with live diff tracking.
4. If risk > 70% or sensitive resource: Escalated to Human Operator Approval (HITL).
5. If attack vector detected: Permanently denied with Hard Denial Invariant.
6. Execution results are broadcasted via SSE `/api/stream` and written to the cryptographic ledger.
