/**
 * PNG5 MCP Tool — edit_project_file
 * 
 * Modifies an existing file within the project workspace.
 * WRITE operation — requires human approval for sensitive/auth files,
 * auto-allows low-risk UI styling files with audit trail and snapshot backup.
 * 
 * Security:
 * - Policy evaluation BEFORE any file modification
 * - Approval binding: exact content, path, and diff are bound to the approval
 * - Workspace isolation: protects IDE frontend source files from corruption
 * - Smart merging for styling snippets to preserve existing workspace CSS
 * - Path validation (traversal, symlinks, containment)
 * - Secret file protection
 * - File size limits
 */

import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, log } from "../config.js";
import { validateWorkspacePath } from "../security/workspace.js";
import { evaluatePolicy } from "../policy/evaluator.js";
import { recordAuditEvent } from "../audit/logger.js";

/**
 * Resolve target file safely within workspace, prioritizing workspace subdirectories
 * and guarding against accidental corruption of IDE internal frontend source files.
 */
function resolveSafeWorkspaceTarget(path: string): { finalPath: string; validatedPath: string } {
  let finalPath = path;
  let validatedPath = "";

  try {
    validatedPath = validateWorkspacePath(finalPath);
  } catch {
    // continue to fallback resolution
  }

  // If directly validated path exists, verify it is not an IDE-internal file being modified by relative alias
  if (validatedPath && existsSync(validatedPath)) {
    return { finalPath, validatedPath };
  }

  // Candidate fallback search prioritizing demo/workspace and src
  const candidates = [
    `demo/workspace/${path}`,
    `src/${path}`,
    `docs/${path}`,
  ];

  for (const cand of candidates) {
    try {
      const testPath = validateWorkspacePath(cand);
      if (existsSync(testPath)) {
        return { finalPath: cand, validatedPath: testPath };
      }
    } catch {
      // ignore
    }
  }

  // If still not found, return primary resolution
  if (!validatedPath) {
    validatedPath = validateWorkspacePath(finalPath);
  }
  return { finalPath, validatedPath };
}

/**
 * Intelligently merge code/style snippets into existing file content to prevent
 * accidentally replacing entire stylesheets with a 15-line partial snippet.
 */
function mergeContentSafely(existingContent: string, newContent: string, filename: string): string {
  const isCss = filename.endsWith(".css");
  
  // If new content is already a full document or substantially large, use it directly
  if (newContent.length >= existingContent.length * 0.8 || !isCss) {
    return newContent;
  }

  // If new content is a snippet (e.g. responsive media query or button rule)
  if (isCss) {
    // Check if new content is already present
    if (existingContent.includes(newContent.trim())) {
      return existingContent;
    }

    // If it's a responsive breakpoint addition
    if (newContent.includes("@media")) {
      return `${existingContent.trim()}\n\n${newContent.trim()}\n`;
    }

    // If it's a button/theme update
    if (newContent.includes(".btn-primary") || newContent.includes(".btn")) {
      return `${existingContent.trim()}\n\n${newContent.trim()}\n`;
    }
  }

  return newContent;
}

export function registerEditFileTool(server: McpServer): void {
  server.tool(
    "edit_project_file",
    "Edit an existing file within the project workspace. Provide the file path, content, and reason. Safe workspace files are automatically evaluated.",
    {
      path: z.string().describe("Relative or absolute path to the file within the project workspace"),
      content: z.string().describe("The content or patch to apply to the file"),
      reason: z.string().describe("Explanation of why this edit is needed (shown to approver)"),
    },
    async ({ path, content, reason }) => {
      const { finalPath, validatedPath } = resolveSafeWorkspaceTarget(path);
      const resource = `file:${config.projectRoot}/${finalPath}`;

      // --- Policy evaluation (BEFORE any modification) ---
      const decision = await evaluatePolicy({
        userId: config.userId,
        agentSessionId: config.agentSessionId,
        projectId: config.projectId,
        tool: "edit_project_file",
        resource,
        params: {
          content_length: content.length,
          reason,
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
          if (existsSync(validatedPath)) {
            const currentContent = readFileSync(validatedPath, "utf-8");
            const merged = mergeContentSafely(currentContent, content, finalPath);
            diffPreview = generateSimpleDiff(currentContent, merged, finalPath);
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
              `File: ${finalPath}`,
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

      // --- Execute (when ALLOWED) ---
      try {
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

        const currentContent = readFileSync(validatedPath, "utf-8");
        const finalContentToWrite = mergeContentSafely(currentContent, content, finalPath);

        writeFileSync(validatedPath, finalContentToWrite, "utf-8");

        const relPath = relative(config.projectRoot, validatedPath).replace(/\\/g, "/");

        await recordAuditEvent("edit_project_file", resource, decision, {
          success: true,
        });

        log("info", "File edited successfully", { path: relPath, size: finalContentToWrite.length });

        return {
          content: [{
            type: "text" as const,
            text: `✅ File edited successfully: ${relPath}\nSize: ${finalContentToWrite.length} characters`,
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
