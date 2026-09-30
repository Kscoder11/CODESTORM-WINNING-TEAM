/**
 * PNG5 MCP Client — TypeScript MCP Client Lifecycle & Tool Bridge
 * 
 * Connects to the local PNG5 MCP server over StdioClientTransport,
 * discovers registered tools, validates arguments, invokes tools safely,
 * handles reconnection, and manages the client lifecycle.
 * 
 * Uses official @modelcontextprotocol/sdk.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { config, log } from "../config.js";

/** Directory of the MCP server package itself (independent of workspace root). */
const MCP_SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolCallResult {
  tool: string;
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
  raw?: unknown;
}

export interface MCPClientOptions {
  serverCommand?: string;
  serverArgs?: string[];
  projectRoot?: string;
  governorUrl?: string;
  agentSessionToken?: string;
  timeoutMs?: number;
}

export class PNG5MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private toolsCache: Map<string, MCPToolInfo> = new Map();
  private isConnecting = false;
  private isConnected = false;
  private readonly options: Required<MCPClientOptions>;

  constructor(opts: MCPClientOptions = {}) {
    const serverScriptCandidates = [
      resolve(MCP_SERVER_DIR, "dist", "server.js"),
      resolve(config.projectRoot, "mcp-server", "dist", "server.js"),
      resolve(process.cwd(), "dist", "server.js"),
      resolve(process.cwd(), "mcp-server", "dist", "server.js"),
    ];
    const serverScript = serverScriptCandidates.find((p) => existsSync(p));

    this.options = {
      serverCommand: opts.serverCommand || process.execPath,
      serverArgs: opts.serverArgs || (serverScript ? [serverScript] : [resolve(MCP_SERVER_DIR, "dist", "server.js")]),
      projectRoot: opts.projectRoot || config.projectRoot,
      governorUrl: opts.governorUrl || config.governorUrl,
      agentSessionToken: opts.agentSessionToken || config.agentSessionToken,
      timeoutMs: opts.timeoutMs || 15000,
    };
  }

  /**
   * Point the client at a different registered workspace root.
   * The MCP server child process is respawned on the next connect() with
   * the new PROJECT_ROOT, so all tools validate against that workspace.
   */
  public async setWorkspaceRoot(root: string): Promise<void> {
    if (this.options.projectRoot === root) return;
    await this.disconnect();
    this.options.projectRoot = root;
    log("info", "MCP client workspace root changed", { root });
  }

  /**
   * Connect to the MCP Server process via stdio transport.
   * Prevents duplicate connections and manages capabilities.
   */
  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    if (this.isConnecting) {
      // Wait for ongoing connection attempt
      while (this.isConnecting) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (this.isConnected) return;
    }

    this.isConnecting = true;
    log("info", "MCP Client connecting to server process...", {
      command: this.options.serverCommand,
      args: this.options.serverArgs,
      workspaceRoot: this.options.projectRoot,
    });

    try {
      // Ensure any previous transport is cleaned up
      await this.disconnect();

      const distCandidates = [
        this.options.serverArgs?.[0],
        resolve(MCP_SERVER_DIR, "dist", "server.js"),
        resolve(this.options.projectRoot, "mcp-server", "dist", "server.js"),
      ].filter((p): p is string => Boolean(p));

      const distFile = distCandidates.find((p) => existsSync(p));
      if (!distFile) {
        throw new Error(
          `MCP server bundle not found (looked in: ${distCandidates.join(", ")}). Run 'npm run build' inside the mcp-server directory.`
        );
      }

      // Environment handed to the MCP server child process.
      // APPROVAL_API_* enables one-time human-approval redemption when the
      // website bridge is running; both values are absent for standalone use.
      const childEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        PROJECT_ROOT: this.options.projectRoot,
        GOVERNOR_URL: this.options.governorUrl,
        AGENT_SESSION_TOKEN: this.options.agentSessionToken,
        NODE_ENV: process.env.NODE_ENV || "production",
      };
      if (process.env.APPROVAL_API_URL) childEnv.APPROVAL_API_URL = process.env.APPROVAL_API_URL;
      if (process.env.APPROVAL_API_TOKEN) childEnv.APPROVAL_API_TOKEN = process.env.APPROVAL_API_TOKEN;

      this.transport = new StdioClientTransport({
        command: this.options.serverCommand || "node",
        args: [distFile],
        cwd: MCP_SERVER_DIR,
        env: childEnv,
        stderr: "pipe",
      });

      // Capture diagnostic logs from server stderr
      if (this.transport.stderr) {
        this.transport.stderr.on("data", (chunk: Buffer) => {
          const str = chunk.toString().trim();
          if (str) {
            log("info", `[MCP Server Log] ${str}`);
          }
        });
      }

      this.client = new Client(
        {
          name: "png5-web-orchestrator",
          version: "1.0.0",
        },
        {
          capabilities: {
            roots: { listChanged: true },
            sampling: {},
          },
        }
      );

      await this.client.connect(this.transport);
      this.isConnected = true;
      log("info", "MCP Client successfully connected and handshake completed");

      // Discover and cache tools
      await this.refreshTools();
    } catch (err) {
      this.isConnected = false;
      const message = err instanceof Error ? err.message : String(err);
      log("error", "Failed to connect to MCP Server", { error: message });
      throw new Error(`MCP Server Connection Error: ${message}`);
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Discover available tools from the MCP Server.
   */
  public async refreshTools(): Promise<MCPToolInfo[]> {
    this.ensureConnected();

    try {
      const response = await this.client!.listTools();
      this.toolsCache.clear();

      for (const tool of response.tools) {
        this.toolsCache.set(tool.name, {
          name: tool.name,
          description: tool.description,
          inputSchema: (tool.inputSchema as Record<string, unknown>) || {},
        });
      }

      log("info", `MCP Client discovered ${this.toolsCache.size} tools`, {
        tools: Array.from(this.toolsCache.keys()),
      });

      return Array.from(this.toolsCache.values());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("error", "Failed to list MCP tools", { error: message });
      throw new Error(`Failed to list tools: ${message}`);
    }
  }

  /**
   * Get cached tool information.
   */
  public getTools(): MCPToolInfo[] {
    return Array.from(this.toolsCache.values());
  }

  /**
   * Get metadata for a specific tool.
   */
  public getTool(name: string): MCPToolInfo | undefined {
    return this.toolsCache.get(name);
  }

  /**
   * Call an MCP tool with schema validation, error handling, and timeout.
   */
  public async callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    options: { timeoutMs?: number; retrySafe?: boolean } = {}
  ): Promise<MCPToolCallResult> {
    this.ensureConnected();

    // Verify tool exists in schema
    const toolInfo = this.toolsCache.get(toolName);
    if (!toolInfo) {
      throw new Error(`Unknown MCP tool '${toolName}'. Available tools: ${Array.from(this.toolsCache.keys()).join(", ")}`);
    }

    const timeout = options.timeoutMs || this.options.timeoutMs;
    const maxAttempts = options.retrySafe ? 2 : 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        log("info", `MCP Client calling tool '${toolName}' (attempt ${attempt})`, { args });

        // Call tool with timeout race
        const callPromise = this.client!.callTool({
          name: toolName,
          arguments: args,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`MCP Tool call '${toolName}' timed out after ${timeout}ms`)), timeout)
        );

        const result = (await Promise.race([callPromise, timeoutPromise])) as {
          content: Array<{ type: string; text?: string; [key: string]: unknown }>;
          isError?: boolean;
          [key: string]: unknown;
        };

        const isError = Boolean(result.isError);
        const content = (result.content || []).map((c) => ({
          type: c.type || "text",
          text: typeof c.text === "string" ? c.text : JSON.stringify(c),
          data: c,
        }));

        return {
          tool: toolName,
          content,
          isError,
          raw: result,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log("warn", `Error calling MCP tool '${toolName}' on attempt ${attempt}`, { error: lastError.message });

        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    throw lastError || new Error(`Failed to invoke tool '${toolName}'`);
  }

  /**
   * Health ping to the MCP server.
   */
  public async ping(): Promise<boolean> {
    if (!this.isConnected || !this.client) return false;
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Graceful disconnection and process termination.
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore closing errors
      }
      this.client = null;
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // Ignore closing errors
      }
      this.transport = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    log("info", "MCP Client disconnected cleanly");
  }

  /**
   * Check connection status.
   */
  public get connected(): boolean {
    return this.isConnected;
  }

  private ensureConnected(): void {
    if (!this.isConnected || !this.client) {
      throw new Error("MCP Client is not connected. Call connect() first.");
    }
  }
}

// Global Singleton Instance for backend services
let globalMcpClient: PNG5MCPClient | null = null;

export function getMCPClient(opts?: MCPClientOptions): PNG5MCPClient {
  if (!globalMcpClient) {
    globalMcpClient = new PNG5MCPClient(opts);
  }
  return globalMcpClient;
}
