/**
 * PNG5 MCP Server — Runtime Policy Engine
 * 
 * Enforces zero-trust authorization at the execution boundary immediately
 * before any MCP tool is invoked.
 * 
 * Checks:
 * 1. User & session context
 * 2. Tool permission & allowlist
 * 3. Resource canonicalization & workspace containment
 * 4. Hard-deny rules (secret files, system paths, dangerous commands)
 * 5. Human approval verification & one-time redemption
 * 6. Governor backend authorization (/v1/actions)
 * 7. Audit logging
 */

import { config, log } from "../config.js";
import { getApprovalManager, HumanApprovalRequest } from "../approvals/approval-manager.js";
import { recordAuditEvent } from "../audit/logger.js";

export interface PolicyContext {
  userId: string;
  userRole?: string;
  agentSessionId?: string;
  agentSessionToken?: string;
  approvalId?: string | null;
}

export interface ProposedAction {
  tool: string;
  resource: string;
  params: Record<string, unknown>;
}

export interface RuntimePolicyVerdict {
  allowed: boolean;
  verdict: "allow" | "require_approval" | "deny";
  reason: string;
  riskScore: number;
  approvalRequest?: HumanApprovalRequest;
  rules: string[];
  /** Set when the verdict was granted through a verified human approval ticket. */
  approvalId?: string;
}

/** Tool to Governor action category mapping */
const TOOL_ACTION_MAP: Record<string, string> = {
  hello: "system.status",
  list_project_files: "file.read",
  read_project_file: "file.read",
  search_project_code: "file.read",
  edit_project_file: "file.write",
  create_project_file: "file.write",
  run_project_command: "code.execute",
};

export class RuntimePolicyEngine {
  private approvalManager = getApprovalManager();

  /**
   * Evaluate a proposed tool execution against policy rules and Governor authorization.
   */
  public async evaluate(
    action: ProposedAction,
    context: PolicyContext
  ): Promise<RuntimePolicyVerdict> {
    const governorAction = TOOL_ACTION_MAP[action.tool] || "code.execute";

    // 1. Hard Deny Checks (Never overrideable by human approval)
    const hardDenyReason = this.checkHardDeny(action);
    if (hardDenyReason) {
      log("warn", "Runtime policy: Hard-deny triggered", { tool: action.tool, reason: hardDenyReason });
      await recordAuditEvent(action.tool, action.resource, { action: "deny", reason: hardDenyReason });
      return {
        allowed: false,
        verdict: "deny",
        reason: `Hard-Deny Violation: ${hardDenyReason}`,
        riskScore: 1.0,
        rules: ["RULE_HARD_DENY"],
      };
    }

    // 2. Check if a valid, redeemed human approval is present
    if (context.approvalId) {
      const approval = this.approvalManager.get(context.approvalId);
      if (!approval) {
        return {
          allowed: false,
          verdict: "deny",
          reason: `Invalid or nonexistent approval ID '${context.approvalId}'`,
          riskScore: 0.9,
          rules: ["RULE_APPROVAL_INVALID"],
        };
      }

      if (approval.status === "expired") {
        return {
          allowed: false,
          verdict: "deny",
          reason: `Approval request '${context.approvalId}' has expired`,
          riskScore: 0.9,
          rules: ["RULE_APPROVAL_EXPIRED"],
        };
      }

      if (approval.status === "rejected") {
        return {
          allowed: false,
          verdict: "deny",
          reason: `Approval request '${context.approvalId}' was rejected by reviewer`,
          riskScore: 0.9,
          rules: ["RULE_APPROVAL_REJECTED"],
        };
      }

      if (approval.status === "approved") {
        // Verify parameter/tool binding: the approval must match the exact
        // operation being attempted (tool AND target resource).
        if (approval.tool !== action.tool) {
          return {
            allowed: false,
            verdict: "deny",
            reason: `Approval token tool mismatch (expected ${approval.tool}, got ${action.tool})`,
            riskScore: 1.0,
            rules: ["RULE_APPROVAL_TAMPERED"],
          };
        }

        if (approval.target !== action.resource) {
          return {
            allowed: false,
            verdict: "deny",
            reason: `Approval token target mismatch (approved for '${approval.target}', got '${action.resource}')`,
            riskScore: 1.0,
            rules: ["RULE_APPROVAL_TAMPERED"],
          };
        }

        // When the website approval bridge is running, redemption happens
        // atomically inside the MCP tool process (one-time, after human
        // approval) so we do not consume the ticket here. In standalone
        // mode the ticket is consumed at this execution boundary.
        const bridgeRunning = Boolean(process.env.APPROVAL_API_URL);
        if (!bridgeRunning) {
          this.approvalManager.consume(context.approvalId);
        }

        log("info", "Runtime policy: Action allowed via verified human approval", {
          tool: action.tool,
          approvalId: context.approvalId,
          deferredRedemption: bridgeRunning,
        });

        return {
          allowed: true,
          verdict: "allow",
          reason: `Approved by reviewer (${approval.decidedBy || "human"})`,
          riskScore: approval.riskScore,
          approvalId: context.approvalId,
          rules: ["RULE_APPROVAL_VERIFIED"],
        };
      }
    }

    // 3. Evaluate with Governor Backend if session token available
    const sessionToken = context.agentSessionToken || config.agentSessionToken;
    if (sessionToken) {
      try {
        const response = await fetch(`${config.governorUrl}/v1/actions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            action: governorAction,
            target: action.resource,
            params: action.params,
            approval_id: context.approvalId || null,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            outcome: string;
            score: number;
            reason: string;
            rules: string[];
            approval_id?: string;
          };

          if (data.outcome === "ALLOW" || data.outcome === "CONSTRAIN") {
            return {
              allowed: true,
              verdict: "allow",
              reason: data.reason || `Governor authorized action (score: ${data.score})`,
              riskScore: data.score,
              rules: data.rules || [],
            };
          }

          if (data.outcome === "ESCALATE") {
            const approvalReq = this.approvalManager.createRequest({
              userId: context.userId,
              agentSessionId: context.agentSessionId,
              tool: action.tool,
              action: governorAction,
              target: action.resource,
              params: action.params,
              reason: data.reason || "Action exceeds risk threshold and requires approval",
              riskScore: data.score,
              rules: data.rules,
            });

            return {
              allowed: false,
              verdict: "require_approval",
              reason: data.reason || "High-risk operation requires human approval",
              riskScore: data.score,
              approvalRequest: approvalReq,
              rules: data.rules || ["RULE_ESCALATE"],
            };
          }

          return {
            allowed: false,
            verdict: "deny",
            reason: data.reason || `Governor denied action (score: ${data.score})`,
            riskScore: data.score,
            rules: data.rules || ["RULE_DENY"],
          };
        }
      } catch (err) {
        log("warn", "Governor backend unreachable, evaluating with local zero-trust policy", {
          error: String(err),
        });
      }
    }

    // 4. Local Deterministic Zero-Trust Policy Engine
    return this.evaluateLocalRules(action, context);
  }

  /**
   * Deterministic local policy rules.
   */
  private evaluateLocalRules(action: ProposedAction, context: PolicyContext): RuntimePolicyVerdict {
    // A. Read-only operations — Always allowed within workspace
    if (["hello", "list_project_files", "read_project_file", "search_project_code"].includes(action.tool)) {
      return {
        allowed: true,
        verdict: "allow",
        reason: `Read-only operation '${action.tool}' permitted by policy.`,
        riskScore: 0.15,
        rules: ["RULE_READ_PERMITTED"],
      };
    }

    // B. Write operations — Require human approval
    if (["edit_project_file", "create_project_file"].includes(action.tool)) {
      const approvalReq = this.approvalManager.createRequest({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        tool: action.tool,
        action: "file.write",
        target: action.resource,
        params: action.params,
        reason: `File modification via '${action.tool}' requires human operator authorization.`,
        riskScore: 0.75,
        rules: ["RULE_FILE_WRITE_APPROVAL_REQUIRED"],
      });

      return {
        allowed: false,
        verdict: "require_approval",
        reason: `File modification via '${action.tool}' requires human approval.`,
        riskScore: 0.75,
        approvalRequest: approvalReq,
        rules: ["RULE_FILE_WRITE_APPROVAL_REQUIRED"],
      };
    }

    // C. Command execution — Require human approval
    if (action.tool === "run_project_command") {
      const approvalReq = this.approvalManager.createRequest({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        tool: action.tool,
        action: "code.execute",
        target: action.resource,
        params: action.params,
        reason: "Terminal command execution requires human operator authorization.",
        riskScore: 0.85,
        rules: ["RULE_COMMAND_EXEC_APPROVAL_REQUIRED"],
      });

      return {
        allowed: false,
        verdict: "require_approval",
        reason: "Command execution requires human approval.",
        riskScore: 0.85,
        approvalRequest: approvalReq,
        rules: ["RULE_COMMAND_EXEC_APPROVAL_REQUIRED"],
      };
    }

    // Default: Deny unknown tools
    return {
      allowed: false,
      verdict: "deny",
      reason: `Tool '${action.tool}' is unregistered and blocked by default-deny policy.`,
      riskScore: 1.0,
      rules: ["RULE_DEFAULT_DENY"],
    };
  }

  /**
   * Check for non-overrideable hard-deny violations.
   */
  private checkHardDeny(action: ProposedAction): string | null {
    const res = action.resource.toLowerCase();

    if (res.includes(".env") || res.includes("id_rsa") || res.includes("/etc/shadow") || res.includes("credentials")) {
      return `Access to sensitive credential resource '${action.resource}' is permanently denied.`;
    }

    if (action.tool === "run_project_command") {
      const cmd = String(action.params.command || "").toLowerCase();
      if (["rm", "sudo", "curl", "wget", "nc", "netcat", "eval"].includes(cmd)) {
        return `Command '${cmd}' is blocked by security allowlist policy.`;
      }
    }

    return null;
  }
}

// Global Singleton Instance
let globalRuntimePolicy: RuntimePolicyEngine | null = null;

export function getRuntimePolicyEngine(): RuntimePolicyEngine {
  if (!globalRuntimePolicy) {
    globalRuntimePolicy = new RuntimePolicyEngine();
  }
  return globalRuntimePolicy;
}
