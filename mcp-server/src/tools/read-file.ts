/**
 * PNG5 MCP Tool — read_project_file
 * 
 * Reads the content of an authorized file within the project workspace.
 * Read-only operation — allowed by default policy (subject to secret file checks).
 * 
 * Security:
 * - Path validation (traversal, symlinks, containment)
 * - Secret file pattern rejection
 * - File size limits (default 1 MB)
 * - Content never includes API keys or credentials
 * - Policy evaluation before access
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, log } from "../config.js";
import { validateWorkspacePath, validateFileSize } from "../security/workspace.js";
import { evaluatePolicy } from "../policy/evaluator.js";
import { recordAuditEvent } from "../audit/logger.js";

export function registerReadFileTool(server: McpServer): void {
  server.tool(
    "read_project_file",
    "Read the content of a file within the registered project workspace. Respects file size limits and blocks access to secret/credential files.",
    {
      path: z.string().describe("Relative or absolute path to the file within the project workspace"),
      start_line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Optional: start reading from this line number (1-indexed)"),
      end_line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Optional: stop reading at this line number (1-indexed, inclusive)"),
    },
    async ({ path, start_line, end_line }) => {
      const resource = `file:${config.projectRoot}/${path}`;

      // --- Policy evaluation ---
      const decision = await evaluatePolicy({
        userId: config.userId,
        agentSessionId: config.agentSessionId,
        projectId: config.projectId,
        tool: "read_project_file",
        resource,
      });

      if (decision.action === "deny") {
        await recordAuditEvent("read_project_file", resource, decision);
        return {
          content: [{ type: "text" as const, text: `DENIED: ${decision.reason}` }],
          isError: true,
        };
      }

      if (decision.action === "approval_required") {
        await recordAuditEvent("read_project_file", resource, decision);
        return {
          content: [{
            type: "text" as const,
            text: `APPROVAL REQUIRED: ${decision.reason}\nApproval ID: ${decision.approvalId || "pending"}`,
          }],
        };
      }

      // --- Execute ---
      try {
        const validatedPath = validateWorkspacePath(path);

        if (!existsSync(validatedPath)) {
          return {
            content: [{ type: "text" as const, text: `File not found: ${path}` }],
            isError: true,
          };
        }

        validateFileSize(validatedPath, config.maxFileReadSize);

        let content = readFileSync(validatedPath, "utf-8");
        const totalLines = content.split("\n").length;

        // Apply line range if specified
        if (start_line || end_line) {
          const lines = content.split("\n");
          const start = (start_line || 1) - 1;
          const end = end_line || lines.length;
          content = lines.slice(start, end).join("\n");
        }

        const relPath = relative(config.projectRoot, validatedPath);

        await recordAuditEvent("read_project_file", resource, decision, {
          success: true,
        });

        const header = `File: ${relPath} (${totalLines} lines)\n${"─".repeat(50)}\n`;

        return {
          content: [{
            type: "text" as const,
            text: `${header}${content}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("error", "read_project_file failed", { error: message, path });

        await recordAuditEvent("read_project_file", resource, decision, {
          success: false,
          error: message,
        });

        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
