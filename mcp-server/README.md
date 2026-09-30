# PNG5 Agent Permission Governor — MCP Server & Website Integration

Production-grade integration of the **TypeScript Model Context Protocol (MCP) Server**, **AI Agent Orchestrator**, **Prompt Identification Middleware**, **Runtime Policy Engine**, and **Web Security Console**.

---

## 🏗️ Architecture & Request Flow

```
[ User on Website UI ] (http://localhost:3000)
         │
         │ (POST /api/chat)
         ▼
[ Prompt Identification Middleware ]
   ├── Intent Classification (read, search, edit, create, execute)
   ├── Prompt Injection / Jailbreak Detection
   └── Risk Scoring & Initial Categorization
         │
         ▼
[ AI Agent Orchestrator (ReAct Loop) ]
   ├── Configurable LLM Provider (OpenAI / Anthropic / Gemini / Heuristic)
   ├── Multi-step Reasoning & Tool Candidate Selection
   └── Response Synthesis
         │
         ▼
[ Runtime Policy Engine ]
   ├── Execution Boundary Verification
   ├── Hard-Deny Checks (.env, id_rsa, /etc/shadow, system binaries)
   ├── Governor Integration (POST http://localhost:8000/v1/actions)
   └── Human Approval Escalation & Anti-Replay Redemption
         │
   ┌─────┴──────────────────────────────────────────────────────┐
   │ ALLOW                                                      │ REQUIRE_APPROVAL
   ▼                                                            ▼
[ TypeScript MCP Client ]                                [ Approval Modal on Website ]
   │ (StdioClientTransport)                                     │ (Human Reviews & Decides)
   ▼                                                            ▼
[ TypeScript MCP Server ]                                [ Resumes with Approval Token ]
   ├── hello
   ├── list_project_files
   ├── read_project_file
   ├── search_project_code
   ├── edit_project_file
   ├── create_project_file
   └── run_project_command
         │
         ▼
[ Target Result / Audit Trail ] ─────────> [ Real-time Website Display ]
```

---

## 🛠️ The 7 Governed MCP Tools

| Tool | Action Category | Permission Level | Key Security Guardrails |
| :--- | :--- | :--- | :--- |
| `hello` | `system.status` | 🟢 Read-Only | Safe connectivity check & diagnostic handshake |
| `list_project_files` | `file.read` | 🟢 Read-Only | Workspace containment, dotfile/build artifact filtering |
| `read_project_file` | `file.read` | 🟢 Read-Only | Blocks `.env`, `id_rsa`, `.pem`, tokens; 1 MB file limit |
| `search_project_code` | `file.read` | 🟢 Read-Only | Workspace boundary validation, 100-match cap |
| `edit_project_file` | `file.write` | 🟡 Approval Gated | Exact text chunk replacement; requires human approval |
| `create_project_file` | `file.write` | 🟡 Approval Gated | Prevents overwrite without explicit flag; requires human approval |
| `run_project_command` | `code.execute` | 🔴 Strict Allowlist | Allowlisted commands only (`git`, `node`, `npm`, `pytest`, `python`, `ls`, etc.) via `execFile` (no shell spawn); 5s hard timeout |

---

## 🚀 Quickstart & Local Execution

### 1. Install Dependencies & Build
```powershell
cd d:\CODESTORM-WINNING-TEAM\mcp-server
npm install
npm run build
```

### 2. Run Test Suites
```powershell
# 1. Run MCP Security & Tool Unit Tests (20/20 tests)
npm test

# 2. Run MCP Client <-> Server Diagnostic Suite (15/15 tests)
npm run test:client

# 3. Run Complete 15-Scenario End-to-End Suite (18/18 tests)
npm run test:e2e
```

### 3. Launch Governor Backend (FastAPI)
```powershell
cd d:\CODESTORM-WINNING-TEAM
python -m governor.main
```
*Governor active on `http://localhost:8000`.*

### 4. Launch Website & API Server
```powershell
cd d:\CODESTORM-WINNING-TEAM\mcp-server
npm run web
```
*Open **`http://localhost:3000`** in your browser to interact with the full web console.*

---

## 🌐 Website Features

- **Interactive AI Chat Assistant**: Submit natural language prompts, view step-by-step progress, policy outcome badges (`ALLOW`, `APPROVAL REQUIRED`, `DENY`), and tool execution results.
- **Human Approval Modal**: When a sensitive tool (such as file creation, editing, or command execution) is proposed, an interactive modal presents the action details, target resource, risk score, and rule breakdown with 1-click **Approve** and **Reject** buttons.
- **Live SOC Metrics**: Real-time counter of total actions, allowed requests, escalations, and denials.
- **Cryptographic Audit Viewer**: Real-time log of all policy decisions, timestamps, and resource targets.
- **Quick Scenario Launcher**: 1-click pre-filled prompts to test benign file reads, code searches, approvals, credential exfiltration denials, and jailbreak blocks.

---

## 🔒 Security & Hard-Deny Guarantees

1. **Zero Shell Vulnerability**: Terminal commands are executed directly through `execFile` with structured arguments, neutralizing shell metacharacter injection.
2. **Workspace Containment**: Strict realpath resolution and per-component symlink checks prevent directory traversal (`../`) attacks.
3. **Sensitive Credential Shield**: Access to `.env`, `id_rsa`, `/etc/shadow`, API keys, and token patterns is permanently blocked.
4. **Anti-Replay Approvals**: Approvals are bound to one-time tokens with a 5-minute TTL. Once redeemed or expired, they cannot be reused.
5. **Fail-Closed Design**: If policy services are unreachable, requests default to DENY.
