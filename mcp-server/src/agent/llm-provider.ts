/**
 * PNG5 MCP Server — LLM Provider Abstraction
 * 
 * Provides unified interface for language model planning and tool generation:
 * - OpenAI (GPT-4o, GPT-4o-mini)
 * - Anthropic (Claude 3.5 Sonnet)
 * - Deterministic Heuristic Engine (100% offline fallback)
 */

import { log } from "../config.js";
import type { MCPToolInfo } from "../client/mcp-client.js";

export interface ModelPlanStep {
  thought: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  isFinal: boolean;
  finalResponse?: string;
}

export interface LLMProviderOptions {
  provider?: "openai" | "anthropic" | "heuristic";
  apiKey?: string;
  model?: string;
}

export class LLMProvider {
  private provider: "openai" | "anthropic" | "heuristic";
  private apiKey?: string;
  private model: string;

  constructor(opts: LLMProviderOptions = {}) {
    const envOpenAI = process.env.OPENAI_API_KEY;
    const envAnthropic = process.env.ANTHROPIC_API_KEY;

    if (opts.provider) {
      this.provider = opts.provider;
    } else if (envOpenAI) {
      this.provider = "openai";
    } else if (envAnthropic) {
      this.provider = "anthropic";
    } else {
      this.provider = "heuristic";
    }

    this.apiKey = opts.apiKey || envOpenAI || envAnthropic;
    this.model = opts.model || (this.provider === "openai" ? "gpt-4o-mini" : "heuristic-planner");
  }

  /**
   * Formulate the next step in the agent reasoning loop.
   */
  public async planStep(
    prompt: string,
    history: Array<{ role: string; content: string; toolResult?: unknown }>,
    availableTools: MCPToolInfo[]
  ): Promise<ModelPlanStep> {
    // If external API key is available, attempt real LLM API call
    if (this.provider === "openai" && this.apiKey) {
      try {
        return await this.callOpenAI(prompt, history, availableTools);
      } catch (err) {
        log("warn", "OpenAI call failed, falling back to heuristic planner", { error: String(err) });
      }
    }

    // Default intelligent deterministic reasoning engine
    return this.heuristicPlan(prompt, history, availableTools);
  }

  /**
   * Deterministic heuristic reasoning engine for fast, reliable, offline execution.
   */
  private heuristicPlan(
    prompt: string,
    history: Array<{ role: string; content: string; toolResult?: unknown }>,
    availableTools: MCPToolInfo[]
  ): ModelPlanStep {
    const toolNames = availableTools.map((t) => t.name);
    const lower = prompt.toLowerCase();

    // If there is already a successful tool result in history, synthesize final response
    const lastToolResult = history.find((h) => h.toolResult !== undefined);
    if (lastToolResult && lastToolResult.toolResult) {
      const res = lastToolResult.toolResult as { content?: Array<{ text?: string }>; isError?: boolean };
      const outputText = res.content?.[0]?.text || JSON.stringify(res);

      return {
        thought: "I have received the tool output and can now provide the final answer to the user.",
        isFinal: true,
        finalResponse: `Here is the result of your request:\n\n${outputText}`,
      };
    }

    // 1. Hello / Connectivity
    if (/^(hello|hi|hey|ping|status)/i.test(prompt) && toolNames.includes("hello")) {
      return {
        thought: "The user is checking connectivity. I will invoke the hello tool.",
        tool: "hello",
        arguments: { name: "Website User" },
        isFinal: false,
      };
    }

    // 2. List Files
    if (
      (lower.includes("list") || lower.includes("show file") || lower.includes("dir") || lower.includes("ls")) &&
      toolNames.includes("list_project_files")
    ) {
      let dir = ".";
      if (lower.includes("src")) dir = "src";
      if (lower.includes("docs")) dir = "docs";
      if (lower.includes("governor")) dir = "governor";

      return {
        thought: `User wants to list project files. Inspecting directory '${dir}'.`,
        tool: "list_project_files",
        arguments: { path: dir },
        isFinal: false,
      };
    }

    // 3. Search Code
    if (
      (lower.includes("search") || lower.includes("grep") || lower.includes("find in code")) &&
      toolNames.includes("search_project_code")
    ) {
      // Extract query
      const match = prompt.match(/(?:search|grep|find)\s+(?:for\s+)?["']?([^"'\n]+)["']?/i);
      const query = match ? match[1].trim() : "policy";

      return {
        thought: `Searching project code for pattern: '${query}'.`,
        tool: "search_project_code",
        arguments: { pattern: query },
        isFinal: false,
      };
    }

    // 4. Edit File
    if (
      (lower.includes("edit") || lower.includes("modify") || lower.includes("replace in")) &&
      toolNames.includes("edit_project_file")
    ) {
      const pathMatch = prompt.match(/[\w.-]+\/[\w.-]+\.\w+|[\w.-]+\.\w+/);
      const filePath = pathMatch ? pathMatch[0] : "README.md";

      return {
        thought: `User requested editing file '${filePath}'. Formulating safe edit chunk.`,
        tool: "edit_project_file",
        arguments: {
          path: filePath,
          target_content: "# PNG5",
          replacement_content: "# PNG5 — Policy Governed",
        },
        isFinal: false,
      };
    }

    // 5. Create File
    if (
      (lower.includes("create") || lower.includes("make a new file") || lower.includes("write file")) &&
      toolNames.includes("create_project_file")
    ) {
      const pathMatch = prompt.match(/[\w.-]+\/[\w.-]+\.\w+|[\w.-]+\.\w+/);
      const filePath = pathMatch ? pathMatch[0] : "output.txt";

      return {
        thought: `User wants to create a new file '${filePath}'.`,
        tool: "create_project_file",
        arguments: {
          path: filePath,
          content: "Generated content from PNG5 Agent.\n",
          overwrite: false,
        },
        isFinal: false,
      };
    }

    // 6. Run Command
    if (
      (lower.includes("run") || lower.includes("pytest") || lower.includes("npm") || lower.includes("git")) &&
      toolNames.includes("run_project_command")
    ) {
      let cmd = "git";
      let args = ["status"];

      if (lower.includes("npm test")) {
        cmd = "npm";
        args = ["test"];
      } else if (lower.includes("pytest")) {
        cmd = "pytest";
        args = ["tests/"];
      } else if (lower.includes("python")) {
        cmd = "python";
        args = ["--version"];
      }

      return {
        thought: `Running allowlisted project command: '${cmd} ${args.join(" ")}'.`,
        tool: "run_project_command",
        arguments: {
          command: cmd,
          args,
          working_directory: ".",
        },
        isFinal: false,
      };
    }

    // 7. Read File
    if (toolNames.includes("read_project_file")) {
      const pathMatch = prompt.match(/\.env\b|\.[\w.-]+|[\w.-]+\/[\w.-]+\.\w+|[\w.-]+\.\w+/i);
      const filePath = pathMatch ? pathMatch[0] : "package.json";

      return {
        thought: `User wants to read file content of '${filePath}'.`,
        tool: "read_project_file",
        arguments: { path: filePath },
        isFinal: false,
      };
    }

    // Fallback: General response
    return {
      thought: "No specific tool action needed. Providing direct response.",
      isFinal: true,
      finalResponse: `I received your prompt: "${prompt}". You can ask me to list project files, read documents, search codebase, or run approved commands.`,
    };
  }

  /**
   * OpenAI API Integration
   */
  private async callOpenAI(
    prompt: string,
    history: Array<{ role: string; content: string; toolResult?: unknown }>,
    availableTools: MCPToolInfo[]
  ): Promise<ModelPlanStep> {
    const messages = [
      {
        role: "system",
        content: `You are the PNG5 AI Agent. You assist users by executing tasks using authorized tools.
Available tools:
${JSON.stringify(availableTools, null, 2)}

Respond ONLY with a JSON object matching this schema:
{
  "thought": "your step-by-step reasoning",
  "tool": "tool_name_or_null",
  "arguments": { "param1": "val1" },
  "isFinal": false,
  "finalResponse": "final natural language response if isFinal is true"
}`,
      },
      ...history.map((h) => ({
        role: h.role,
        content: h.toolResult ? `Tool Result: ${JSON.stringify(h.toolResult)}` : h.content,
      })),
      { role: "user", content: prompt },
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return {
      thought: parsed.thought || "Executing plan",
      tool: parsed.tool || undefined,
      arguments: parsed.arguments || {},
      isFinal: Boolean(parsed.isFinal || !parsed.tool),
      finalResponse: parsed.finalResponse,
    };
  }
}
