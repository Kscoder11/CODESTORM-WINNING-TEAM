/**
 * PNG5 MCP Server — AI Agent Orchestrator
 * 
 * ReAct Reasoning & Execution Loop:
 * 1. Receives user prompt and authenticated user context
 * 2. Runs Prompt Identification Middleware
 * 3. Discovers available tools from MCP Client
 * 4. Iteratively reasons, proposes tool calls, evaluates policy, and executes
 * 5. Handles Approvals, Denials, Timeouts, and Errors cleanly
 * 6. Synthesizes final response for website presentation
 */

import { log } from "../config.js";
import { getMCPClient, PNG5MCPClient, MCPToolCallResult } from "../client/mcp-client.js";
import { identifyPrompt, PromptAnalysisResult } from "../middleware/prompt-identifier.js";
import { getRuntimePolicyEngine, RuntimePolicyEngine, RuntimePolicyVerdict } from "../policy/runtime-policy.js";
import { LLMProvider, ModelPlanStep } from "./llm-provider.js";
import type { HumanApprovalRequest } from "../approvals/approval-manager.js";

export interface AgentExecutionStep {
  stepNumber: number;
  thought: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  policyVerdict?: RuntimePolicyVerdict;
  toolResult?: MCPToolCallResult;
  status: "success" | "approval_required" | "denied" | "error";
  timestamp: string;
}

export interface AgentExecutionResult {
  status: "completed" | "approval_required" | "denied" | "error";
  prompt: string;
  promptAnalysis: PromptAnalysisResult;
  finalResponse: string;
  steps: AgentExecutionStep[];
  approvalRequest?: HumanApprovalRequest;
  totalSteps: number;
  durationMs: number;
  error?: string;
}

export interface AgentRunOptions {
  userId?: string;
  userRole?: string;
  agentSessionId?: string;
  agentSessionToken?: string;
  approvalId?: string | null;
  maxIterations?: number;
  timeoutMs?: number;
}

export class AgentOrchestrator {
  private mcpClient: PNG5MCPClient;
  private policyEngine: RuntimePolicyEngine;
  private llmProvider: LLMProvider;

  constructor(opts?: { mcpClient?: PNG5MCPClient; policyEngine?: RuntimePolicyEngine; llmProvider?: LLMProvider }) {
    this.mcpClient = opts?.mcpClient || getMCPClient();
    this.policyEngine = opts?.policyEngine || getRuntimePolicyEngine();
    this.llmProvider = opts?.llmProvider || new LLMProvider();
  }

  /**
   * Run the end-to-end agent execution pipeline.
   */
  public async run(prompt: string, options: AgentRunOptions = {}): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const userId = options.userId || "web-user";
    const maxIterations = options.maxIterations || 5;
    const timeoutMs = options.timeoutMs || 30000;

    log("info", "Starting Agent Orchestrator run", { prompt, userId, approvalId: options.approvalId });

    // Step 1: Prompt Identification & Security Middleware
    const promptAnalysis = identifyPrompt(prompt, userId);

    if (!promptAnalysis.valid || promptAnalysis.initialDecision === "deny") {
      log("warn", "Prompt rejected by Prompt Identification Middleware", { reason: promptAnalysis.reason });
      return {
        status: "denied",
        prompt,
        promptAnalysis,
        finalResponse: `🚫 **Request Denied by Policy**\n\n${promptAnalysis.reason}`,
        steps: [],
        totalSteps: 0,
        durationMs: Date.now() - startTime,
      };
    }

    if (promptAnalysis.initialDecision === "clarification") {
      return {
        status: "completed",
        prompt,
        promptAnalysis,
        finalResponse: promptAnalysis.reason,
        steps: [],
        totalSteps: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2: Ensure MCP Client is Connected & Discover Tools
    try {
      if (!this.mcpClient.connected) {
        await this.mcpClient.connect();
      }
    } catch (err) {
      const errorMsg = `MCP Server connection failed: ${err instanceof Error ? err.message : String(err)}`;
      log("error", errorMsg);
      return {
        status: "error",
        prompt,
        promptAnalysis,
        finalResponse: `⚠️ **System Error**: Could not connect to MCP Server. Please check that the server process is running.`,
        steps: [],
        totalSteps: 0,
        durationMs: Date.now() - startTime,
        error: errorMsg,
      };
    }

    const availableTools = this.mcpClient.getTools();
    const history: Array<{ role: string; content: string; toolResult?: unknown }> = [];
    const executionSteps: AgentExecutionStep[] = [];

    // Step 3: ReAct Orchestration Loop
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        return {
          status: "error",
          prompt,
          promptAnalysis,
          finalResponse: "⏱️ Execution timed out before completion.",
          steps: executionSteps,
          totalSteps: executionSteps.length,
          durationMs: Date.now() - startTime,
          error: "Execution timeout exceeded",
        };
      }

      // Plan next action with LLM Provider
      const plan: ModelPlanStep = await this.llmProvider.planStep(prompt, history, availableTools);

      // If model formulated final response or no tool needed
      if (plan.isFinal || !plan.tool) {
        const finalResponse = plan.finalResponse || "Task completed successfully.";
        log("info", "Agent reached final synthesis", { totalSteps: executionSteps.length });

        return {
          status: "completed",
          prompt,
          promptAnalysis,
          finalResponse,
          steps: executionSteps,
          totalSteps: executionSteps.length,
          durationMs: Date.now() - startTime,
        };
      }

      // Step 4: Runtime Policy Engine Check at Execution Boundary
      const toolName = plan.tool;
      const toolArgs = plan.arguments || {};
      const targetResource = String(toolArgs.path || toolArgs.directory || toolArgs.command || toolName);

      const policyVerdict = await this.policyEngine.evaluate(
        {
          tool: toolName,
          resource: targetResource,
          params: toolArgs,
        },
        {
          userId,
          userRole: options.userRole,
          agentSessionId: options.agentSessionId,
          agentSessionToken: options.agentSessionToken,
          approvalId: options.approvalId,
        }
      );

      // Case A: Approval Required (Pause execution & return approval ticket)
      if (policyVerdict.verdict === "require_approval") {
        const step: AgentExecutionStep = {
          stepNumber: iteration,
          thought: plan.thought,
          tool: toolName,
          arguments: toolArgs,
          policyVerdict,
          status: "approval_required",
          timestamp: new Date().toISOString(),
        };
        executionSteps.push(step);

        log("info", "Agent execution paused for human approval", {
          tool: toolName,
          approvalId: policyVerdict.approvalRequest?.id,
        });

        return {
          status: "approval_required",
          prompt,
          promptAnalysis,
          finalResponse: `🛡️ **Human Operator Approval Required**\n\nThe agent proposed executing sensitive tool **\`${toolName}\`** on target **\`${targetResource}\`**.\n\n**Reason:** ${policyVerdict.reason}\n**Risk Score:** ${(policyVerdict.riskScore * 100).toFixed(0)}%\n\nPlease review and approve or reject this request below.`,
          steps: executionSteps,
          approvalRequest: policyVerdict.approvalRequest,
          totalSteps: executionSteps.length,
          durationMs: Date.now() - startTime,
        };
      }

      // Case B: Denied by Policy
      if (policyVerdict.verdict === "deny" || !policyVerdict.allowed) {
        const step: AgentExecutionStep = {
          stepNumber: iteration,
          thought: plan.thought,
          tool: toolName,
          arguments: toolArgs,
          policyVerdict,
          status: "denied",
          timestamp: new Date().toISOString(),
        };
        executionSteps.push(step);

        log("warn", "Agent proposed tool call was denied by policy", { tool: toolName, reason: policyVerdict.reason });

        return {
          status: "denied",
          prompt,
          promptAnalysis,
          finalResponse: `🚫 **Tool Execution Denied by Policy**\n\nProposed tool **\`${toolName}\`** was blocked.\n**Reason:** ${policyVerdict.reason}`,
          steps: executionSteps,
          totalSteps: executionSteps.length,
          durationMs: Date.now() - startTime,
        };
      }

      // Case C: Allowed — Execute MCP Tool through Client
      try {
        log("info", `Executing approved MCP tool '${toolName}'`, { toolArgs });
        const toolResult = await this.mcpClient.callTool(toolName, toolArgs);

        const step: AgentExecutionStep = {
          stepNumber: iteration,
          thought: plan.thought,
          tool: toolName,
          arguments: toolArgs,
          policyVerdict,
          toolResult,
          status: toolResult.isError ? "error" : "success",
          timestamp: new Date().toISOString(),
        };
        executionSteps.push(step);

        // Update history for next iteration
        history.push({
          role: "assistant",
          content: plan.thought,
          toolResult,
        });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const step: AgentExecutionStep = {
          stepNumber: iteration,
          thought: plan.thought,
          tool: toolName,
          arguments: toolArgs,
          policyVerdict,
          status: "error",
          timestamp: new Date().toISOString(),
        };
        executionSteps.push(step);

        return {
          status: "error",
          prompt,
          promptAnalysis,
          finalResponse: `⚠️ **Tool Execution Failed**: ${message}`,
          steps: executionSteps,
          totalSteps: executionSteps.length,
          durationMs: Date.now() - startTime,
          error: message,
        };
      }
    }

    // Max iterations reached
    return {
      status: "completed",
      prompt,
      promptAnalysis,
      finalResponse: "Execution completed after reaching maximum step iterations.",
      steps: executionSteps,
      totalSteps: executionSteps.length,
      durationMs: Date.now() - startTime,
    };
  }
}

// Global Singleton Instance
let globalOrchestrator: AgentOrchestrator | null = null;

export function getAgentOrchestrator(): AgentOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new AgentOrchestrator();
  }
  return globalOrchestrator;
}
