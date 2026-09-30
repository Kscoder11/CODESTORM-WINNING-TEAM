/**
 * PNG5 MCP Web Server & Backend Chat API
 * 
 * Production web server hosting:
 * - REST Chat API (POST /api/chat)
 * - Approval Management API (GET/POST /api/approvals)
 * - Tool Discovery API (GET /api/tools)
 * - Audit Trail API (GET /api/audit)
 * - Health Check API (GET /api/health)
 * - Static Frontend Website (/ and /static/*)
 * 
 * Runs on Port 3000 (configurable via PORT env var).
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { resolve, extname, join } from "path";
import { readFileSync, existsSync, statSync } from "fs";
import { config, log } from "./config.js";
import { getAgentOrchestrator } from "./agent/orchestrator.js";
import { getApprovalManager } from "./approvals/approval-manager.js";
import { getMCPClient } from "./client/mcp-client.js";
import { getAuditLog } from "./audit/logger.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const FRONTEND_DIR = resolve(config.projectRoot, "frontend");

// MIME types for static assets
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * Parse JSON request body helper.
 */
function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response helper.
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Handle incoming HTTP requests.
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase() || "GET";

  // Handle CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  try {
    // ============================================================
    // API Routes (/api/*)
    // ============================================================

    // 1. POST /api/chat — Chat prompt processing pipeline
    if (method === "POST" && pathname === "/api/chat") {
      const body = await parseJsonBody(req);
      const prompt = String(body.prompt || "");
      const approvalId = body.approvalId ? String(body.approvalId) : null;
      const userId = (req.headers["x-user-id"] as string) || (body.userId as string) || "web-user";
      const sessionToken = (req.headers.authorization?.replace("Bearer ", "")) || (body.sessionToken as string) || undefined;

      const orchestrator = getAgentOrchestrator();
      const result = await orchestrator.run(prompt, {
        userId,
        approvalId,
        agentSessionToken: sessionToken,
      });

      sendJson(res, 200, result);
      return;
    }

    // 2. GET /api/tools — Discovered MCP Tools
    if (method === "GET" && pathname === "/api/tools") {
      const client = getMCPClient();
      if (!client.connected) {
        await client.connect();
      }
      const tools = client.getTools();
      sendJson(res, 200, { tools });
      return;
    }

    // 3. GET /api/approvals — List pending/all approvals
    if (method === "GET" && pathname === "/api/approvals") {
      const manager = getApprovalManager();
      const all = url.searchParams.get("all") === "true";
      const approvals = all ? manager.listAll() : manager.listPending();
      sendJson(res, 200, { approvals });
      return;
    }

    // 4. POST /api/approvals/:id/decide — Human operator approval action
    const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/decide$/);
    if (method === "POST" && approvalMatch) {
      const approvalId = approvalMatch[1];
      const body = await parseJsonBody(req);
      const decision = body.decision === "approved" ? "approved" : "rejected";
      const reviewer = String(body.reviewer || "security-admin");

      const manager = getApprovalManager();
      const updated = manager.decide(approvalId, decision, reviewer);
      sendJson(res, 200, { success: true, approval: updated });
      return;
    }

    // 5. GET /api/audit — Audit event log
    if (method === "GET" && pathname === "/api/audit") {
      const logs = getAuditLog();
      sendJson(res, 200, { auditLogs: logs, total: logs.length });
      return;
    }

    // 6. GET /api/health — System & MCP health check
    if (method === "GET" && pathname === "/api/health") {
      const client = getMCPClient();
      const mcpConnected = client.connected;
      sendJson(res, 200, {
        status: "healthy",
        server: "png5-web-orchestrator",
        version: "1.0.0",
        mcpConnected,
        governorUrl: config.governorUrl,
        projectRoot: config.projectRoot,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ============================================================
    // Static Frontend Serving
    // ============================================================
    if (method === "GET") {
      let filePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
      let resolvedPath = resolve(FRONTEND_DIR, filePath);

      // Prevent directory traversal on static files
      if (!resolvedPath.startsWith(FRONTEND_DIR)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }

      if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
        const ext = extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const content = readFileSync(resolvedPath);

        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
        return;
      }

      // Fallback to index.html for SPA routing
      const indexPath = resolve(FRONTEND_DIR, "index.html");
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
        return;
      }
    }

    // 404 Not Found
    sendJson(res, 404, { error: "not_found", message: `Route ${pathname} not found` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "HTTP Handler Error", { error: message, path: pathname });
    sendJson(res, 500, { error: "internal_error", message });
  }
}

/**
 * Start the web server.
 */
export async function startWebServer(): Promise<void> {
  const server = createServer(handleRequest);

  // Initialize MCP client connection on server start
  try {
    const mcpClient = getMCPClient();
    log("info", "Connecting MCP client on startup...");
    await mcpClient.connect();
    log("info", "MCP Client connected and ready for requests");
  } catch (err) {
    log("warn", "MCP Client initial connection deferred", { error: String(err) });
  }

  server.listen(PORT, "0.0.0.0", () => {
    log("info", `🚀 PNG5 Website & API Server running on http://localhost:${PORT}`);
    process.stdout.write(`\n🚀 PNG5 Website & API Server active at: http://localhost:${PORT}\n\n`);
  });
}

// Start if executed directly
if (process.argv[1] && (process.argv[1].endsWith("web-server.ts") || process.argv[1].endsWith("web-server.js"))) {
  startWebServer().catch((err) => {
    log("error", "Failed to start Web Server", { error: String(err) });
    process.exit(1);
  });
}
