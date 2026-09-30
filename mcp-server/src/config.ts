/**
 * PNG5 MCP Server — Configuration
 * 
 * All configuration is loaded from environment variables with safe defaults.
 * The MCP server never exposes these values to the model.
 */

import { resolve } from "path";
import { existsSync } from "fs";

function getInitialProjectRoot(): string {
  if (process.env.PROJECT_ROOT && existsSync(process.env.PROJECT_ROOT)) {
    return resolve(process.env.PROJECT_ROOT);
  }
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "..", ".."),
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, "governor")) && existsSync(resolve(dir, "mcp-server"))) {
      return dir;
    }
  }
  for (const dir of candidates) {
    if (existsSync(resolve(dir, ".git"))) {
      return dir;
    }
  }
  return process.cwd();
}

export const config = {
  /** Absolute path to the registered project workspace */
  projectRoot: getInitialProjectRoot(),

  /** Governor API base URL for policy evaluation */
  governorUrl: process.env.GOVERNOR_URL || "http://localhost:8000",

  /** Orchestrator API key for Governor session creation */
  orchestratorKey: process.env.ORCHESTRATOR_KEY || "orch_key_secret_123",

  /** Agent session token (set after session creation) */
  agentSessionToken: process.env.AGENT_SESSION_TOKEN || "",

  /** User identity for audit trail */
  userId: process.env.MCP_USER_ID || "mcp-opencode-agent",

  /** Agent session ID (assigned by Governor) */
  agentSessionId: process.env.AGENT_SESSION_ID || "",

  /** Project ID for multi-project support */
  projectId: process.env.PROJECT_ID || "default",

  /** Maximum file size for reads (bytes) */
  maxFileReadSize: parseInt(process.env.MAX_FILE_READ_SIZE || "1048576", 10), // 1 MB

  /** Maximum file size for writes (bytes) */
  maxFileWriteSize: parseInt(process.env.MAX_FILE_WRITE_SIZE || "524288", 10), // 512 KB

  /** Command execution timeout (ms) */
  commandTimeout: parseInt(process.env.COMMAND_TIMEOUT || "5000", 10),

  /** Secret file patterns to deny */
  secretPatterns: [
    "*.env", ".env*", "*secret*", "*credentials*", "*password*",
    "/etc/shadow", "~/.ssh/*", "*id_rsa*", "*id_ed25519*",
    "*.pem", "*.key", "*.p12", "*.pfx", "*.jks",
    "*token*", "*apikey*", "*api_key*",
  ],

  /** Allowed commands for run_project_command */
  commandAllowlist: [
    "ls", "cat", "head", "tail", "wc", "grep", "find", "echo",
    "python", "python3", "node", "npm", "npx",
    "pip", "pip3", "pytest", "jest",
    "git", "diff",
  ],
} as const;

/** Diagnostic logging — always to stderr, never stdout (MCP protocol uses stdout) */
export function log(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component: "png5-mcp",
    message,
    ...data,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}
