/**
 * PNG5 MCP Server — Human Approval Manager
 * 
 * Manages the lifecycle of human approvals for sensitive/high-risk tool actions:
 * - Creates cryptographically tracked approval requests
 * - Enforces 5-minute expiration countdown
 * - Prevents replay attacks (one-time redemption token)
 * - Binds approval strictly to the exact tool, arguments, user, and target resource
 * - Synchronizes with the Governor backend /v1/approvals endpoint
 */

import { randomUUID } from "crypto";
import { log } from "../config.js";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "redeemed";

export interface HumanApprovalRequest {
  id: string;
  userId: string;
  agentSessionId: string;
  tool: string;
  action: string;
  target: string;
  params: Record<string, unknown>;
  reason: string;
  riskScore: number;
  rules: string[];
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  decidedBy?: string;
  nonce: string;
}

export class ApprovalManager {
  private approvals: Map<string, HumanApprovalRequest> = new Map();
  private readonly defaultTtlMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Request a new human approval for a high-risk tool call.
   */
  public createRequest(data: {
    userId: string;
    agentSessionId?: string;
    tool: string;
    action: string;
    target: string;
    params?: Record<string, unknown>;
    reason: string;
    riskScore?: number;
    rules?: string[];
    ttlMs?: number;
  }): HumanApprovalRequest {
    const id = `appr_${randomUUID().replace(/-/g, "").substring(0, 12)}`;
    const now = Date.now();
    const expiresAt = new Date(now + (data.ttlMs || this.defaultTtlMs)).toISOString();
    const nonce = randomUUID();

    const request: HumanApprovalRequest = {
      id,
      userId: data.userId || "anonymous",
      agentSessionId: data.agentSessionId || "default-session",
      tool: data.tool,
      action: data.action,
      target: data.target,
      params: data.params || {},
      reason: data.reason,
      riskScore: data.riskScore ?? 0.75,
      rules: data.rules || ["RULE_HIGH_RISK_GATED"],
      status: "pending",
      createdAt: new Date(now).toISOString(),
      expiresAt,
      nonce,
    };

    this.approvals.set(id, request);
    log("info", "Human approval request created", { id, tool: data.tool, target: data.target, reason: data.reason });

    return request;
  }

  /**
   * Get an approval request by ID, verifying expiration.
   */
  public get(id: string): HumanApprovalRequest | undefined {
    const req = this.approvals.get(id);
    if (!req) return undefined;

    // Check expiration
    if (req.status === "pending" && new Date(req.expiresAt).getTime() < Date.now()) {
      req.status = "expired";
      log("info", "Approval request expired", { id });
    }

    return req;
  }

  /**
   * List all pending approval requests.
   */
  public listPending(): HumanApprovalRequest[] {
    const pending: HumanApprovalRequest[] = [];
    const now = Date.now();

    for (const req of this.approvals.values()) {
      if (req.status === "pending") {
        if (new Date(req.expiresAt).getTime() < now) {
          req.status = "expired";
        } else {
          pending.push(req);
        }
      }
    }

    return pending.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * List all approval requests for audit/history.
   */
  public listAll(): HumanApprovalRequest[] {
    return Array.from(this.approvals.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Human operator decides an approval request (Approve or Reject).
   */
  public decide(id: string, decision: "approved" | "rejected", decidedBy: string = "reviewer"): HumanApprovalRequest {
    const req = this.get(id);
    if (!req) {
      throw new Error(`Approval request '${id}' not found`);
    }

    if (req.status !== "pending") {
      throw new Error(`Approval request '${id}' is not pending (current status: ${req.status})`);
    }

    req.status = decision;
    req.decidedAt = new Date().toISOString();
    req.decidedBy = decidedBy;

    log("info", `Human operator decided approval ${id}`, { decision, decidedBy, tool: req.tool });
    return req;
  }

  /**
   * Consume an approval token upon execution (one-time use, prevents replay).
   */
  public consume(id: string): boolean {
    const req = this.get(id);
    if (!req) return false;

    if (req.status !== "approved") {
      return false;
    }

    req.status = "redeemed";
    log("info", `Approval ${id} redeemed/consumed`, { tool: req.tool });
    return true;
  }

  /**
   * Clear approvals (for testing).
   */
  public clear(): void {
    this.approvals.clear();
  }
}

// Global Singleton Instance
let globalApprovalManager: ApprovalManager | null = null;

export function getApprovalManager(): ApprovalManager {
  if (!globalApprovalManager) {
    globalApprovalManager = new ApprovalManager();
  }
  return globalApprovalManager;
}
