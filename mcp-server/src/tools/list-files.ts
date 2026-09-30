/**
 * PNG5 MCP Tool — list_project_files
 * 
 * Lists files and directories within the registered project workspace.
 * Read-only operation — allowed by default policy.
 * 
 * Security:
 * - Only lists within workspace boundary
 * - Filters out hidden dirs, node_modules, .git
 * - Passes through centralized policy evaluator
 * - Rejects secret file patterns from listing
 */

import { z } from "zod";
import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, log } from "../config.js";
import { validateWorkspacePath, isHiddenOrIgnored } from "../security/workspace.js";
import { evaluatePolicy } from "../policy/evaluator.js";
import { recordAuditEvent } from "../audit/logger.js";

export function registerListFilesTool(server: McpServer): void {
  server.tool(
    "list_project_files",
    "List files and directories within the registered project workspace. Returns file names, types, and sizes. Filters out hidden directories, node_modules, and build artifacts.",
    {
      path: z
        .string()
        .default(".")
        .describe("Relative path within the project workspace to list (default: root)"),
      recursive: z
        .boolean()
        .default(false)
        .describe("If true, list files recursively (max depth 3)"),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3)
        .describe("Maximum recursion depth (1-5, default 3)"),
    },
    async ({ path, recursive, max_depth }) => {
      const resource = `file:${config.projectRoot}/${path}`;

      // --- Policy evaluation ---
      const decision = await evaluatePolicy({
        userId: config.userId,
        agentSessionId: config.agentSessionId,
        projectId: config.projectId,
        tool: "list_project_files",
        resource,
      });

      if (decision.action === "deny") {
        await recordAuditEvent("list_project_files", resource, decision);
        return {
          content: [{ type: "text" as const, text: `DENIED: ${decision.reason}` }],
          isError: true,
        };
      }

      if (decision.action === "approval_required") {
        await recordAuditEvent("list_project_files", resource, decision);
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
        const entries = listDirectory(validatedPath, recursive, max_depth, 0);

        await recordAuditEvent("list_project_files", resource, decision, {
          success: true,
        });

        const header = `Project files in: ${relative(config.projectRoot, validatedPath) || "."}\n${"─".repeat(50)}\n`;
        const listing = entries.map((e) => {
          const icon = e.isDir ? "📁" : "📄";
          const size = e.isDir ? "" : ` (${formatSize(e.size)})`;
          return `${icon} ${e.relativePath}${size}`;
        }).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `${header}${listing}\n\nTotal: ${entries.length} items`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("error", "list_project_files failed", { error: message, path });

        await recordAuditEvent("list_project_files", resource, decision, {
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

interface FileEntry {
  relativePath: string;
  isDir: boolean;
  size: number;
}

function listDirectory(
  dirPath: string,
  recursive: boolean,
  maxDepth: number,
  currentDepth: number
): FileEntry[] {
  const entries: FileEntry[] = [];

  let items: string[];
  try {
    items = readdirSync(dirPath);
  } catch {
    return entries;
  }

  for (const name of items) {
    if (isHiddenOrIgnored(name)) continue;

    const fullPath = join(dirPath, name);
    try {
      const stat = statSync(fullPath);
      const relPath = relative(config.projectRoot, fullPath);

      entries.push({
        relativePath: relPath,
        isDir: stat.isDirectory(),
        size: stat.size,
      });

      if (recursive && stat.isDirectory() && currentDepth < maxDepth) {
        entries.push(...listDirectory(fullPath, recursive, maxDepth, currentDepth + 1));
      }
    } catch {
      // Skip unreadable entries
    }
  }

  return entries;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
