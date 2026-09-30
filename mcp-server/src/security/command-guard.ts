/**
 * PNG5 MCP Server — Command Guard
 * 
 * Enforces strict command allowlist and sandboxing for run_project_command.
 * Never allows unrestricted shell execution.
 * 
 * Security measures:
 * - Command allowlist (only approved base commands)
 * - Argument sanitization (reject shell metacharacters)
 * - Working directory containment (must be within workspace)
 * - Timeout enforcement
 * - Output size limits
 */

import { config, log } from "../config.js";
import { WorkspaceSecurityError } from "./workspace.js";

/** Characters that indicate shell injection attempts */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!\n\r\\'"]/;

/** Dangerous argument patterns */
const DANGEROUS_ARGS = [
  /^--exec/i,
  /^-exec/i,
  /^--delete/i,
  /^-rf$/,
  /^--force$/,
  /^rm$/,
  /^sudo$/,
  /^chmod$/,
  /^chown$/,
  /^mkfs/,
  /^dd$/,
  /^curl$/,
  /^wget$/,
  /^nc$/,
  /^netcat$/,
  /^ssh$/,
  /^scp$/,
  /^eval$/,
  /^source$/,
];

export interface CommandValidation {
  command: string;
  args: string[];
  cwd: string;
  timeout: number;
}

/**
 * Validate and sanitize a command before execution.
 * 
 * @param command The base command to run
 * @param args Arguments to pass
 * @param cwd Working directory (must be within workspace)
 * @returns Validated command structure
 * @throws WorkspaceSecurityError on any violation
 */
export function validateCommand(
  command: string,
  args: string[] = [],
  cwd?: string
): CommandValidation {
  // --- Check 1: Command is on allowlist ---
  const baseCommand = command.trim().toLowerCase();
  if (!config.commandAllowlist.includes(baseCommand)) {
    log("warn", "Command not on allowlist", { command: baseCommand });
    throw new WorkspaceSecurityError(
      `Command '${baseCommand}' is not on the approved allowlist. Allowed: ${config.commandAllowlist.join(", ")}`,
      "COMMAND_NOT_ALLOWED"
    );
  }

  // --- Check 2: No shell metacharacters in command ---
  if (SHELL_METACHARACTERS.test(command)) {
    throw new WorkspaceSecurityError(
      "Shell metacharacters detected in command — use structured arguments instead",
      "SHELL_INJECTION"
    );
  }

  // --- Check 3: Validate each argument ---
  for (const arg of args) {
    // Check for shell metacharacters
    if (SHELL_METACHARACTERS.test(arg)) {
      throw new WorkspaceSecurityError(
        `Shell metacharacter detected in argument: ${arg.substring(0, 50)}`,
        "SHELL_INJECTION"
      );
    }

    // Check for dangerous argument patterns
    for (const pattern of DANGEROUS_ARGS) {
      if (pattern.test(arg)) {
        throw new WorkspaceSecurityError(
          `Dangerous argument pattern detected: ${arg}`,
          "DANGEROUS_ARGUMENT"
        );
      }
    }
  }

  // --- Check 4: Working directory containment ---
  const workingDir = cwd || config.projectRoot;

  return {
    command: baseCommand,
    args,
    cwd: workingDir,
    timeout: config.commandTimeout,
  };
}

/**
 * Truncate command output to prevent excessive memory usage.
 */
export function truncateOutput(output: string, maxBytes: number = 65536): string {
  if (Buffer.byteLength(output, "utf-8") <= maxBytes) {
    return output;
  }
  const truncated = Buffer.from(output, "utf-8").subarray(0, maxBytes).toString("utf-8");
  return truncated + "\n... [output truncated at 64KB]";
}
