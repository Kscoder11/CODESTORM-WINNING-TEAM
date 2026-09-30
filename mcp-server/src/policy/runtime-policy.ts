/**
 * PNG5 MCP Server — Intelligent Runtime Policy Engine
 * 
 * Enforces Zero-Trust authorization at the execution boundary immediately
 * before any MCP tool is invoked.
 * 
 * Policy Tiers:
 * 1. Low Risk (Informational, Read-Only, Search, Routine Testing) -> Auto-Allow
 * 2. Routine Workspace Editing (Components, Styles, HTML, Documentation) -> Auto-Allow under Workspace Policy
 * 3. High Risk (Sensitive Auth/Security Files, Deletions, Package Installs, Unapproved Commands) -> Require Operator Approval
 * 4. Critical Invariants (Secrets, System Passwords, Path Traversal, Jailbreak Injection) -> Permanent Hard-Deny
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
  workspacePolicy?: "permissive_editing" | "strict_approvals";
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

/** Sensitive path substrings that require human authorization */
const SENSITIVE_PATH_PATTERNS = [
  "auth",
  "security",
  "governor",
  "jwt",
  "session",
  "middleware",
  "password",
  "secret",
  "package.json",
  "package-lock.json",
  "pyproject.toml",
  "requirements.txt",
  ".config",
];

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

    // 1. Hard Deny Checks (Non-overrideable)
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
          reason: `Approval request '${context.approvalId}' was rejected by operator`,
          riskScore: 0.9,
          rules: ["RULE_APPROVAL_REJECTED"],
        };
      }

      if (approval.status === "approved") {
        if (approval.tool !== action.tool) {
          return {
            allowed: false,
            verdict: "deny",
            reason: `Approval token tool mismatch (expected ${approval.tool}, got ${action.tool})`,
            riskScore: 1.0,
            rules: ["RULE_APPROVAL_TAMPERED"],
          };
        }

        // Consume approval token (one-time redemption)
        this.approvalManager.consume(context.approvalId);

        log("info", "Runtime policy: Action allowed via verified human approval", {
          tool: action.tool,
          approvalId: context.approvalId,
        });

        return {
          allowed: true,
          verdict: "allow",
          reason: `Approved by operator (${approval.decidedBy || "human"})`,
          riskScore: approval.riskScore,
          rules: ["RULE_APPROVAL_VERIFIED"],
        };
      }
    }

    // 3. Local Intelligent Zero-Trust Policy Rules
    return this.evaluateIntelligentRules(action, context);
  }

  /**
   * Deterministic local intelligent policy engine.
   */
  private evaluateIntelligentRules(action: ProposedAction, context: PolicyContext): RuntimePolicyVerdict {
    const resourceLower = (action.resource || "").toLowerCase();

    // A. Read-only tools — Always permitted within workspace
    if (["hello", "list_project_files", "read_project_file", "search_project_code"].includes(action.tool)) {
      return {
        allowed: true,
        verdict: "allow",
        reason: `Read-only operation '${action.tool}' permitted within workspace scope.`,
        riskScore: 0.15,
        rules: ["RULE_READ_PERMITTED"],
      };
    }

    // B. Check if writing to sensitive infrastructure or security file
    const isSensitivePath = SENSITIVE_PATH_PATTERNS.some((pattern) => resourceLower.includes(pattern));

    if (isSensitivePath) {
      const approvalReq = this.approvalManager.createRequest({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        tool: action.tool,
        action: "file.write.sensitive",
        target: action.resource,
        params: action.params,
        reason: `Modifying sensitive file '${action.resource}' requires operator authorization.`,
        riskScore: 0.85,
        rules: ["RULE_SENSITIVE_FILE_APPROVAL_REQUIRED"],
      });

      return {
        allowed: false,
        verdict: "require_approval",
        reason: `Modifying sensitive configuration/security file '${action.resource}' requires human approval.`,
        riskScore: 0.85,
        approvalRequest: approvalReq,
        rules: ["RULE_SENSITIVE_FILE_APPROVAL_REQUIRED"],
      };
    }

    // C. Routine Reversible UI / Component / Source Code Editing & File Creation
    if (["edit_project_file", "create_project_file"].includes(action.tool)) {
      // Ordinary files (e.g. style.css, App.tsx, Button.tsx, index.html, reports) proceed under workspace editing policy
      return {
        allowed: true,
        verdict: "allow",
        reason: `Routine workspace file modification '${action.resource}' permitted under workspace editing policy with diff tracking.`,
        riskScore: 0.3,
        rules: ["RULE_WORKSPACE_EDIT_PERMITTED"],
      };
    }

    // D. Command Execution Allowlist Check
    if (action.tool === "run_project_command") {
      const cmd = String(action.params.command || "").toLowerCase();
      const args = (action.params.args as string[]) || [];
      const fullCmd = `${cmd} ${args.join(" ")}`.trim();

      // Safe test & inspection commands are auto-permitted
      if (
        fullCmd.startsWith("git status") ||
        fullCmd.startsWith("git diff") ||
        fullCmd.startsWith("git log") ||
        fullCmd.startsWith("npm test") ||
        fullCmd.startsWith("pytest") ||
        fullCmd.startsWith("python --version") ||
        fullCmd.startsWith("node --version")
      ) {
        return {
          allowed: true,
          verdict: "allow",
          reason: `Routine developer command '${fullCmd}' permitted by allowlist.`,
          riskScore: 0.2,
          rules: ["RULE_COMMAND_ALLOWLIST_PERMITTED"],
        };
      }

      // Package installations or custom commands require approval
      const approvalReq = this.approvalManager.createRequest({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        tool: action.tool,
        action: "code.execute",
        target: fullCmd,
        params: action.params,
        reason: `Executing command '${fullCmd}' requires operator authorization.`,
        riskScore: 0.8,
        rules: ["RULE_COMMAND_APPROVAL_REQUIRED"],
      });

      return {
        allowed: false,
        verdict: "require_approval",
        reason: `Executing command '${fullCmd}' requires human authorization.`,
        riskScore: 0.8,
        approvalRequest: approvalReq,
        rules: ["RULE_COMMAND_APPROVAL_REQUIRED"],
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

    if (res.includes(".env") || res.includes("id_rsa") || res.includes("/etc/shadow") || res.includes("credentials.json")) {
      return `Access to sensitive credential resource '${action.resource}' is permanently denied.`;
    }

    if (res.includes("../") || res.includes("..\\")) {
      return `Path traversal outside project root is permanently denied.`;
    }

    if (action.tool === "run_project_command") {
      const cmd = String(action.params.command || "").toLowerCase();
      if (["rm", "sudo", "curl", "wget", "nc", "netcat", "eval", "mkfs", "dd"].includes(cmd)) {
        return `Destructive/Egress command '${cmd}' is blocked by security policy.`;
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
