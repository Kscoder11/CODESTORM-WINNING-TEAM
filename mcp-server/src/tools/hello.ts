/**
 * PNG5 MCP Tool — hello
 * 
 * Simple connectivity check to verify the MCP server is reachable.
 * No filesystem access. No policy evaluation needed (safe operation).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "../config.js";
import { recordAuditEvent } from "../audit/logger.js";

export function registerHelloTool(server: McpServer): void {
  server.tool(
    "hello",
    "Check that the PNG5 MCP server is reachable and connected. Use this to verify connectivity before performing other operations.",
    {
      name: z.string().describe("Name to greet"),
    },
    async ({ name }) => {
      log("info", "hello tool invoked", { name });

      await recordAuditEvent("hello", "connectivity-check", {
        action: "allow",
        reason: "Connectivity check — always permitted",
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Hello, ${name}! PNG5 MCP Policy Gateway is connected and operational.\n\nAvailable tools:\n- list_project_files: List files in the registered workspace\n- read_project_file: Read an authorized file\n- search_project_code: Search source files\n- edit_project_file: Modify a file (requires approval)\n- create_project_file: Create a file (requires approval)\n- run_project_command: Run an approved command (restricted)`,
          },
        ],
      };
    }
  );
}
