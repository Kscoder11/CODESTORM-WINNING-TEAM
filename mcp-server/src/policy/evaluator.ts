/**
 * PNG5 MCP Server — Centralized Policy Evaluator
 * 
 * Every tool action is routed through this evaluator before execution.
 * The evaluator connects to the existing Governor API for authoritative decisions.
 * 
 * Security principle: the model can request actions, but only the Governor
 * (trusted server-side code) can authorize and execute them.
 * 
 * When the Governor is unreachable, the evaluator fails CLOSED (deny).
 */

import { config, log } from "../config.js";
import type {
  PolicyDecision,
  ToolRequest,
  GovernorActionRequest,
  GovernorActionResponse,
} from "./types.js";

/** Map MCP tool names to Governor action types */
const TOOL_TO_ACTION: Record<string, string> = {
  list_project_files: "file.read",
  read_project_file: "file.read",
  search_project_code: "file.read",
  edit_project_file: "file.write",
  create_project_file: "file.write",
  run_project_command: "code.execute",
  hello: "file.read", // safe; minimal risk score
};

/** Map Governor outcomes to MCP policy actions */
function mapOutcome(outcome: string): PolicyDecision["action"] {
  switch (outcome) {
    case "ALLOW":
    case "CONSTRAIN":
      return "allow";
    case "ESCALATE":
      return "approval_required";
    case "DENY":
    default:
      return "deny";
  }
}

/**
 * Evaluate a tool request against the Governor's authorization pipeline.
 * 
 * Flow:
 * 1. Map the MCP tool to a Governor action type
 * 2. POST to /v1/actions with the agent's session token
 * 3. Interpret the response (ALLOW → execute, ESCALATE → pause, DENY → block)
 * 4. Return the decision with full audit context
 * 
 * On failure (network error, timeout), returns DENY (fail closed).
 */
export async function evaluatePolicy(request: ToolRequest): Promise<PolicyDecision> {
  const governorAction = TOOL_TO_ACTION[request.tool] || "code.execute";

  // If no session token is configured, use local-only policy evaluation
  if (!config.agentSessionToken) {
    return evaluateLocalPolicy(request);
  }

  try {
    const governorPayload: GovernorActionRequest = {
      action: governorAction,
      target: request.resource || "",
      params: request.params || {},
      approval_id: null,
    };

    const response = await fetch(`${config.governorUrl}/v1/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.agentSessionToken}`,
      },
      body: JSON.stringify(governorPayload),
      signal: AbortSignal.timeout(5000),
    });

    const data = (await response.json()) as GovernorActionResponse;

    const decision: PolicyDecision = {
      action: mapOutcome(data.outcome),
      reason: data.reason || `Governor decision: ${data.outcome} (score: ${data.score})`,
      governorOutcome: data.outcome,
      score: data.score,
      breakdown: data.breakdown,
      rules: data.rules,
      approvalId: data.approval_id,
    };

    log("info", "Policy decision from Governor", {
      tool: request.tool,
      outcome: data.outcome,
      score: data.score,
      rules: data.rules,
    });

    return decision;
  } catch (err) {
    // Fail CLOSED: if Governor is unreachable, deny the action
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Governor unreachable — failing closed", { error: message, tool: request.tool });

    return {
      action: "deny",
      reason: `Policy enforcement unavailable (Governor unreachable): ${message}. Failing closed.`,
    };
  }
}

/**
 * Local-only policy evaluation for when no Governor session is configured.
 * 
 * This is a fallback for initial testing/demo. It implements the same
 * categories as the Governor but with simplified rules.
 * 
 * In production, ALL decisions must go through the Governor.
 */
function evaluateLocalPolicy(request: ToolRequest): PolicyDecision {
  log("info", "Using local policy evaluation (no Governor session)", { tool: request.tool });

  // Hello tool — always allow
  if (request.tool === "hello") {
    return { action: "allow", reason: "Connectivity check permitted." };
  }

  // Read-only tools — allow within workspace scope
  if (["list_project_files", "read_project_file", "search_project_code"].includes(request.tool)) {
    return {
      action: "allow",
      reason: `Read-only operation '${request.tool}' permitted within workspace scope.`,
    };
  }

  // Write tools — require approval
  if (["edit_project_file", "create_project_file"].includes(request.tool)) {
    return {
      action: "approval_required",
      reason: `File modification via '${request.tool}' requires human approval.`,
    };
  }

  // Command execution — require approval
  if (request.tool === "run_project_command") {
    return {
      action: "approval_required",
      reason: "Command execution requires human approval.",
    };
  }

  // Default: deny unknown tools
  return {
    action: "deny",
    reason: `Tool '${request.tool}' is not permitted by the current policy.`,
  };
}
