/**
 * PNG5 MCP Web Server & Backend Chat API
 * 
 * Production web server hosting:
 * - REST Chat API (POST /api/chat, workspace-scoped)
 * - Workspace Registry API (GET /api/workspaces, POST /api/workspaces/:id/activate)
 * - File Explorer API (GET /api/files, GET /api/file)
 * - Agent Event Stream (GET /api/events — Server-Sent Events)
 * - Approval Management API (GET/POST /api/approvals, POST /api/approvals/redeem)
 * - Tool Discovery API (GET /api/tools)
 * - Audit Trail API (GET /api/audit)
 * - Health Check API (GET /api/health)
 * - Static Frontend Website (/ and /workspace)
 * 
 * Runs on Port 3000 (configurable via PORT env var).
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { resolve, extname, dirname, sep } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { randomUUID } from "crypto";
import { config, log } from "./config.js";
import { getAgentOrchestrator } from "./agent/orchestrator.js";
import { getApprovalManager } from "./approvals/approval-manager.js";
import { getMCPClient } from "./client/mcp-client.js";
import { getAuditLog } from "./audit/logger.js";
import { agentEvents, AgentEvent } from "./events.js";
import {
  listWorkspaces,
  getWorkspaceById,
  getActiveWorkspace,
  activateWorkspace,
} from "./workspaces.js";
import {
  validateWorkspacePath,
  validateFileSize,
  isHiddenOrIgnored,
  WorkspaceSecurityError,
} from "./security/workspace.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

// Resolve the frontend directory from the module location first (works with
// both `tsx src/web-server.ts` and `node dist/web-server.js`), then fall back
// to the configured project root candidates (case variants for Windows/Linux).
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_CANDIDATES = [
  resolve(MODULE_DIR, "..", "..", "..", "Frontend"),
  resolve(config.projectRoot, "Frontend"),
  resolve(config.projectRoot, "frontend"),
  resolve(config.projectRoot, "..", "Frontend"),
];
const FRONTEND_DIR =
  FRONTEND_CANDIDATES.find((p) => existsSync(p) && statSync(p).isDirectory()) || FRONTEND_CANDIDATES[1];

// CORS headers shared by JSON responses, preflight, and SSE streams.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id, X-Approval-Token, Last-Event-ID",
};

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
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Root of the currently active workspace (server-side registered). */
function activeRoot(): string {
  return getActiveWorkspace()?.root || config.projectRoot;
}

/**
 * Recompute the approval target the same way the orchestrator does,
 * so redemption can verify parameter binding (file path, or full command line).
 */
function computeResource(tool: string, params: Record<string, unknown>): string {
  if (tool === "run_project_command") {
    const args = Array.isArray(params.args) ? (params.args as string[]).join(" ") : "";
    return `exec:${String(params.command || "")} ${args}`.trim();
  }
  return String(params.path || params.directory || params.command || tool);
}

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
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data, null, 2));
}

/** Send a JSON error for a WorkspaceSecurityError / generic failure. */
function sendPathError(res: ServerResponse, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof WorkspaceSecurityError ? 403 : 400;
  sendJson(res, status, { error: "path_rejected", message });
}

interface DirEntry {
  relativePath: string;
  isDir: boolean;
  size: number;
}

/** List files under `absDir`, contained by `root`, skipping hidden/ignored names. */
function listDir(absDir: string, root: string, recursive: boolean, maxDepth: number, depth: number): DirEntry[] {
  const entries: DirEntry[] = [];
  let items: string[];
  try {
    items = readdirSync(absDir);
  } catch {
    return entries;
  }

  for (const name of items) {
    if (isHiddenOrIgnored(name)) continue;
    const fullPath = resolve(absDir, name);
    try {
      const stat = statSync(fullPath);
      const relPath = fullPath.slice(root.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
      entries.push({ relativePath: relPath, isDir: stat.isDirectory(), size: stat.isDirectory() ? 0 : stat.size });
      if (recursive && stat.isDirectory() && depth < maxDepth) {
        entries.push(...listDir(fullPath, root, recursive, maxDepth, depth + 1));
      }
    } catch {
      // Skip unreadable entries
    }
  }
  return entries;
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
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    // ============================================================
    // API Routes (/api/*)
    // ============================================================

    // 1. POST /api/chat — Chat prompt processing pipeline (workspace-scoped)
    if (method === "POST" && pathname === "/api/chat") {
      const body = await parseJsonBody(req);
      const prompt = String(body.prompt || "");
      const approvalId = body.approvalId ? String(body.approvalId) : null;
      const userId = (req.headers["x-user-id"] as string) || (body.userId as string) || "web-user";
      const sessionToken = (req.headers.authorization?.replace("Bearer ", "")) || (body.sessionToken as string) || undefined;
      const workspaceId = body.workspaceId ? String(body.workspaceId) : null;

      // Validate and activate the requested workspace (server-side registry only —
      // clients can never inject an arbitrary filesystem path).
      let ws = getActiveWorkspace();
      if (workspaceId) {
        const requested = getWorkspaceById(workspaceId);
        if (!requested) {
          sendJson(res, 400, {
            error: "unknown_workspace",
            message: `Workspace '${workspaceId}' is not registered on this server.`,
          });
          return;
        }
        if (ws?.id !== requested.id) {
          activateWorkspace(requested.id);
          await getMCPClient().setWorkspaceRoot(requested.root);
          agentEvents.emit("workspace_activated", {
            workspaceId: requested.id,
            name: requested.name,
            root: requested.root,
          });
        }
        ws = requested;
      }

      const orchestrator = getAgentOrchestrator();
      const result = await orchestrator.run(prompt, {
        userId,
        approvalId,
        agentSessionToken: sessionToken,
        workspaceId: ws?.id,
        workspaceRoot: ws?.root,
      });

      sendJson(res, 200, result);
      return;
    }

    // 1b. GET /api/workspaces — List server-registered workspaces
    if (method === "GET" && pathname === "/api/workspaces") {
      sendJson(res, 200, {
        workspaces: listWorkspaces(),
        active: getActiveWorkspace() || null,
      });
      return;
    }

    // 1c. POST /api/workspaces/:id/activate — Switch active workspace
    const wsActivateMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/activate$/);
    if (method === "POST" && wsActivateMatch) {
      const target = activateWorkspace(wsActivateMatch[1]);
      if (!target) {
        sendJson(res, 404, {
          error: "workspace_not_found",
          message: `Workspace '${wsActivateMatch[1]}' is not registered on this server.`,
        });
        return;
      }
      await getMCPClient().setWorkspaceRoot(target.root);
      agentEvents.emit("workspace_activated", {
        workspaceId: target.id,
        name: target.name,
        root: target.root,
      });
      sendJson(res, 200, { success: true, workspace: target });
      return;
    }

    // 1d. GET /api/files?path=&recursive=&depth= — File tree for the explorer
    if (method === "GET" && pathname === "/api/files") {
      const root = activeRoot();
      const rel = url.searchParams.get("path") || ".";
      const depth = Math.min(Math.max(parseInt(url.searchParams.get("depth") || "4", 10) || 4, 1), 8);
      const recursive = url.searchParams.get("recursive") !== "false";
      try {
        const absDir = validateWorkspacePath(rel, false, root);
        if (!existsSync(absDir) || !statSync(absDir).isDirectory()) {
          sendJson(res, 404, { error: "not_a_directory", message: `'${rel}' is not a directory` });
          return;
        }
        const entries = listDir(absDir, resolve(root), recursive, depth, 0);
        entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        sendJson(res, 200, { root, path: rel, entries, total: entries.length });
        return;
      } catch (err) {
        sendPathError(res, err);
        return;
      }
    }

    // 1e. GET /api/file?path= — Single file content for the preview modal
    if (method === "GET" && pathname === "/api/file") {
      const root = activeRoot();
      const rel = url.searchParams.get("path") || "";
      if (!rel) {
        sendJson(res, 400, { error: "missing_path", message: "Query parameter 'path' is required." });
        return;
      }
      try {
        const abs = validateWorkspacePath(rel, false, root);
        if (!existsSync(abs) || !statSync(abs).isFile()) {
          sendJson(res, 404, { error: "not_found", message: `File not found: ${rel}` });
          return;
        }
        validateFileSize(abs, config.maxFileReadSize);
        const content = readFileSync(abs, "utf-8");
        sendJson(res, 200, {
          path: rel,
          size: statSync(abs).size,
          modifiedAt: statSync(abs).mtime.toISOString(),
          content,
        });
        return;
      } catch (err) {
        sendPathError(res, err);
        return;
      }
    }

    // 1f. GET /api/events — Real agent execution events (SSE)
    if (method === "GET" && pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...CORS_HEADERS,
      });

      const lastEventId =
        parseInt((req.headers["last-event-id"] as string) || url.searchParams.get("lastEventId") || "0", 10) || 0;

      const writeEvent = (event: AgentEvent): void => {
        res.write(`id: ${event.id}\nevent: agent\ndata: ${JSON.stringify(event)}\n\n`);
      };

      // Replay anything missed since the client's last event id, then stream live.
      for (const event of agentEvents.since(lastEventId)) {
        writeEvent(event);
      }
      const unsubscribe = agentEvents.subscribe(writeEvent);
      const heartbeat = setInterval(() => {
        res.write(`: ping ${Date.now()}\n\n`);
      }, 15000);

      log("info", "SSE client connected", { lastEventId });
      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        log("info", "SSE client disconnected");
      });
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
      try {
        const updated = manager.decide(approvalId, decision, reviewer);
        agentEvents.emit("approval_decided", {
          approvalId,
          decision,
          reviewer,
          tool: updated.tool,
          target: updated.target,
        });
        sendJson(res, 200, { success: true, approval: updated });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 400, { success: false, error: "decision_failed", message });
      }
      return;
    }

    // 4b. POST /api/approvals/redeem — One-time execution ticket redemption
    // Called by the MCP tool process (approval bridge) after a human approved.
    if (method === "POST" && pathname === "/api/approvals/redeem") {
      const presented = req.headers["x-approval-token"];
      const expected = process.env.APPROVAL_API_TOKEN;
      if (!expected || presented !== expected) {
        sendJson(res, 401, { ok: false, reason: "Invalid approval bridge token" });
        return;
      }

      const body = await parseJsonBody(req);
      const approvalId = String(body.approvalId || "");
      const tool = String(body.tool || "");
      const params = (body.params && typeof body.params === "object" ? body.params : {}) as Record<string, unknown>;

      const manager = getApprovalManager();
      const approval = manager.get(approvalId);
      if (!approval) {
        sendJson(res, 404, { ok: false, reason: `Approval '${approvalId}' not found` });
        return;
      }
      if (approval.status !== "approved") {
        sendJson(res, 409, { ok: false, reason: `Approval status is '${approval.status}', expected 'approved'` });
        return;
      }
      if (approval.tool !== tool) {
        sendJson(res, 403, {
          ok: false,
          reason: `Tool mismatch — approved for '${approval.tool}', requested '${tool}'`,
        });
        return;
      }
      const resource = computeResource(tool, params);
      if (approval.target !== resource) {
        sendJson(res, 403, {
          ok: false,
          reason: `Target mismatch — approved for '${approval.target}', requested '${resource}'`,
        });
        return;
      }

      // One-time consumption: a ticket can never be replayed.
      if (!manager.consume(approvalId)) {
        sendJson(res, 409, { ok: false, reason: `Approval '${approvalId}' already consumed or not redeemable` });
        return;
      }

      agentEvents.emit("approval_redeemed", { approvalId, tool, target: resource });
      log("info", "Approval redeemed through bridge", { approvalId, tool, resource });
      sendJson(res, 200, { ok: true, approvalId, tool, target: resource });
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
        activeWorkspace: getActiveWorkspace() || null,
        workspaces: listWorkspaces().length,
        approvalBridge: Boolean(process.env.APPROVAL_API_URL && process.env.APPROVAL_API_TOKEN),
        frontendDir: FRONTEND_DIR,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ============================================================
    // Static Frontend Serving
    // ============================================================
    if (method === "GET") {
      let filePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");

      // Pretty route for the workspace shell
      if (filePath === "workspace") filePath = "workspace.html";

      const resolvedPath = resolve(FRONTEND_DIR, filePath);

      // Prevent directory traversal on static files
      if (resolvedPath !== FRONTEND_DIR && !resolvedPath.startsWith(FRONTEND_DIR + sep)) {
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
  // Bootstrap the approval bridge: the MCP tool child process redeems
  // human-approved tickets through this server via X-Approval-Token.
  process.env.APPROVAL_API_URL = process.env.APPROVAL_API_URL || `http://127.0.0.1:${PORT}`;
  process.env.APPROVAL_API_TOKEN = process.env.APPROVAL_API_TOKEN || randomUUID();

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
