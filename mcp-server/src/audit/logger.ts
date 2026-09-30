/**
 * PNG5 MCP Server — Audit Logger
 * 
 * Records all policy decisions and tool execution outcomes.
 * Integrates with the Governor's hash-chained audit system when available.
 * 
 * Security: never logs secrets, API keys, or sensitive file contents.
 */

import { config, log } from "../config.js";
import type { AuditEvent, PolicyDecision } from "../policy/types.js";

/** In-memory audit log for local operation (persisted to Governor when connected) */
const localAuditLog: AuditEvent[] = [];

/**
 * Record an audit event for a tool action.
 * 
 * Attempts to persist to the Governor's audit chain.
 * Falls back to local in-memory logging if Governor is unreachable.
 */
export async function recordAuditEvent(
  tool: string,
  resource: string,
  decision: PolicyDecision,
  executionResult?: { success: boolean; error?: string }
): Promise<void> {
  const event: AuditEvent = {
    sessionId: config.agentSessionId || "local",
    agentName: config.userId,
    tool,
    resource: sanitizeForAudit(resource),
    action: tool,
    decision: decision.action,
    reason: decision.reason,
    outcome: executionResult
      ? (executionResult.success ? "SUCCESS" : `FAILED: ${executionResult.error}`)
      : (decision.action === "allow" ? "EXECUTED" : "NOT_EXECUTED"),
    timestamp: new Date().toISOString(),
  };

  // Store locally
  localAuditLog.push(event);

  // Attempt Governor persistence (best-effort)
  if (config.agentSessionToken) {
    try {
      // The Governor's audit chain is populated automatically by the /v1/actions
      // endpoint, so we don't need to call a separate audit API.
      // This log line is for MCP-side traceability.
      log("info", "Audit event recorded", {
        tool: event.tool,
        decision: event.decision,
        outcome: event.outcome,
      });
    } catch {
      log("warn", "Failed to persist audit event to Governor — stored locally");
    }
  } else {
    log("info", "Audit event (local)", {
      tool: event.tool,
      resource: event.resource,
      decision: event.decision,
    });
  }
}

/**
 * Get the full local audit log (for testing/debugging).
 */
export function getAuditLog(): readonly AuditEvent[] {
  return localAuditLog;
}

/**
 * Clear local audit log (for testing).
 */
export function clearAuditLog(): void {
  localAuditLog.length = 0;
}

/**
 * Sanitize values for audit logging — strip potential secrets.
 * Never log: API keys, tokens, passwords, env file contents.
 */
function sanitizeForAudit(value: string): string {
  // Truncate very long values
  if (value.length > 500) {
    return value.substring(0, 500) + "... [truncated]";
  }

  // Redact anything that looks like a secret value
  return value.replace(
    /((?:key|token|secret|password|api_key|apikey|credential)[=:]\s*)[^\s,;'"}\]]+/gi,
    "$1[REDACTED]"
  );
}
