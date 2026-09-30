/**
 * PNG5 MCP Server — Policy Types
 * 
 * Shared type definitions for policy evaluation, tool requests,
 * and audit events. These mirror the Governor's contract.
 */

/** Policy decision outcomes matching Governor's ALLOW/CONSTRAIN/ESCALATE/DENY */
export type PolicyAction = "allow" | "deny" | "approval_required";

/** Policy decision returned from the evaluator */
export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
  /** Governor outcome (ALLOW, CONSTRAIN, ESCALATE, DENY) */
  governorOutcome?: string;
  /** Risk score from Governor */
  score?: number;
  /** Risk breakdown */
  breakdown?: RiskBreakdown;
  /** Rules that fired */
  rules?: string[];
  /** Approval ID if escalation created one */
  approvalId?: string | null;
}

/** Risk score breakdown from Governor */
export interface RiskBreakdown {
  base: number;
  sensitivity: number;
  environment: number;
  taint: number;
  signals: number;
}

/** Tool request context — never trust model-supplied values for identity */
export interface ToolRequest {
  userId: string;
  agentSessionId: string;
  projectId: string;
  tool: string;
  resource?: string;
  params?: Record<string, unknown>;
}

/** Result from tool execution */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata: Record<string, unknown>;
}

/** Audit event payload for Governor integration */
export interface AuditEvent {
  sessionId: string;
  agentName: string;
  tool: string;
  resource: string;
  action: string;
  decision: PolicyAction;
  reason: string;
  outcome?: string;
  timestamp: string;
}

/** Governor action request payload (matches ActionRequest schema) */
export interface GovernorActionRequest {
  action: string;
  target: string;
  params: Record<string, unknown>;
  approval_id?: string | null;
}

/** Governor action response */
export interface GovernorActionResponse {
  outcome: string;
  score: number;
  breakdown: RiskBreakdown;
  rules: string[];
  approval_id: string | null;
  result: Record<string, unknown> | null;
  timings: {
    decision_ms: number;
    audit_ms: number;
    exec_ms: number;
  };
  reason?: string;
}
