/**
 * PNG5 MCP Server — Main Entry Point
 * 
 * Custom MCP server for the PNG5 Agent Permission Governor.
 * Exposes controlled tools that enforce runtime policy decisions
 * for AI agent actions through the Governor's authorization pipeline.
 * 
 * Transport: stdio (launched by OpenCode as a local process)
 * 
 * Security principle: the model can request actions, but only
 * trusted server-side code can authorize and execute them.
 * 
 * All diagnostic output goes to stderr (stdout is the MCP protocol channel).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config, log } from "./config.js";

// Tool registrations
import { registerHelloTool } from "./tools/hello.js";
import { registerListFilesTool } from "./tools/list-files.js";
import { registerReadFileTool } from "./tools/read-file.js";
import { registerSearchCodeTool } from "./tools/search-code.js";
import { registerEditFileTool } from "./tools/edit-file.js";
import { registerCreateFileTool } from "./tools/create-file.js";
import { registerRunCommandTool } from "./tools/run-command.js";

async function main(): Promise<void> {
  log("info", "PNG5 MCP Server starting", {
    version: "1.0.0",
    projectRoot: config.projectRoot,
    governorUrl: config.governorUrl,
    hasSessionToken: !!config.agentSessionToken,
  });

  // --- Create MCP Server ---
  const server = new McpServer({
    name: "png5-policy-gateway",
    version: "1.0.0",
  });

  // --- Register Tools ---
  // Stage 1: Connectivity
  registerHelloTool(server);

  // Stage 2: Read-only tools (allowed by default policy)
  registerListFilesTool(server);
  registerReadFileTool(server);
  registerSearchCodeTool(server);

  // Stage 3: Write tools (approval-gated)
  registerEditFileTool(server);
  registerCreateFileTool(server);

  // Stage 4: Command execution (strict allowlist + approval)
  registerRunCommandTool(server);

  log("info", "All tools registered", {
    tools: [
      "hello",
      "list_project_files",
      "read_project_file",
      "search_project_code",
      "edit_project_file",
      "create_project_file",
      "run_project_command",
    ],
  });

  // --- Connect via stdio transport ---
  const transport = new StdioServerTransport();

  log("info", "Connecting via stdio transport...");
  await server.connect(transport);
  log("info", "PNG5 MCP Server connected and ready");
}

// --- Start ---
main().catch((err) => {
  log("error", "Fatal error during MCP server startup", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
