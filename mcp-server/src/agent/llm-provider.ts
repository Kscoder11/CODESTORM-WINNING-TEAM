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

/** One entry of conversational/execution history fed back into the planner. */
export interface AgentHistoryEntry {
  role: string;
  content: string;
  toolResult?: unknown;
  /** Name of the tool that produced `toolResult`, when applicable. */
  toolName?: string;
}

type DetectedOp =
  | "hello"
  | "create"
  | "edit"
  | "search"
  | "list"
  | "run"
  | "analyze"
  | "read"
  | "unknown";

function textOf(result: unknown): string {
  const res = result as { content?: Array<{ text?: string }>; isError?: boolean } | undefined;
  return res?.content?.[0]?.text || "";
}

function isErrorOf(result: unknown): boolean {
  const res = result as { isError?: boolean } | undefined;
  return Boolean(res?.isError);
}

/** Strip the `File: <path> (n lines)` + separator header from read_project_file output. */
function stripReadHeader(text: string): string {
  const lines = text.split("\n");
  if (lines[0]?.startsWith("File: ") && /^[-─]+$/.test(lines[1] || "")) {
    return lines.slice(2).join("\n");
  }
  return text;
}

/** Extract a file path mentioned in the prompt, if any. */
function extractPath(prompt: string): string | undefined {
  const match = prompt.match(/(?:^|[\s'"`(\[])([\w.-]+(?:\/[\w.-]+)*\.\w{1,10})(?=$|[\s'"`)\]])/);
  return match?.[1];
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
    history: AgentHistoryEntry[],
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

  /** Classify the requested operation from the prompt (specific → general). */
  private detectOp(prompt: string, toolNames: string[]): DetectedOp {
    const lower = prompt.toLowerCase();

    if (/^(hello|hi|hey|ping|status\b)/i.test(prompt.trim()) && toolNames.includes("hello")) return "hello";
    if (/\b(create|add|generate)\b[^.\n]*\bfile\b|\bwrite file\b|\bmake (a )?new file\b|\bsave (as|to)\b/.test(lower)) return "create";
    if (/\b(edit|modify|update|replace|rename)\b|\bfind\b[^.\n]*\breplace\b|\bchange\b[^.\n]*\bin\b/.test(lower)) return "edit";
    if (/\bsearch\b|\bgrep\b|\bfind in (code|source)\b/.test(lower)) return "search";
    if (/\blist\b|\bshow (me )?(the )?files\b|\bdirectory (of|listing)\b|^\s*ls\b|\bdir\b/.test(lower)) return "list";
    if (/\brun\b|\bexecute\b|\bpytest\b|\bjest\b|\bvitest\b|\bmocha\b|\btest\b|\blint\b|\bbuild\b|\bgit\b|\bnpm\b/.test(lower)) return "run";
    if (/\banaly[sz]e\b|\breview\b|\bsummar(?:y|ize)\b|\bexplain\b|\boverview\b|\barchitecture\b|\bwhat does\b|\bwalk me through\b|\binspect\b/.test(lower)) return "analyze";
    if (/\bread\b|\bshow (the )?(content|source)\b|\bopen\b/.test(lower) || extractPath(prompt)) return "read";
    return "unknown";
  }

  /**
   * Deterministic heuristic reasoning engine for fast, reliable, offline execution.
   *
   * Multi-step flows (read→edit, detect runner→execute, list→analyze) are driven
   * by inspecting which tools already produced results in `history`, so every
   * step is a real tool call and every final answer is grounded in real output.
   */
  private heuristicPlan(
    prompt: string,
    history: AgentHistoryEntry[],
    availableTools: MCPToolInfo[]
  ): ModelPlanStep {
    const toolNames = availableTools.map((t) => t.name);
    const op = this.detectOp(prompt, toolNames);

    // Most recent tool result
    const last = [...history].reverse().find((h) => h.toolResult !== undefined);
    const lastText = last ? textOf(last.toolResult) : "";
    const lastFailed = last ? isErrorOf(last.toolResult) : false;

    // Last successful result per tool (for multi-step flows)
    const lastOf = (tool: string): string => {
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i];
        if (h.toolName === tool && h.toolResult !== undefined && !isErrorOf(h.toolResult)) {
          return textOf(h.toolResult);
        }
      }
      return "";
    };

    // If the last step failed, surface the real error instead of looping.
    if (last && lastFailed) {
      return {
        thought: "The previous tool call failed; reporting the actual error to the user.",
        isFinal: true,
        finalResponse:
          `The last step (**${last.toolName || "tool"}**) failed:\n\n\`\`\`\n${lastText.slice(0, 1500)}\n\`\`\``,
      };
    }

    // --- 1. Hello / Connectivity ---
    if (op === "hello") {
      const prior = lastOf("hello");
      if (prior) {
        return {
          thought: "Connectivity check completed; relaying the server response.",
          isFinal: true,
          finalResponse: prior,
        };
      }
      return {
        thought: "The user is checking connectivity. I will invoke the hello tool.",
        tool: "hello",
        arguments: { name: "Website User" },
        isFinal: false,
      };
    }

    // --- 2. List Files ---
    if (op === "list") {
      const prior = lastOf("list_project_files");
      if (prior) {
        return {
          thought: "Directory listing received; presenting it to the user.",
          isFinal: true,
          finalResponse: prior,
        };
      }
      let dir = ".";
      if (/\bsrc\b/.test(prompt.toLowerCase())) dir = "src";
      else if (/\bgovernor\b/.test(prompt.toLowerCase())) dir = "governor";
      else if (/\bdocs?\b/.test(prompt.toLowerCase())) dir = "docs";
      else if (/\bmcp-server\b/.test(prompt.toLowerCase())) dir = "mcp-server";

      return {
        thought: `User wants to list project files. Inspecting directory '${dir}'.`,
        tool: "list_project_files",
        arguments: { path: dir },
        isFinal: false,
      };
    }

    // --- 3. Search Code ---
    if (op === "search") {
      const prior = lastOf("search_project_code");
      if (prior) {
        return {
          thought: "Search results received; presenting matches.",
          isFinal: true,
          finalResponse: prior,
        };
      }
      const match = prompt.match(/(?:search|grep|find)\s+(?:for\s+)?["']?([^"'\n]+?)["']?(?:\s+in\s+[\w./-]+)?$/i);
      const query = (match?.[1] || prompt.replace(/.*(?:search|grep|find)\s+(?:for\s+)?/i, "") || "policy").trim();

      return {
        thought: `Searching project code for pattern: '${query}'.`,
        tool: "search_project_code",
        arguments: { pattern: query.slice(0, 200) },
        isFinal: false,
      };
    }

    // --- 4. Edit File (read → derive new content → edit) ---
    if (op === "edit") {
      const filePath = extractPath(prompt);
      if (!filePath) {
        return {
          thought: "No file path identified in the request; asking the user for clarification.",
          isFinal: true,
          finalResponse:
            "Which file should I edit? Please include the file path (for example `src/example.ts`) and the exact text to replace.",
        };
      }

      const readText = lastOf("read_project_file");
      if (!readText || last?.toolName !== "read_project_file") {
        return {
          thought: `To edit '${filePath}' safely I first need its current content. Reading the file.`,
          tool: "read_project_file",
          arguments: { path: filePath },
          isFinal: false,
        };
      }

      const original = stripReadHeader(readText);

      // Parse an explicit replacement instruction from the prompt.
      const quotedReplace = prompt.match(
        /(?:replace|change|update)\s+["'`]([^"'`]+)["'`]\s+(?:with|to)\s+["'`]([^"'`]+)["'`]/s
      );
      const bareReplace = prompt.match(
        /(?:replace|change|update)\s+(.+?)\s+(?:with|to)\s+(.+?)(?:\s+(?:in|inside|of)\s+[\w./-]+)?[.!]?$/s
      );
      const explicitContent = prompt.match(/(?:with|new)\s+content\s*[:=]?\s*([\s\S]+)$/i);

      let newContent: string | undefined;
      let reason = "";

      if (quotedReplace) {
        const [, target, replacement] = quotedReplace;
        if (!original.includes(target)) {
          return {
            thought: "The exact text to replace was not found in the file; reporting honestly.",
            isFinal: true,
            finalResponse: `In \`${filePath}\` I could not find the exact text:\n\n\`\`\`\n${target}\n\`\`\`\nNo changes were made. Please provide the exact text as it appears in the file.`,
          };
        }
        newContent = original.split(target).join(replacement);
        reason = `Replace "${target.slice(0, 80)}" with "${replacement.slice(0, 80)}" in ${filePath}`;
      } else if (explicitContent) {
        newContent = explicitContent[1].trim().replace(/\s+$/, "\n");
        reason = `Replace full content of ${filePath} with user-provided content`;
      } else if (bareReplace && (prompt.toLowerCase().includes("replace") || prompt.toLowerCase().includes("change") || prompt.toLowerCase().includes("update"))) {
        const target = bareReplace[1].trim().replace(/[.!]$/, "");
        const replacement = bareReplace[2].trim().replace(/\s+(?:in|inside|of)\s+[\w./-]+$/, "");
        if (target && original.includes(target)) {
          newContent = original.split(target).join(replacement);
          reason = `Replace "${target.slice(0, 80)}" with "${replacement.slice(0, 80)}" in ${filePath}`;
        }
      }

      if (!newContent) {
        return {
          thought: "No concrete change was specified; asking the user for the exact edit.",
          isFinal: true,
          finalResponse:
            `I read \`${filePath}\` (${original.split("\n").length} lines), but the request does not specify the exact change.\n\n` +
            `Tell me what to do, e.g. \`replace "old text" with "new text" in ${filePath}\`, or provide the new full content.`,
        };
      }

      return {
        thought: `Derived the new content for '${filePath}' from its current content and the requested change. Submitting for policy review.`,
        tool: "edit_project_file",
        arguments: {
          path: filePath,
          content: newContent,
          reason: reason.slice(0, 300),
        },
        isFinal: false,
      };
    }

    // --- 5. Create File ---
    if (op === "create") {
      const prior = lastOf("create_project_file");
      if (prior) {
        return {
          thought: "File creation result received; confirming with the user.",
          isFinal: true,
          finalResponse: prior,
        };
      }

      const filePath = extractPath(prompt);
      if (!filePath) {
        return {
          thought: "No target filename was provided; asking the user for one.",
          isFinal: true,
          finalResponse: "What should the new file be named? Please include a filename with extension (for example `notes.md`).",
        };
      }

      const explicit = prompt.match(/(?:with|content\s*(?:is|:|=))\s*["'`]([\s\S]+?)["'`]$/i);
      const content = explicit
        ? explicit[1] + "\n"
        : `# ${filePath}\n\nCreated by the PNG5 agent from request:\n> ${prompt.trim()}\n`;

      return {
        thought: `Preparing creation of '${filePath}' for policy review (writes require human approval).`,
        tool: "create_project_file",
        arguments: {
          path: filePath,
          content,
          reason: `User requested creation of ${filePath}: ${prompt.trim().slice(0, 200)}`,
        },
        isFinal: false,
      };
    }

    // --- 6. Run Command / Tests / Git ---
    if (op === "run") {
      const lower = prompt.toLowerCase();

      // Git sub-commands
      if (/\bgit\b/.test(lower) && !/\btest\b/.test(lower)) {
        const prior = lastOf("run_project_command");
        if (prior) {
          return { thought: "Command output received; presenting it.", isFinal: true, finalResponse: prior };
        }
        let args = ["status"];
        if (/\bgit\s+diff\b/.test(lower)) args = ["diff"];
        else if (/\bgit\s+log\b/.test(lower)) args = ["log", "--oneline", "-10"];
        else if (/\bgit\s+branch\b/.test(lower)) args = ["branch", "-a"];

        return {
          thought: `Running allowlisted git command: 'git ${args.join(" ")}'.`,
          tool: "run_project_command",
          arguments: { command: "git", args, working_directory: "." },
          isFinal: false,
        };
      }

      // Test runners
      if (/\btest\b|\bpytest\b|\bjest\b|\bvitest\b|\bcoverage\b/.test(lower)) {
        // Generic request → detect the runner from package.json first.
        const wantsPython = /\bpytest\b|\bpython test\b|\bunittest\b/.test(lower);
        const wantsJs = /\bjest\b|\bvitest\b|\bmocha\b|\bnpm test\b|\byarn test\b|\bpnpm test\b|\bnode test\b/.test(lower);

        if (!wantsPython && !wantsJs) {
          const pkgText = lastOf("read_project_file") && last?.toolName === "read_project_file"
            ? lastText
            : "";
          if (!pkgText) {
            return {
              thought: "No runner specified; checking package.json to detect the project's test command.",
              tool: "read_project_file",
              arguments: { path: "package.json" },
              isFinal: false,
            };
          }
          const hasNpmTest = /"test"\s*:/.test(stripReadHeader(pkgText));
          return this.runTestStep(hasNpmTest ? "js" : "python");
        }
        return this.runTestStep(wantsJs ? "js" : "python");
      }

      // Build / lint
      if (/\bbuild\b|\blint\b|\btypecheck\b/.test(lower)) {
        const prior = lastOf("run_project_command");
        if (prior) {
          return { thought: "Command output received; presenting it.", isFinal: true, finalResponse: prior };
        }
        const script = /\blint\b/.test(lower) ? "lint" : /\btypecheck\b/.test(lower) ? "typecheck" : "build";
        return {
          thought: `Running npm script '${script}'.`,
          tool: "run_project_command",
          arguments: { command: "npm", args: ["run", script], working_directory: "." },
          isFinal: false,
        };
      }

      // Generic "run X" → surface what we support rather than guessing.
      return {
        thought: "No allowlisted command identified for this request; asking the user to be specific.",
        isFinal: true,
        finalResponse:
          "I can only execute allowlisted commands (`npm`, `pytest`, `jest`, `git`, `node`, `python`, `grep`, …). " +
          "Please name the exact command you want to run.",
      };
    }

    // --- 7. Analyze / Review (list → summarize real output) ---
    if (op === "analyze") {
      const specificPath = extractPath(prompt);
      if (specificPath) {
        if (last?.toolName === "read_project_file" && lastText) {
          return {
            thought: "File content retrieved; summarizing what is actually in it.",
            isFinal: true,
            finalResponse: `Analysis of \`${specificPath}\`:\n\n\`\`\`\n${stripReadHeader(lastText).slice(0, 3000)}\n\`\`\``,
          };
        }
        return {
          thought: `Reading '${specificPath}' to analyze it.`,
          tool: "read_project_file",
          arguments: { path: specificPath },
          isFinal: false,
        };
      }

      const listText = lastOf("list_project_files");
      if (listText) {
        return {
          thought: "Project structure retrieved; presenting a factual overview.",
          isFinal: true,
          finalResponse:
            `Here is the actual project structure I inspected:\n\n\`\`\`\n${listText.slice(0, 3000)}\n\`\`\`\n\n` +
            `Ask me to read or search any of these files for a deeper analysis.`,
        };
      }
      return {
        thought: "Analyzing the project by inspecting its file structure first.",
        tool: "list_project_files",
        arguments: { path: "." },
        isFinal: false,
      };
    }

    // --- 8. Read File ---
    if (op === "read") {
      const filePath = extractPath(prompt);
      if (!filePath) {
        return {
          thought: "No file path identified; asking the user which file to read.",
          isFinal: true,
          finalResponse: "Which file should I read? Please include the file path (for example `README.md`).",
        };
      }
      if (last?.toolName === "read_project_file" && lastText) {
        return {
          thought: "File content retrieved; presenting it.",
          isFinal: true,
          finalResponse: lastText.slice(0, 5000),
        };
      }
      return {
        thought: `Reading file '${filePath}'.`,
        tool: "read_project_file",
        arguments: { path: filePath },
        isFinal: false,
      };
    }

    // --- Fallback: honest capability response ---
    return {
      thought: "No specific tool action needed. Providing direct response.",
      isFinal: true,
      finalResponse:
        `I received: "${prompt}".\n\nI can, against the real project workspace:\n` +
        `- list/read/search files\n- create/edit files (human approval required)\n` +
        `- run allowlisted commands (tests, build, git)\n- analyze the project structure`,
    };
  }

  /** Choose an allowlisted test command based on detected project type. */
  private runTestStep(kind: "js" | "python"): ModelPlanStep {
    return kind === "js"
      ? {
          thought: "Detected a JavaScript/TypeScript project; running the npm test script.",
          tool: "run_project_command",
          arguments: { command: "npm", args: ["test"], working_directory: "." },
          isFinal: false,
        }
      : {
          thought: "Detected a Python project (or no npm test script); running pytest.",
          tool: "run_project_command",
          arguments: { command: "pytest", args: ["tests", "-q"], working_directory: "." },
          isFinal: false,
        };
  }

  /**
   * OpenAI API Integration
   */
  private async callOpenAI(
    prompt: string,
    history: AgentHistoryEntry[],
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
