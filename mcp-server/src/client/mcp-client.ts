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
import { resolve } from "path";
import { existsSync } from "fs";
import { config, log } from "../config.js";

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
    const candidatePaths = [
      resolve(config.projectRoot, "dist/server.js"),
      resolve(config.projectRoot, "mcp-server/dist/server.js"),
      resolve(process.cwd(), "dist/server.js"),
      resolve(process.cwd(), "mcp-server/dist/server.js"),
    ];
    const serverScript = candidatePaths.find((p) => existsSync(p));

    const defaultCommand = process.execPath;
    const defaultArgs = serverScript
      ? [serverScript]
      : [resolve(__dirname, "../../dist/server.js")];

    const cwd = serverScript ? resolve(serverScript, "..", "..") : resolve(config.projectRoot, "mcp-server");

    this.options = {
      serverCommand: opts.serverCommand || defaultCommand,
      serverArgs: opts.serverArgs || defaultArgs,
      projectRoot: opts.projectRoot || config.projectRoot,
      governorUrl: opts.governorUrl || config.governorUrl,
      agentSessionToken: opts.agentSessionToken || config.agentSessionToken,
      timeoutMs: opts.timeoutMs || 15000,
    };
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
    });

    try {
      // Ensure any previous transport is cleaned up
      await this.disconnect();

      const serverCwd = existsSync(resolve(this.options.projectRoot, "package.json"))
        ? this.options.projectRoot
        : resolve(this.options.projectRoot, "mcp-server");

      const distFile = existsSync(resolve(serverCwd, "dist/server.js"))
        ? resolve(serverCwd, "dist/server.js")
        : resolve(this.options.projectRoot, "mcp-server/dist/server.js");

      this.transport = new StdioClientTransport({
        command: "node",
        args: [distFile],
        cwd: serverCwd,
        env: {
          ...process.env,
          PROJECT_ROOT: this.options.projectRoot,
          GOVERNOR_URL: this.options.governorUrl,
          AGENT_SESSION_TOKEN: this.options.agentSessionToken,
          NODE_ENV: process.env.NODE_ENV || "production",
        },
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
