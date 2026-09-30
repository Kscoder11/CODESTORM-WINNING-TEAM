/**
 * Diagnostic & Integration Test: MCP Client <-> MCP Server Connection
 * 
 * Verifies:
 * - Server process startup & client connection
 * - Tool discovery (all 7 tools registered)
 * - Safe tool invocation ('hello', 'list_project_files')
 * - Argument validation and error handling
 * - Graceful shutdown
 */

import { PNG5MCPClient } from "./mcp-client.js";

async function runDiagnostic(): Promise<void> {
  process.stdout.write("🧪 MCP Client <-> Server Diagnostic Test\n");
  process.stdout.write("═".repeat(60) + "\n");

  const client = new PNG5MCPClient();
  let passed = 0;
  let failed = 0;

  function check(name: string, condition: boolean, extra?: string): void {
    if (condition) {
      passed++;
      process.stdout.write(`  ✅ PASS: ${name}${extra ? ` (${extra})` : ""}\n`);
    } else {
      failed++;
      process.stdout.write(`  ❌ FAIL: ${name}${extra ? ` (${extra})` : ""}\n`);
    }
  }

  try {
    // 1. Connect
    process.stdout.write("\n[1/5] Connecting to MCP Server process...\n");
    await client.connect();
    check("MCP Client connected successfully", client.connected);

    // 2. Ping
    const pingOk = await client.ping();
    check("Server responds to ping", pingOk);

    // 3. Tool Discovery
    process.stdout.write("\n[2/5] Discovering tools via tools/list...\n");
    const tools = await client.refreshTools();
    const toolNames = tools.map((t) => t.name);
    
    check("Discovered at least 7 tools", tools.length >= 7, `${tools.length} tools`);
    check("Discovered 'hello' tool", toolNames.includes("hello"));
    check("Discovered 'list_project_files' tool", toolNames.includes("list_project_files"));
    check("Discovered 'read_project_file' tool", toolNames.includes("read_project_file"));
    check("Discovered 'search_project_code' tool", toolNames.includes("search_project_code"));
    check("Discovered 'edit_project_file' tool", toolNames.includes("edit_project_file"));
    check("Discovered 'create_project_file' tool", toolNames.includes("create_project_file"));
    check("Discovered 'run_project_command' tool", toolNames.includes("run_project_command"));

    // 4. Test Tool Invocations
    process.stdout.write("\n[3/5] Testing tool invocations...\n");
    
    // Invocate hello tool
    const helloRes = await client.callTool("hello", { name: "IntegrationTester" });
    const helloText = helloRes.content[0]?.text || "";
    check("Executed 'hello' tool", !helloRes.isError && helloText.includes("PNG5 MCP Policy Gateway"));

    // Invocate list_project_files tool
    const listRes = await client.callTool("list_project_files", { directory: "." });
    const listText = listRes.content[0]?.text || "";
    check("Executed 'list_project_files' tool", !listRes.isError && listText.includes("package.json"));

    // 5. Test Error Handling & Safety
    process.stdout.write("\n[4/5] Testing error handling and security blocks...\n");

    // Blocked secret file read
    const secretRes = await client.callTool("read_project_file", { path: ".env" });
    const isBlocked = Boolean(secretRes.isError || secretRes.content[0]?.text?.includes("DENIED") || secretRes.content[0]?.text?.includes("secret"));
    check("Secret file read is rejected/handled safely", isBlocked);

    // Unknown tool call
    let unknownToolRejected = false;
    try {
      await client.callTool("non_existent_tool", {});
    } catch {
      unknownToolRejected = true;
    }
    check("Unknown tool call rejected", unknownToolRejected);

    // 6. Graceful Disconnect
    process.stdout.write("\n[5/5] Testing graceful shutdown...\n");
    await client.disconnect();
    check("MCP Client disconnected cleanly", !client.connected);

  } catch (err) {
    failed++;
    process.stdout.write(`\n💥 Fatal Error during diagnostic: ${err instanceof Error ? err.message : String(err)}\n`);
  } finally {
    await client.disconnect();
  }

  process.stdout.write("\n" + "═".repeat(60) + "\n");
  process.stdout.write(`Diagnostic Summary: ${passed} passed, ${failed} failed\n`);
  process.stdout.write("═".repeat(60) + "\n\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runDiagnostic().catch((e) => {
  console.error("Diagnostic failed:", e);
  process.exit(1);
});
