/**
 * PNG5 MCP Tool — run_project_command
 * 
 * Runs a sandboxed, allowlisted command within the project workspace.
 * HIGH-RISK operation — strictly gated by policy and command guard.
 * 
 * Security:
 * - Command allowlist (only approved base commands)
 * - Shell metacharacter rejection (no pipes, redirects, subshells)
 * - Argument sanitization (reject dangerous flags like --exec, -rf, rm, sudo)
 * - Working directory containment (must be within workspace)
 * - Hard timeout (default 5 seconds)
 * - Output size truncation (64 KB max)
 * - Policy evaluation before execution
 * - Never exposes unrestricted shell access
 */

import { z } from "zod";
import { execFile } from "child_process";
import { relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, log } from "../config.js";
import { validateWorkspacePath } from "../security/workspace.js";
import { validateCommand, truncateOutput } from "../security/command-guard.js";
import { evaluatePolicy } from "../policy/evaluator.js";
import { recordAuditEvent } from "../audit/logger.js";

export function registerRunCommandTool(server: McpServer): void {
  server.tool(
    "run_project_command",
    "Run an approved command within the project workspace. Only allowlisted commands are permitted (ls, cat, grep, python, node, git, etc.). Shell metacharacters and dangerous arguments are blocked. Requires approval for most commands.",
    {
      command: z.string().describe("The base command to run (must be on the allowlist)"),
      args: z
        .array(z.string())
        .default([])
        .describe("Array of command arguments (structured, not a shell string)"),
      working_directory: z
        .string()
        .default(".")
        .describe("Working directory relative to project root (default: project root)"),
    },
    async ({ command, args, working_directory }) => {
      const resource = `exec:${command} ${args.join(" ")}`;

      // --- Policy evaluation (BEFORE any execution) ---
      const decision = await evaluatePolicy({
        userId: config.userId,
        agentSessionId: config.agentSessionId,
        projectId: config.projectId,
        tool: "run_project_command",
        resource,
        params: { command, args },
      });

      if (decision.action === "deny") {
        await recordAuditEvent("run_project_command", resource, decision);
        return {
          content: [{ type: "text" as const, text: `DENIED: ${decision.reason}` }],
          isError: true,
        };
      }

      if (decision.action === "approval_required") {
        await recordAuditEvent("run_project_command", resource, decision);
        return {
          content: [{
            type: "text" as const,
            text: [
              `APPROVAL REQUIRED: ${decision.reason}`,
              ``,
              `Command: ${command}`,
              `Arguments: ${args.join(" ") || "(none)"}`,
              `Working directory: ${working_directory}`,
              `Approval ID: ${decision.approvalId || "pending"}`,
              ``,
              `The command will NOT execute until approval is granted.`,
            ].join("\n"),
          }],
        };
      }

      // --- Validate command (allowlist + sanitization) ---
      let validated;
      try {
        const cwdPath = validateWorkspacePath(working_directory);
        validated = validateCommand(command, args, cwdPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("warn", "Command validation failed", { command, error: message });

        await recordAuditEvent("run_project_command", resource, decision, {
          success: false,
          error: message,
        });

        return {
          content: [{ type: "text" as const, text: `Command blocked: ${message}` }],
          isError: true,
        };
      }

      // --- Execute ---
      try {
        const result = await executeCommand(validated.command, validated.args, validated.cwd, validated.timeout);

        await recordAuditEvent("run_project_command", resource, decision, {
          success: result.exitCode === 0,
          error: result.exitCode !== 0 ? `Exit code: ${result.exitCode}` : undefined,
        });

        const header = `Command: ${validated.command} ${validated.args.join(" ")}\nExit code: ${result.exitCode}\n${"─".repeat(50)}\n`;

        let output = "";
        if (result.stdout) {
          output += `STDOUT:\n${truncateOutput(result.stdout)}\n`;
        }
        if (result.stderr) {
          output += `\nSTDERR:\n${truncateOutput(result.stderr)}\n`;
        }
        if (!result.stdout && !result.stderr) {
          output = "(no output)\n";
        }

        return {
          content: [{
            type: "text" as const,
            text: `${header}${output}`,
          }],
          isError: result.exitCode !== 0,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("error", "run_project_command failed", { command, error: message });

        await recordAuditEvent("run_project_command", resource, decision, {
          success: false,
          error: message,
        });

        return {
          content: [{ type: "text" as const, text: `Execution error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a command using execFile (NOT shell) with a timeout.
 * execFile does NOT spawn a shell, so shell metacharacters are inert.
 */
function executeCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024, // 1 MB max buffer
        windowsHide: true,
        env: {
          // Minimal env — don't leak host env vars
          PATH: process.env.PATH || "",
          HOME: process.env.HOME || process.env.USERPROFILE || "",
          LANG: "en_US.UTF-8",
        },
      },
      (error, stdout, stderr) => {
        if (error && "killed" in error && error.killed) {
          resolve({
            stdout: stdout || "",
            stderr: `Command killed: timeout exceeded (${timeout}ms)`,
            exitCode: 124,
          });
          return;
        }

        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code as unknown as number || 1 : 0,
        });
      }
    );
  });
}
