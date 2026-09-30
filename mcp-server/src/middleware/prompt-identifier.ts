/**
 * PNG5 MCP Server — Prompt Identification Middleware
 * 
 * Runs after authentication and BEFORE agent orchestrator execution.
 * Deterministically analyzes incoming user prompts to extract:
 * - Intent & classification (read, search, edit, create, execute, status)
 * - Candidate MCP tools needed
 * - Target resources (paths, commands)
 * - Prompt injection & jailbreak detection
 * - Initial risk scoring & baseline policy verdict (ALLOW, REQUIRE_APPROVAL, DENY, CLARIFICATION)
 * 
 * Security principle: LLMs must NEVER authorize their own actions.
 * Authorization is strictly deterministic and server-enforced.
 */

import { log } from "../config.js";

export type OperationType =
  | "file.read"
  | "file.list"
  | "file.search"
  | "file.write"
  | "code.execute"
  | "system.status"
  | "unknown";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PromptAnalysisResult {
  valid: boolean;
  intent: string;
  operation: OperationType;
  candidateTools: string[];
  targetResources: string[];
  riskLevel: RiskLevel;
  riskScore: number;
  initialDecision: "allow" | "require_approval" | "deny" | "clarification";
  reason: string;
  detectedInjections: string[];
  sanitizedPrompt: string;
}

/** Known prompt injection / jailbreak patterns */
const INJECTION_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i, name: "INSTRUCTION_OVERRIDE" },
  { regex: /you\s+are\s+now\s+in\s+(developer|unrestricted|god|dan)\s+mode/i, name: "ROLEPLAY_JAILBREAK" },
  { regex: /(system\s+override|bypass\s+governor|bypass\s+policy|disable\s+security)/i, name: "POLICY_BYPASS_ATTEMPT" },
  { regex: /(disregard|forget)\s+all\s+safety\s+rules/i, name: "SAFETY_RULE_TAMPERING" },
  { regex: /base64\s+decode.*(cat|curl|rm|exec)/i, name: "OBFUSCATED_PAYLOAD" },
  { regex: /<script>|<\/script>|<iframe|javascript:/i, name: "XSS_INJECTION" },
  { regex: /\[system\]|\[assistant\]|\[developer\]/i, name: "PROMPT_DELIMITER_INJECTION" },
];

/** Secret file access keywords that trigger immediate DENY */
const HARD_DENY_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /\.env\b/i, reason: "Access to environment/secret configuration (.env) is hard-denied" },
  { regex: /(id_rsa|id_ed25519|\.ssh)/i, reason: "Access to SSH keys and credentials is hard-denied" },
  { regex: /(\/etc\/shadow|\/etc\/passwd)/i, reason: "Access to system password databases is hard-denied" },
  { regex: /(prod\.db|production\.db)/i, reason: "Direct access to production database is hard-denied" },
  { regex: /(rm\s+-rf|mkfs|dd\s+if=|sudo\s+rm|chmod\s+777)/i, reason: "Destructive system commands are hard-denied" },
  { regex: /(curl|wget|nc|netcat|ncat)\s+/i, reason: "Arbitrary external network egress commands are hard-denied" },
];

/**
 * Analyze and classify an incoming user prompt before agent execution.
 */
export function identifyPrompt(rawPrompt: string, userId: string = "web-user"): PromptAnalysisResult {
  const prompt = (rawPrompt || "").trim();

  // 1. Basic validation
  if (!prompt) {
    return {
      valid: false,
      intent: "empty",
      operation: "unknown",
      candidateTools: [],
      targetResources: [],
      riskLevel: "LOW",
      riskScore: 0,
      initialDecision: "clarification",
      reason: "Please enter a prompt describing the task you want to perform.",
      detectedInjections: [],
      sanitizedPrompt: "",
    };
  }

  if (prompt.length > 4000) {
    return {
      valid: false,
      intent: "payload_too_large",
      operation: "unknown",
      candidateTools: [],
      targetResources: [],
      riskLevel: "CRITICAL",
      riskScore: 1.0,
      initialDecision: "deny",
      reason: "Prompt exceeds maximum allowed length of 4,000 characters.",
      detectedInjections: ["EXCESSIVE_LENGTH"],
      sanitizedPrompt: prompt.substring(0, 4000),
    };
  }

  // 2. Scan for prompt injection / jailbreak attempts
  const detectedInjections: string[] = [];
  for (const { regex, name } of INJECTION_PATTERNS) {
    if (regex.test(prompt)) {
      detectedInjections.push(name);
    }
  }

  // 3. Scan for Hard-Deny security violations
  for (const { regex, reason } of HARD_DENY_PATTERNS) {
    if (regex.test(prompt)) {
      log("warn", "Prompt triggered hard-deny rule", { prompt, reason, userId });
      return {
        valid: true,
        intent: "blocked_security_violation",
        operation: "unknown",
        candidateTools: [],
        targetResources: extractResources(prompt),
        riskLevel: "CRITICAL",
        riskScore: 1.0,
        initialDecision: "deny",
        reason: `Action Denied by Governor Policy: ${reason}`,
        detectedInjections,
        sanitizedPrompt: prompt,
      };
    }
  }

  // 4. Extract target resources (file paths, search queries, commands)
  const targetResources = extractResources(prompt);

  // 5. Classify Operation & Select Candidate Tools
  let operation: OperationType = "unknown";
  const candidateTools: string[] = [];
  let riskLevel: RiskLevel = "LOW";
  let riskScore = 0.1;
  let initialDecision: "allow" | "require_approval" | "deny" | "clarification" = "allow";
  let reason = "Operation permitted by baseline policy.";

  const lowerPrompt = prompt.toLowerCase();

  // A. Connectivity / Status
  if (/^(hello|hi|hey|ping|status|health)$/i.test(prompt) || lowerPrompt.includes("are you connected")) {
    operation = "system.status";
    candidateTools.push("hello");
    riskLevel = "LOW";
    riskScore = 0.0;
    initialDecision = "allow";
    reason = "Connectivity check permitted.";
  }
  // B. Directory / File Listing
  else if (
    lowerPrompt.includes("list") ||
    lowerPrompt.includes("show file") ||
    lowerPrompt.includes("what files") ||
    lowerPrompt.includes("dir") ||
    lowerPrompt.includes("ls") ||
    lowerPrompt.includes("directory")
  ) {
    operation = "file.list";
    candidateTools.push("list_project_files");
    riskLevel = "LOW";
    riskScore = 0.15;
    initialDecision = "allow";
    reason = "Read-only file listing permitted within project workspace.";
  }
  // C. Code Search / Grep
  else if (
    lowerPrompt.includes("search") ||
    lowerPrompt.includes("find in code") ||
    lowerPrompt.includes("grep") ||
    lowerPrompt.includes("look for")
  ) {
    operation = "file.search";
    candidateTools.push("search_project_code");
    candidateTools.push("list_project_files");
    riskLevel = "LOW";
    riskScore = 0.2;
    initialDecision = "allow";
    reason = "Read-only code search permitted within project workspace.";
  }
  // D. File Modification / Editing
  else if (
    lowerPrompt.includes("edit") ||
    lowerPrompt.includes("modify") ||
    lowerPrompt.includes("update file") ||
    lowerPrompt.includes("replace text") ||
    lowerPrompt.includes("change line")
  ) {
    operation = "file.write";
    candidateTools.push("read_project_file");
    candidateTools.push("edit_project_file");
    riskLevel = "HIGH";
    riskScore = 0.75;
    initialDecision = "require_approval";
    reason = "Modifying source files is a high-risk operation requiring human approval.";
  }
  // E. File Creation
  else if (
    lowerPrompt.includes("create file") ||
    lowerPrompt.includes("make a new file") ||
    lowerPrompt.includes("write a new file") ||
    lowerPrompt.includes("generate file") ||
    lowerPrompt.includes("save to file")
  ) {
    operation = "file.write";
    candidateTools.push("create_project_file");
    riskLevel = "MEDIUM";
    riskScore = 0.65;
    initialDecision = "require_approval";
    reason = "Creating new files in the workspace requires human approval.";
  }
  // F. Command Execution / Testing
  else if (
    lowerPrompt.includes("run command") ||
    lowerPrompt.includes("run test") ||
    lowerPrompt.includes("pytest") ||
    lowerPrompt.includes("npm test") ||
    lowerPrompt.includes("execute") ||
    lowerPrompt.includes("git status") ||
    lowerPrompt.includes("python ")
  ) {
    operation = "code.execute";
    candidateTools.push("run_project_command");
    riskLevel = "HIGH";
    riskScore = 0.85;
    initialDecision = "require_approval";
    reason = "Terminal command execution requires human approval and strict allowlist enforcement.";
  }
  // G. File Reading / Inspection
  else if (
    lowerPrompt.includes("read") ||
    lowerPrompt.includes("show") ||
    lowerPrompt.includes("view") ||
    lowerPrompt.includes("check content") ||
    lowerPrompt.includes("inspect") ||
    targetResources.length > 0
  ) {
    operation = "file.read";
    candidateTools.push("read_project_file");
    candidateTools.push("list_project_files");
    riskLevel = "LOW";
    riskScore = 0.25;
    initialDecision = "allow";
    reason = "Reading files within authorized workspace is permitted.";
  }
  // H. General / Conversational fallback
  else {
    operation = "file.read";
    candidateTools.push("hello", "list_project_files", "search_project_code");
    riskLevel = "LOW";
    riskScore = 0.1;
    initialDecision = "allow";
    reason = "General query evaluated with standard read-only toolset.";
  }

  // If jailbreak attempt was detected, escalate risk score and flag
  if (detectedInjections.length > 0) {
    riskScore = Math.max(riskScore, 0.95);
    riskLevel = "CRITICAL";
    initialDecision = "deny";
    reason = `Blocked due to detected prompt injection patterns: ${detectedInjections.join(", ")}`;
  }

  log("info", "Prompt identified and classified", {
    userId,
    operation,
    candidateTools,
    riskLevel,
    riskScore,
    initialDecision,
  });

  return {
    valid: true,
    intent: prompt,
    operation,
    candidateTools,
    targetResources,
    riskLevel,
    riskScore,
    initialDecision,
    reason,
    detectedInjections,
    sanitizedPrompt: prompt,
  };
}

/**
 * Extract target filenames, paths, or resource indicators from prompt text.
 */
function extractResources(prompt: string): string[] {
  const resources: string[] = [];

  // Match file path patterns (e.g. src/main.py, package.json, /workspace/...)
  const pathRegex = /(?:[\w.-]+\/)+[\w.-]+|[\w.-]+\.(?:py|js|ts|json|md|txt|html|css|yaml|yml|sh|env)/gi;
  const matches = prompt.match(pathRegex);

  if (matches) {
    for (const m of matches) {
      if (!resources.includes(m)) {
        resources.push(m);
      }
    }
  }

  return resources;
}
