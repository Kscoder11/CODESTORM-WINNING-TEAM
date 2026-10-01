/**
 * PNG5 MCP Tool — create_project_file
 * 
 * Creates a new file within the project workspace.
 * WRITE operation — requires human approval before execution.
 * 
 * Security:
 * - Policy evaluation BEFORE any file creation
 * - Path validation (traversal, symlinks, containment)
 * - Secret file protection (cannot create .env, credentials, etc.)
 * - File size limits
 * - Will not overwrite existing files
 */

import { z } from "zod";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { relative, dirname } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, log } from "../config.js";
import { validateWorkspacePath } from "../security/workspace.js";
import { evaluatePolicy } from "../policy/evaluator.js";
import { recordAuditEvent } from "../audit/logger.js";

export function registerCreateFileTool(server: McpServer): void {
  server.tool(
    "create_project_file",
    "Create a new file within the project workspace. This is a WRITE operation that requires human approval. Will NOT overwrite existing files.",
    {
      path: z.string().describe("Relative or absolute path for the new file within the project workspace"),
      content: z.string().describe("The content for the new file"),
      reason: z.string().describe("Explanation of why this file needs to be created (shown to approver)"),
      approval_id: z
        .string()
        .optional()
        .describe("Internal one-time execution ticket issued after human approval. Omit unless instructed by the system."),
    },
    async ({ path, content, reason, approval_id }) => {
      const resource = `file:${config.projectRoot}/${path}`;

      // --- Policy evaluation (BEFORE any file creation) ---
      const decision = await evaluatePolicy({
        userId: config.userId,
        agentSessionId: config.agentSessionId,
        projectId: config.projectId,
        tool: "create_project_file",
        resource,
        params: {
          path,
          content_length: content.length,
          reason,
          approval_id,
        },
      });

      if (decision.action === "deny") {
        await recordAuditEvent("create_project_file", resource, decision);
        return {
          content: [{ type: "text" as const, text: `DENIED: ${decision.reason}` }],
          isError: true,
        };
      }

      if (decision.action === "approval_required") {
        await recordAuditEvent("create_project_file", resource, decision);
        return {
          content: [{
            type: "text" as const,
            text: [
              `APPROVAL REQUIRED: ${decision.reason}`,
              ``,
              `New file: ${path}`,
              `Reason: ${reason}`,
              `Content length: ${content.length} characters`,
              `Approval ID: ${decision.approvalId || "pending"}`,
              ``,
              `--- Proposed content preview (first 500 chars) ---`,
              content.substring(0, 500) + (content.length > 500 ? "\n... [truncated]" : ""),
              ``,
              `The file will NOT be created until approval is granted.`,
            ].join("\n"),
          }],
        };
      }

      // --- Execute (only if ALLOWED) ---
      try {
        const validatedPath = validateWorkspacePath(path);

        // Refuse to overwrite existing files
        if (existsSync(validatedPath)) {
          return {
            content: [{
              type: "text" as const,
              text: `File already exists: ${path}. Use edit_project_file to modify existing files.`,
            }],
            isError: true,
          };
        }

        // Validate write size
        if (Buffer.byteLength(content, "utf-8") > config.maxFileWriteSize) {
          return {
            content: [{
              type: "text" as const,
              text: `Content exceeds maximum write size (${config.maxFileWriteSize} bytes)`,
            }],
            isError: true,
          };
        }

        // Create parent directories if they don't exist
        const dir = dirname(validatedPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(validatedPath, content, "utf-8");

        const relPath = relative(config.projectRoot, validatedPath);

        await recordAuditEvent("create_project_file", resource, decision, {
          success: true,
        });

        log("info", "File created successfully", { path: relPath });

        return {
          content: [{
            type: "text" as const,
            text: `✅ File created successfully: ${relPath}\nSize: ${content.length} characters`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("error", "create_project_file failed", { error: message, path });

        await recordAuditEvent("create_project_file", resource, decision, {
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
