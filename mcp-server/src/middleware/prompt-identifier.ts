/**
 * PNG5 MCP Server — Intelligent Risk-Based Prompt Identification Middleware
 * 
 * Analyzes incoming user prompts to extract:
 * - Structured Intent & Classification (informational, search, analysis, routine edit, sensitive edit, deletion, command)
 * - Candidate MCP tools needed
 * - Target resources
 * - Prompt injection & jailbreak detection
 * - Risk scoring & initial routing verdict (ALLOW, REQUIRE_APPROVAL, DENY, CLARIFICATION)
 * 
 * Security principle:
 * 1. Every prompt passes through middleware analysis.
 * 2. Safe/informational/read/routine workspace actions proceed automatically without blocking the developer.
 * 3. Only genuinely sensitive or destructive operations trigger human authorization requests.
 * 4. Dangerous invariants (.env, keys, system paths, jailbreaks) are permanently hard-denied.
 */

import { log } from "../config.js";

export type IntentCategory =
  | "question"
  | "code_analysis"
  | "code_search"
  | "code_suggestion"
  | "code_edit"
  | "file_creation"
  | "file_deletion"
  | "dependency_change"
  | "command_execution"
  | "security_sensitive_change"
  | "system_status"
  | "unknown";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PromptAnalysisResult {
  valid: boolean;
  intent: IntentCategory;
  operation: string;
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
 * Intelligent deterministic prompt classifier.
 */
export function identifyPrompt(rawPrompt: string, userId: string = "web-user"): PromptAnalysisResult {
  const prompt = (rawPrompt || "").trim();

  // 1. Basic validation
  if (!prompt) {
    return {
      valid: false,
      intent: "unknown",
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
      intent: "unknown",
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
        intent: "security_sensitive_change",
        operation: "security.blocked",
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

  // 4. Extract target resources
  const targetResources = extractResources(prompt);
  const lowerPrompt = prompt.toLowerCase();

  let intent: IntentCategory = "question";
  let operation = "file.read";
  const candidateTools: string[] = [];
  let riskLevel: RiskLevel = "LOW";
  let riskScore = 0.1;
  let initialDecision: "allow" | "require_approval" | "deny" | "clarification" = "allow";
  let reason = "Informational / safe workspace operation permitted.";

  // =========================================================================
  // Intent Classification & Risk Assessment
  // =========================================================================

  // A. Connectivity / Status
  if (/^(hello|hi|hey|ping|status|health)$/i.test(prompt) || lowerPrompt.includes("are you connected")) {
    intent = "system_status";
    operation = "system.status";
    candidateTools.push("hello");
    riskLevel = "LOW";
    riskScore = 0.0;
    initialDecision = "allow";
    reason = "Connectivity check permitted.";
  }
  // B. File Creation (e.g. "Create a new file called report.txt", "create md file in docs with system_design.md name", "create smit.txt")
  else if (
    lowerPrompt.startsWith("create") ||
    lowerPrompt.startsWith("make a new file") ||
    lowerPrompt.startsWith("generate file") ||
    lowerPrompt.includes("create file") ||
    lowerPrompt.includes("create md") ||
    lowerPrompt.includes("create txt") ||
    lowerPrompt.includes("create doc") ||
    lowerPrompt.includes("create a file") ||
    lowerPrompt.includes("create new file") ||
    lowerPrompt.includes("write file") ||
    lowerPrompt.includes("make a file") ||
    lowerPrompt.includes("touch ")
  ) {
    intent = "file_creation";
    operation = "file.write";
    candidateTools.push("create_project_file");
    riskLevel = "MEDIUM";
    riskScore = 0.4;
    initialDecision = "allow";
    reason = "Creating ordinary workspace files permitted under workspace policy.";
  }
  // C. Informational Questions & Explanations (e.g. "Explain this file", "What does this do", "Explain how the architecture works")
  else if (
    lowerPrompt.startsWith("explain") ||
    lowerPrompt.startsWith("what is") ||
    lowerPrompt.startsWith("what does") ||
    lowerPrompt.startsWith("how does") ||
    lowerPrompt.startsWith("analyze") ||
    lowerPrompt.startsWith("suggest") ||
    lowerPrompt.includes("architecture") ||
    lowerPrompt.includes("how it works") ||
    lowerPrompt.includes("find the bug")
  ) {
    intent = "question";
    operation = "file.read";
    candidateTools.push("read_project_file", "search_project_code", "list_project_files");
    riskLevel = "LOW";
    riskScore = 0.1;
    initialDecision = "allow";
    reason = "Informational codebase explanation permitted without approval.";
  }
  // D. Code Search & Grep (e.g. "Find all files related to auth", "Search for policy")
  else if (
    lowerPrompt.includes("search") ||
    lowerPrompt.includes("find all") ||
    lowerPrompt.includes("find in code") ||
    lowerPrompt.includes("grep") ||
    lowerPrompt.includes("look for")
  ) {
    intent = "code_search";
    operation = "file.search";
    candidateTools.push("search_project_code", "list_project_files");
    riskLevel = "LOW";
    riskScore = 0.15;
    initialDecision = "allow";
    reason = "Read-only codebase search permitted.";
  }
  // E. Directory / File Listing (e.g. "List the project folders", "Show files in src")
  else if (
    lowerPrompt.includes("list") ||
    lowerPrompt.includes("show file") ||
    lowerPrompt.includes("dir") ||
    lowerPrompt.includes("ls") ||
    lowerPrompt.includes("what files") ||
    lowerPrompt.includes("folder structure")
  ) {
    intent = "code_search";
    operation = "file.list";
    candidateTools.push("list_project_files");
    riskLevel = "LOW";
    riskScore = 0.1;
    initialDecision = "allow";
    reason = "Read-only directory listing permitted.";
  }
  // F. Destructive Deletion (e.g. "Delete the old authentication module", "Remove file")
  else if (
    lowerPrompt.includes("delete file") ||
    lowerPrompt.includes("delete the") ||
    lowerPrompt.includes("remove file") ||
    lowerPrompt.includes("destroy")
  ) {
    intent = "file_deletion";
    operation = "file.delete";
    candidateTools.push("run_project_command");
    riskLevel = "HIGH";
    riskScore = 0.85;
    initialDecision = "require_approval";
    reason = "Destructive file deletion requires explicit human authorization.";
  }
  // G. Dependency / Package Installation (e.g. "Install package lodash", "npm install")
  else if (
    lowerPrompt.includes("install package") ||
    lowerPrompt.includes("install dependency") ||
    lowerPrompt.includes("npm install") ||
    lowerPrompt.includes("pip install") ||
    lowerPrompt.includes("add package")
  ) {
    intent = "dependency_change";
    operation = "dependency.install";
    candidateTools.push("run_project_command");
    riskLevel = "HIGH";
    riskScore = 0.8;
    initialDecision = "require_approval";
    reason = "External package installation requires operator authorization.";
  }
  // H. Sensitive Security/Auth/Middleware Modification
  else if (
    (lowerPrompt.includes("auth") || lowerPrompt.includes("security") || lowerPrompt.includes("governor") || lowerPrompt.includes("middleware") || lowerPrompt.includes("secret")) &&
    (lowerPrompt.includes("edit") || lowerPrompt.includes("change") || lowerPrompt.includes("modify") || lowerPrompt.includes("disable") || lowerPrompt.includes("bypass"))
  ) {
    intent = "security_sensitive_change";
    operation = "file.write.sensitive";
    candidateTools.push("edit_project_file", "read_project_file");
    riskLevel = "HIGH";
    riskScore = 0.85;
    initialDecision = "require_approval";
    reason = "Modifying authentication or security controls requires explicit approval.";
  }
  // I. Routine Reversible UI & Source Code Editing (e.g. "Change button color to blue", "Make login responsive")
  else if (
    lowerPrompt.includes("change") ||
    lowerPrompt.includes("edit") ||
    lowerPrompt.includes("modify") ||
    lowerPrompt.includes("color") ||
    lowerPrompt.includes("button") ||
    lowerPrompt.includes("style") ||
    lowerPrompt.includes("responsive") ||
    lowerPrompt.includes("update") ||
    lowerPrompt.includes("fix") ||
    lowerPrompt.includes("add pagination")
  ) {
    intent = "code_edit";
    operation = "file.write.routine";
    candidateTools.push("read_project_file", "edit_project_file");
    riskLevel = "MEDIUM";
    riskScore = 0.35;
    initialDecision = "allow"; // Permitted under Workspace Editing Policy!
    reason = "Routine workspace code editing permitted under workspace editing policy with diff tracking.";
  }
  // J. Routine Testing Commands (e.g. "Run tests", "npm test", "pytest")
  else if (
    lowerPrompt.includes("run test") ||
    lowerPrompt.includes("run the tests") ||
    lowerPrompt.includes("npm test") ||
    lowerPrompt.includes("pytest") ||
    lowerPrompt.includes("git status")
  ) {
    intent = "command_execution";
    operation = "code.execute.test";
    candidateTools.push("run_project_command");
    riskLevel = "LOW";
    riskScore = 0.2;
    initialDecision = "allow";
    reason = "Routine test suite execution permitted on allowlist.";
  }
  // K. Fallback: Read / Inspect
  else {
    intent = "question";
    operation = "file.read";
    candidateTools.push("read_project_file", "list_project_files", "search_project_code");
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
    intent,
    operation,
    candidateTools,
    riskLevel,
    riskScore,
    initialDecision,
  });

  return {
    valid: true,
    intent,
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
  const pathRegex = /(?:[\w.-]+\/)+[\w.-]+|[\w.-]+\.(?:py|js|ts|tsx|jsx|json|md|txt|html|css|yaml|yml|sh|env)/gi;
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
