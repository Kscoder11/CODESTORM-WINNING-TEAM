# PNG5 MCP Server — OpenCode Integration

Custom MCP (Model Context Protocol) server for the PNG5 Agent Permission Governor. Exposes controlled tools to OpenCode agents, enforcing runtime policy decisions through the Governor's authorization pipeline.

## Architecture

```text
OpenCode (MCP client)
    │  stdio transport
    ▼
mcp-server/ (Node.js/TypeScript)
    ├── hello                → Connectivity check
    ├── list_project_files   → List workspace files
    ├── read_project_file    → Read authorized files
    ├── search_project_code  → Search source code
    ├── edit_project_file    → Edit files (approval required)
    ├── create_project_file  → Create files (approval required)
    └── run_project_command  → Run commands (strict allowlist)
    │
    ▼
Policy Evaluator
    │  HTTP to Governor API
    ▼
Governor (FastAPI backend)
    ├── Canonicalization
    ├── Hard-deny rules (HD1-HD10)
    ├── Risk scoring
    ├── Approval lifecycle
    └── Hash-chained audit
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Python 3.11+ (for Governor backend)

### 1. Install MCP Server Dependencies

```bash
cd mcp-server
npm install
```

### 2. Start the Governor Backend

```bash
# From repository root
pip install -r requirements.txt
python -m governor.main
```

The Governor runs on `http://localhost:8000`.

### 3. Configure OpenCode

The `opencode.json` in the repository root configures OpenCode to launch the MCP server:

```json
{
  "mcp": {
    "servers": {
      "png5-policy": {
        "type": "local",
        "command": ["npm", "run", "mcp"],
        "cwd": "./mcp-server",
        "environment": {
          "PROJECT_ROOT": ".",
          "GOVERNOR_URL": "http://localhost:8000"
        }
      }
    }
  }
}
```

### 4. Launch OpenCode

```bash
opencode
```

### 5. Verify Connection

```bash
# List MCP servers
opencode mcp list

# Test connectivity
# In OpenCode, ask: "Use the hello tool with my name"
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PROJECT_ROOT` | Current directory | Registered project workspace path |
| `GOVERNOR_URL` | `http://localhost:8000` | Governor API URL |
| `ORCHESTRATOR_KEY` | `orch_key_secret_123` | Orchestrator API key |
| `AGENT_SESSION_TOKEN` | (empty) | Agent session token from Governor |
| `MCP_USER_ID` | `mcp-opencode-agent` | User identity for audit |
| `MAX_FILE_READ_SIZE` | `1048576` (1 MB) | Maximum file read size |
| `MAX_FILE_WRITE_SIZE` | `524288` (512 KB) | Maximum file write size |
| `COMMAND_TIMEOUT` | `5000` (5s) | Command execution timeout |

## Tools

### Read-Only (Allowed by Default)

| Tool | Description |
|---|---|
| `hello` | Connectivity check |
| `list_project_files` | List files in workspace (recursive, filtered) |
| `read_project_file` | Read file content (line range support) |
| `search_project_code` | Regex code search across source files |

### Write Operations (Approval Required)

| Tool | Description |
|---|---|
| `edit_project_file` | Modify existing file (shows diff to approver) |
| `create_project_file` | Create new file (won't overwrite existing) |
| `run_project_command` | Execute allowlisted command with sandboxing |

## Security Controls

### Workspace Containment
- Path traversal defense (../ sequences)
- Per-component symlink detection
- Realpath boundary validation
- Secret file pattern rejection (.env, credentials, keys, tokens)

### Command Execution
- Strict command allowlist (ls, cat, grep, python, node, git, etc.)
- Shell metacharacter rejection (no pipes, redirects, subshells)
- Dangerous argument blocking (--exec, -rf, sudo, etc.)
- `execFile` — no shell spawned
- Hard timeout (5s default)
- Output truncation (64 KB max)
- Minimal environment (only PATH, HOME, LANG)

### Policy Enforcement
- Every protected tool routes through the centralized policy evaluator
- Governor integration for full authorization pipeline
- Fail-closed behavior when Governor is unreachable
- Local fallback policy for standalone testing
- Audit logging of all decisions and outcomes

### Model Trust Boundary
- Model cannot supply identity, project authorization, or approval status
- API keys and secrets never exposed in tool results
- Audit log values sanitized for credential patterns

## Running Tests

```bash
cd mcp-server
npm test
```

Tests cover:
- ✅ Valid path resolution
- ✅ Path traversal blocking
- ✅ Secret file access denial
- ✅ Symlink escape prevention (when available)
- ✅ File size limit enforcement
- ✅ Command allowlist enforcement
- ✅ Shell injection blocking
- ✅ Dangerous argument rejection
- ✅ Audit log functionality

## Development

```bash
# Watch mode (auto-restart on changes)
cd mcp-server
npm run dev

# Build TypeScript
npm run build
```

## File Structure

```text
mcp-server/
├── package.json
├── tsconfig.json
└── src/
    ├── server.ts              # Main entry point
    ├── config.ts              # Configuration from env vars
    ├── test-runner.ts         # Security test suite
    ├── policy/
    │   ├── types.ts           # Policy type definitions
    │   └── evaluator.ts       # Centralized policy evaluator
    ├── security/
    │   ├── workspace.ts       # Workspace path validation
    │   └── command-guard.ts   # Command allowlist & sanitization
    ├── audit/
    │   └── logger.ts          # Audit event recording
    └── tools/
        ├── hello.ts           # Connectivity check
        ├── list-files.ts      # List project files
        ├── read-file.ts       # Read authorized files
        ├── search-code.ts     # Search source code
        ├── edit-file.ts       # Edit files (approval-gated)
        ├── create-file.ts     # Create files (approval-gated)
        └── run-command.ts     # Run commands (strict allowlist)
```
