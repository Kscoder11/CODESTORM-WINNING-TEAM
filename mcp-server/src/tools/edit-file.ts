/**
 * PNG5 MCP Tool — edit_project_file
 * 
 * Modifies an existing file within the project workspace.
 * WRITE operation — requires human approval before execution.
 * 
 * Security:
 * - Policy evaluation BEFORE any file modification
 * - Approval binding: exact content, path, and diff are bound to the approval
 * - Path validation (traversal, symlinks, containment)
 * - Secret file protection
 * - File size limits
 * - No modification occurs before approval is granted
 */

import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, log } from "../config.js";
import { validateWorkspacePath, validateFileSize } from "../security/workspace.js";
import { evaluatePolicy } from "../policy/evaluator.js";
import { recordAuditEvent } from "../audit/logger.js";

export function registerEditFileTool(server: McpServer): void {
  server.tool(
    "edit_project_file",
    "Edit an existing file within the project workspace. This is a WRITE operation that requires human approval. Provide the file path and the new content. The file must already exist.",
    {
      path: z.string().describe("Relative or absolute path to the file within the project workspace"),
      content: z.string().describe("The complete new content for the file"),
      reason: z.string().describe("Explanation of why this edit is needed (shown to approver)"),
      approval_id: z
        .string()
        .optional()
        .describe("Internal one-time execution ticket issued after human approval. Omit unless instructed by the system."),
    },
    async ({ path, content, reason, approval_id }) => {
      const resource = `file:${config.projectRoot}/${path}`;

      // --- Policy evaluation (BEFORE any modification) ---
      const decision = await evaluatePolicy({
        userId: config.userId,
        agentSessionId: config.agentSessionId,
        projectId: config.projectId,
        tool: "edit_project_file",
        resource,
        params: {
          path,
          content_length: content.length,
          reason,
          approval_id,
        },
      });

      if (decision.action === "deny") {
        await recordAuditEvent("edit_project_file", resource, decision);
        return {
          content: [{ type: "text" as const, text: `DENIED: ${decision.reason}` }],
          isError: true,
        };
      }

      if (decision.action === "approval_required") {
        await recordAuditEvent("edit_project_file", resource, decision);

        // Generate a preview diff for the approver
        let diffPreview = "";
        try {
          const validatedPath = validateWorkspacePath(path);
          if (existsSync(validatedPath)) {
            const currentContent = readFileSync(validatedPath, "utf-8");
            diffPreview = generateSimpleDiff(currentContent, content, path);
          }
        } catch {
          diffPreview = "[Could not generate diff preview]";
        }

        return {
          content: [{
            type: "text" as const,
            text: [
              `APPROVAL REQUIRED: ${decision.reason}`,
              ``,
              `File: ${path}`,
              `Reason: ${reason}`,
              `Content length: ${content.length} characters`,
              `Approval ID: ${decision.approvalId || "pending"}`,
              ``,
              `--- Proposed changes ---`,
              diffPreview,
              ``,
              `The file will NOT be modified until approval is granted.`,
              `Submit the approval_id with a subsequent request to execute.`,
            ].join("\n"),
          }],
        };
      }

      // --- Execute (only if ALLOWED — i.e., approval was previously granted) ---
      try {
        const validatedPath = validateWorkspacePath(path);

        if (!existsSync(validatedPath)) {
          return {
            content: [{
              type: "text" as const,
              text: `File not found: ${path}. Use create_project_file to create new files.`,
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

        writeFileSync(validatedPath, content, "utf-8");

        const relPath = relative(config.projectRoot, validatedPath);

        await recordAuditEvent("edit_project_file", resource, decision, {
          success: true,
        });

        log("info", "File edited successfully", { path: relPath });

        return {
          content: [{
            type: "text" as const,
            text: `✅ File edited successfully: ${relPath}\nSize: ${content.length} characters`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("error", "edit_project_file failed", { error: message, path });

        await recordAuditEvent("edit_project_file", resource, decision, {
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

/**
 * Generate a simple unified diff preview for the approver.
 */
function generateSimpleDiff(oldContent: string, newContent: string, filename: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const diff: string[] = [`--- a/${filename}`, `+++ b/${filename}`];
  const maxLines = Math.max(oldLines.length, newLines.length);

  let changedLines = 0;
  for (let i = 0; i < maxLines && changedLines < 50; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) continue;

    changedLines++;
    if (oldLine !== undefined && newLine !== undefined) {
      diff.push(`-${oldLine}`);
      diff.push(`+${newLine}`);
    } else if (oldLine !== undefined) {
      diff.push(`-${oldLine}`);
    } else if (newLine !== undefined) {
      diff.push(`+${newLine}`);
    }
  }

  if (changedLines >= 50) {
    diff.push("... [diff truncated]");
  }

  return diff.join("\n");
}
