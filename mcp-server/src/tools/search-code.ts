/**
 * PNG5 MCP Tool — search_project_code
 * 
 * Searches source files in the project workspace using pattern matching.
 * Read-only operation — allowed by default policy.
 * 
 * Security:
 * - Only searches within workspace boundary
 * - Filters out binary files, node_modules, .git
 * - Rejects searches that target secret files
 * - Limits result count to prevent resource exhaustion
 */

import { z } from "zod";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, extname } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, log } from "../config.js";
import { validateWorkspacePath, isHiddenOrIgnored } from "../security/workspace.js";
import { evaluatePolicy } from "../policy/evaluator.js";
import { recordAuditEvent } from "../audit/logger.js";

/** File extensions considered searchable source code */
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".swift",
  ".kt", ".scala", ".sql", ".sh", ".bash", ".zsh",
  ".json", ".yaml", ".yml", ".toml", ".xml", ".html", ".css",
  ".md", ".txt", ".cfg", ".ini", ".conf",
]);

const MAX_RESULTS = 50;
const MAX_FILE_SIZE = 512 * 1024; // 512 KB per file for search

export function registerSearchCodeTool(server: McpServer): void {
  server.tool(
    "search_project_code",
    "Search for a text pattern across source files in the project workspace. Returns matching lines with file paths and line numbers. Supports case-insensitive and regex search.",
    {
      pattern: z.string().min(1).describe("Search pattern (text or regex)"),
      path: z
        .string()
        .default(".")
        .describe("Relative path within workspace to search (default: root)"),
      case_sensitive: z
        .boolean()
        .default(false)
        .describe("Whether the search is case-sensitive (default: false)"),
      file_pattern: z
        .string()
        .optional()
        .describe("Optional file extension filter, e.g., '.py' or '.ts'"),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Maximum number of results to return (default: 50)"),
    },
    async ({ pattern, path, case_sensitive, file_pattern, max_results }) => {
      const resource = `file:${config.projectRoot}/${path}`;
      const effectiveMax = Math.min(max_results, MAX_RESULTS);

      // --- Policy evaluation ---
      const decision = await evaluatePolicy({
        userId: config.userId,
        agentSessionId: config.agentSessionId,
        projectId: config.projectId,
        tool: "search_project_code",
        resource,
        params: { pattern },
      });

      if (decision.action === "deny") {
        await recordAuditEvent("search_project_code", resource, decision);
        return {
          content: [{ type: "text" as const, text: `DENIED: ${decision.reason}` }],
          isError: true,
        };
      }

      // --- Execute ---
      try {
        const validatedPath = validateWorkspacePath(path);

        let regex: RegExp;
        try {
          regex = new RegExp(pattern, case_sensitive ? "g" : "gi");
        } catch {
          // If invalid regex, treat as literal string
          const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          regex = new RegExp(escaped, case_sensitive ? "g" : "gi");
        }

        const results: SearchResult[] = [];
        searchFiles(validatedPath, regex, file_pattern, results, effectiveMax, 0, 4);

        await recordAuditEvent("search_project_code", resource, decision, {
          success: true,
        });

        if (results.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No matches found for pattern: ${pattern}`,
            }],
          };
        }

        const header = `Search results for: "${pattern}"\n${"─".repeat(50)}\n`;
        const body = results.map((r) =>
          `${r.file}:${r.line} │ ${r.content.trim()}`
        ).join("\n");

        const footer = results.length >= effectiveMax
          ? `\n\n... results capped at ${effectiveMax} matches`
          : `\n\nTotal: ${results.length} matches`;

        return {
          content: [{
            type: "text" as const,
            text: `${header}${body}${footer}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("error", "search_project_code failed", { error: message, pattern });

        await recordAuditEvent("search_project_code", resource, decision, {
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

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

function searchFiles(
  dirPath: string,
  regex: RegExp,
  fileFilter: string | undefined,
  results: SearchResult[],
  maxResults: number,
  depth: number,
  maxDepth: number
): void {
  if (results.length >= maxResults || depth > maxDepth) return;

  let items: string[];
  try {
    items = readdirSync(dirPath);
  } catch {
    return;
  }

  for (const name of items) {
    if (results.length >= maxResults) return;
    if (isHiddenOrIgnored(name)) continue;

    const fullPath = join(dirPath, name);
    try {
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        searchFiles(fullPath, regex, fileFilter, results, maxResults, depth + 1, maxDepth);
      } else if (stat.isFile() && stat.size <= MAX_FILE_SIZE) {
        const ext = extname(name).toLowerCase();

        // Apply file extension filter
        if (fileFilter && ext !== fileFilter.toLowerCase()) continue;

        // Only search known source files
        if (!SOURCE_EXTENSIONS.has(ext)) continue;

        searchInFile(fullPath, regex, results, maxResults);
      }
    } catch {
      // Skip unreadable entries
    }
  }
}

function searchInFile(
  filePath: string,
  regex: RegExp,
  results: SearchResult[],
  maxResults: number
): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = relative(config.projectRoot, filePath);

    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
      // Reset regex lastIndex for each line
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        results.push({
          file: relPath,
          line: i + 1,
          content: lines[i].substring(0, 200), // Truncate long lines
        });
      }
    }
  } catch {
    // Skip unreadable files
  }
}
