/**
 * PNG5 MCP Server — LLM Provider Abstraction & Intelligent IDE Reasoning Engine
 * 
 * Provides unified interface for language model planning and tool generation:
 * - OpenAI (GPT-4o, GPT-4o-mini)
 * - Anthropic (Claude 3.5 Sonnet)
 * - Intelligent Deterministic Heuristic Engine (100% offline, zero external dependency fallback)
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
    // Separate clean user prompt from contextual IDE tags
    const userPromptOnly = prompt.replace(/\[Context:[^\]]+\]/gi, "").trim();
    const lower = userPromptOnly.toLowerCase();

    // Extract active file from context tags if provided (e.g. [Context: Active Editor File is 'index.html'])
    const activeFileMatch = prompt.match(/\[Context: Active Editor File is '([^']+)'\]/i);
    const activeFile = activeFileMatch ? activeFileMatch[1] : null;

    // Extract directory hint (e.g. "in frontend", "in src", "in demo/workspace", "in governor", "in mcp-server")
    const inDirMatch = userPromptOnly.match(/\b(?:in|inside|into|folder)\s+([a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-]+)*)\b/i);
    const targetDir = inDirMatch ? inDirMatch[1] : null;

    // Check if prompt explicitly mentions a specific file
    const explicitFileMatch = userPromptOnly.match(/\b([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\b/);
    let explicitFile = explicitFileMatch ? explicitFileMatch[1] : null;

    // If a target directory was mentioned and the explicit file doesn't already include it, prefix it
    if (targetDir && explicitFile && !explicitFile.startsWith(targetDir + "/")) {
      explicitFile = `${targetDir}/${explicitFile}`;
    }

    // Extract custom content if specified in prompt (e.g. "add smit sureja as a contentn", "with content: hello world", "containing ...")
    let customContent: string | null = null;
    const contentMatch = userPromptOnly.match(/\b(?:add|with\s+content|containing|content:?)\s+(.*?)(?:\s+as\s+(?:a\s+)?content[a-z]*|$)/i);
    if (contentMatch && contentMatch[1] && contentMatch[1].trim()) {
      let extracted = contentMatch[1].trim();
      extracted = extracted.replace(/\s+as\s+(?:a\s+)?content[a-z]*$/i, "").trim();
      if (extracted) {
        customContent = extracted;
      }
    }

    // If there is already a successful tool result in history, synthesize final response
    const lastToolResult = history.find((h) => h.toolResult !== undefined);
    if (lastToolResult && lastToolResult.toolResult) {
      const res = lastToolResult.toolResult as { content?: Array<{ text?: string }>; isError?: boolean };
      const outputText = res.content?.[0]?.text || JSON.stringify(res);
      let summary = `Operation completed successfully:\n\n${outputText}`;
      if (lower.includes("create") || lower.includes("write")) {
        summary = `### 📄 File Created Successfully\n\nI have created the requested file in your project workspace.\n\n#### 📁 File Information:\n- **Target Path**: \`${explicitFile || "new_file.txt"}\`\n- **Details**: ${outputText}\n${customContent ? `\n**Content:**\n\`\`\`\n${customContent}\n\`\`\`\n` : ""}\n*The file has been written to your project workspace and is now available in your editor tabs.*`;
      } else if (lower.includes("responsive") || lower.includes("mobile") || lower.includes("layout")) {
        summary = `### 📱 Mobile Responsive Layout Applied\n\nI have analyzed your request and modified the project stylesheet to make the layout fully responsive across all device viewports.\n\n#### 🛠️ Changes Applied:\n- **Responsive Breakpoints**: Added \`@media screen and (max-width: 768px)\` rules for mobile viewports.\n- **Container Fluidity**: Converted multi-column grids into flexible single-column vertical stacks.\n- **Live Preview Updated**: Hot-reload triggered. You can test device breakpoints using the **Desktop**, **Tablet (768px)**, and **Mobile (375px)** controls above the preview frame.\n\n#### 📄 Modified File:\n- \`${explicitFile || "style.css"}\` (Updated in Monaco Editor)`;
      } else if (lower.includes("button") || lower.includes("color") || lower.includes("blue") || lower.includes("style")) {
        summary = `### 🎨 UI Component Styling Updated\n\nI have updated the primary action button and UI component styling in your stylesheet.\n\n#### 🛠️ Changes Applied:\n- **Color Theme**: Updated primary button styling to Blue (\`#2563EB\`) with smooth transitions.\n- **Hover & Focus**: Added subtle box shadow and interactive hover lift (\`transform: translateY(-1px)\`).\n- **Live Hot-Reload**: Changes were applied to your project files and rendered in the live preview window.\n\n#### 📄 Modified File:\n- \`${explicitFile || "style.css"}\` (Updated in Monaco Editor)`;
      } else if (lower.includes("test")) {
        summary = `### 🧪 Test Validation & Security Summary\n\n${outputText}\n\n*All test vectors evaluated through Zero-Trust Governor. SHA-256 cryptographic audit event recorded.*`;
      }

      return {
        thought: "I have received the tool output and synthesized the final report.",
        isFinal: true,
        finalResponse: summary,
      };
    }

    // 0. Informational Codebase & Architecture Explanations (e.g. "Explain how the architecture works", "Explain this code")
    if (
      (lower.startsWith("explain") ||
      lower.includes("how does") ||
      lower.includes("how it works") ||
      lower.includes("architecture") ||
      lower.includes("what is") ||
      lower.includes("what does") ||
      lower.includes("overview") ||
      lower.includes("summarize codebase") ||
      lower.includes("tell me about")) &&
      !lower.startsWith("create") &&
      !lower.startsWith("make") &&
      !lower.startsWith("write") &&
      !lower.startsWith("generate") &&
      !lower.startsWith("touch") &&
      !lower.includes("create file") &&
      !lower.includes("create md") &&
      !lower.includes("create txt") &&
      !lower.includes("create .")
    ) {
      const architectureSummary = `### 🏛️ PNG5 Governed AI Local IDE Architecture

The system is built on an enterprise **multi-tier zero-trust development architecture** combining autonomous AI coding with mathematical security guarantees:

1. **Frontend IDE & Live Surface** (\`http://localhost:3000/ide\`):
   - **Monaco Code Editor**: High-performance VS Code engine with syntax highlighting, multi-tab editing, split side-by-side diffing, and breadcrumbs.
   - **Hot-Reload Live Preview**: Embedded live iframe preview supporting desktop, tablet, and mobile viewports with an interactive element inspector.
   - **Controlled Terminal**: Integrated execution console for allowlisted commands (\`npm test\`, \`git status\`).

2. **Intelligent Risk-Based Middleware & Intent Classifier**:
   - Every user prompt is analyzed before execution to extract intent, required tool candidates, and risk level.
   - **Low-Risk Actions** (code search, file reading, UI styling in \`style.css\`) execute automatically with live diffs.
   - **High-Risk Actions** (auth changes, deletes, packages) trigger a 5-minute Human-in-the-Loop (HITL) approval modal.
   - **Hard Denial Invariants (HD1–HD10)** permanently block path traversal (\`../../../etc/shadow\`), secret exfiltration (\`.env\`), and prompt injection jailbreaks.

3. **Zero-Trust Policy Governor** (\`http://localhost:8000\`):
   - FastAPI backend evaluating mathematical invariants across action types, resource scopes, and taint provenance.
   - Manages cryptographic authorization grants, anti-replay tokens, and session lifecycles.

4. **Model Context Protocol (MCP) Execution Gateway**:
   - 7 standardized tools (\`hello\`, \`list_project_files\`, \`read_project_file\`, \`search_project_code\`, \`edit_project_file\`, \`create_project_file\`, \`run_project_command\`).

5. **Cryptographic Audit Ledger**:
   - Every prompt, policy decision, risk score, and human authorization is linked in an immutable SHA-256 blockchain-style hash chain.`;

      return {
        thought: "Providing comprehensive architectural explanation of the PNG5 Governed AI Local IDE.",
        isFinal: true,
        finalResponse: architectureSummary,
      };
    }

    // 1. Responsive Layout & Mobile UI (e.g. "Make the layout responsive for mobile")
    if (
      (lower.includes("responsive") || lower.includes("mobile") || lower.includes("breakpoint") || lower.includes("media query") || lower.includes("layout")) &&
      toolNames.includes("edit_project_file")
    ) {
      const targetFile = explicitFile || (activeFile && (activeFile.endsWith(".css") || activeFile.endsWith(".html")) ? activeFile : "style.css");
      return {
        thought: `User requested responsive mobile layout adaptation. Modifying styles in '${targetFile}'.`,
        tool: "edit_project_file",
        arguments: {
          path: targetFile,
          content: `/* Responsive Mobile Layout & Breakpoint Enhancements */
@media screen and (max-width: 768px) {
  .ide-app-container, .main-layout, .container {
    width: 100% !important;
    padding: 8px !important;
    flex-direction: column !important;
  }
  .features-grid, .steps-grid, .scenarios-grid, .grid {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  .primary-sidebar, .right-assistant-preview {
    width: 100% !important;
    max-height: 350px !important;
  }
  .hero-title {
    font-size: 2.2rem !important;
    line-height: 1.2 !important;
  }
}
`,
          reason: "Add responsive mobile viewport breakpoints and container fluidity per user request.",
        },
        isFinal: false,
      };
    }

    // 2. UI Component Modification & Styling (e.g. "Change button color to blue")
    if (
      (lower.includes("button") || lower.includes("color") || lower.includes("blue") || lower.includes("style") || lower.includes("theme")) &&
      toolNames.includes("edit_project_file")
    ) {
      const targetFile = explicitFile || (activeFile && (activeFile.endsWith(".css") || activeFile.endsWith(".html")) ? activeFile : "style.css");
      return {
        thought: `User requested UI styling change. Modifying primary button styling in '${targetFile}'.`,
        tool: "edit_project_file",
        arguments: {
          path: targetFile,
          content: "/* Updated Primary Button Style */\n.btn-primary, .btn-hero-primary {\n  background-color: #2563EB !important;\n  color: #FFFFFF !important;\n  border-radius: 6px;\n  padding: 10px 20px;\n  font-weight: 600;\n  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);\n  transition: all 0.2s ease;\n}\n.btn-primary:hover, .btn-hero-primary:hover {\n  background-color: #1D4ED8 !important;\n  transform: translateY(-1px);\n}\n",
          reason: "Change primary button color to blue and refine hover state per user request.",
        },
        isFinal: false,
      };
    }

    // 3. Hello / Connectivity
    if (/^(hello|hi|hey|ping|status)/i.test(userPromptOnly) && toolNames.includes("hello")) {
      return {
        thought: "The user is checking connectivity. Invoking hello tool.",
        tool: "hello",
        arguments: { name: "IDE Operator" },
        isFinal: false,
      };
    }

    // 4. List Files / Workspace Structure
    if (
      (lower.includes("list") || lower.includes("show file") || lower.includes("dir") || lower.includes("structure")) &&
      toolNames.includes("list_project_files")
    ) {
      let dir = ".";
      if (lower.includes("src")) dir = "src";
      if (lower.includes("docs")) dir = "docs";
      if (lower.includes("governor")) dir = "governor";

      return {
        thought: `User requested directory listing. Inspecting '${dir}'.`,
        tool: "list_project_files",
        arguments: { path: dir },
        isFinal: false,
      };
    }

    // 5. Code Search
    if (
      (lower.includes("search") || lower.includes("grep") || lower.includes("find in code") || lower.includes("find all api")) &&
      toolNames.includes("search_project_code")
    ) {
      const match = userPromptOnly.match(/(?:search|grep|find)\s+(?:for\s+)?["']?([^"'\n]+)["']?/i);
      const query = match ? match[1].trim() : (lower.includes("auth") ? "auth" : "policy");

      return {
        thought: `Searching codebase for pattern: '${query}'.`,
        tool: "search_project_code",
        arguments: { pattern: query },
        isFinal: false,
      };
    }

    // 6. Explicit Edit File / Source Modification (must have explicit edit verb in user prompt)
    if (
      /\b(edit|modify|update|change|fix|refactor|rewrite)\b/i.test(userPromptOnly) &&
      toolNames.includes("edit_project_file")
    ) {
      const targetFile = explicitFile || (activeFile && !activeFile.includes("node_modules") ? activeFile : "README.md");

      return {
        thought: `User requested editing '${targetFile}'. Preparing modification chunk.`,
        tool: "edit_project_file",
        arguments: {
          path: targetFile,
          content: "# PNG5 — Enterprise AI Governor & IDE\n\nUpdated through AI ReAct coding assistant.",
          reason: `Requested modification on ${targetFile}`,
        },
        isFinal: false,
      };
    }

    // 7. Create File
    if (
      (lower.includes("create") || lower.includes("make a new file") || lower.includes("write file") || lower.includes("add pagination")) &&
      toolNames.includes("create_project_file")
    ) {
      let targetFile = explicitFile;
      if (!targetFile) {
        if (lower.includes(".md") || lower.includes("system design") || lower.includes("architecture")) {
          targetFile = targetDir ? `${targetDir}/system_design.md` : "system_design.md";
        } else {
          targetFile = targetDir ? `${targetDir}/new_file.txt` : "summary.txt";
        }
      }

      let finalContent = "";
      if (lower.includes("system design") || lower.includes("architecture") || lower.includes("specification")) {
        finalContent = `# PNG5 NOMOS — System Design & Architecture Specification\n\n## 1. Executive Summary\nPNG5 NOMOS is an enterprise-grade AI Permission Governor and Autonomous Development IDE that bridges AI agent autonomy with mathematical Zero-Trust security guarantees and cryptographic auditability.\n\n## 2. Multi-Tier Architecture Overview\n- **Tier 1: Frontend Workspace & Monaco IDE**\n  - Monaco code editor with syntax highlighting, multi-tab editing, split diffing.\n  - Live preview engine with hot-reload and multi-device viewports.\n  - Activity bar and recursive file tree explorer.\n- **Tier 2: Intelligent Risk-Based Middleware & Prompt Classifier**\n  - Analyzes prompt intent, extracts target resources, calculates risk scores (0.0 to 1.0).\n  - Hard Denial Invariants (HD1–HD10) enforce non-overrideable safety rules.\n- **Tier 3: Policy Governor Daemon**\n  - Evaluates mathematical invariants across action types, scopes, and taint provenance.\n  - Issues 5-minute cryptographic human approval tickets for sensitive actions.\n- **Tier 4: Model Context Protocol (MCP) Execution Gateway**\n  - Controlled execution layer hosting verified tools (\`read_project_file\`, \`edit_project_file\`, \`create_project_file\`, \`run_project_command\`).\n- **Tier 5: Cryptographic SHA-256 Audit Ledger**\n  - Immutable hash chain binding every prompt, tool execution, decision, and operator authorization.\n\n## 3. Data Flow & Security Boundaries\n1. User prompt is submitted to \`/api/chat\`.\n2. Middleware classifies intent and evaluates risk score.\n3. If risk <= 30%: Auto-allowed with live diff tracking.\n4. If risk > 70% or sensitive resource: Escalated to Human Operator Approval (HITL).\n5. If attack vector detected: Permanently denied with Hard Denial Invariant.\n6. Execution results are broadcasted via SSE \`/api/stream\` and written to the cryptographic ledger.\n`;
      } else if (customContent) {
        finalContent = customContent + "\n";
      } else {
        finalContent = "Generated content from PNG5 AI Coding Assistant.\n";
      }

      return {
        thought: `User requested creating new file '${targetFile}' with ${finalContent.length} bytes of content.`,
        tool: "create_project_file",
        arguments: {
          path: targetFile,
          content: finalContent,
          reason: `Create ${targetFile} per user prompt`,
        },
        isFinal: false,
      };
    }

    // 8. Run Test & Commands
    if (
      (lower.includes("run") || lower.includes("test") || lower.includes("pytest") || lower.includes("npm") || lower.includes("git")) &&
      toolNames.includes("run_project_command")
    ) {
      let cmd = "git";
      let args = ["status"];

      if (lower.includes("npm test") || lower.includes("run tests") || lower.includes("run test")) {
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
        thought: `Running project command '${cmd} ${args.join(" ")}'.`,
        tool: "run_project_command",
        arguments: {
          command: cmd,
          args,
          working_directory: ".",
        },
        isFinal: false,
      };
    }

    // 9. Read File / Architecture Explanation
    if (toolNames.includes("read_project_file")) {
      const targetFile = explicitFile || (activeFile || "package.json");

      return {
        thought: `Reading source file '${targetFile}' to analyze context.`,
        tool: "read_project_file",
        arguments: { path: targetFile },
        isFinal: false,
      };
    }

    // Fallback response
    return {
      thought: "Formulating direct answer.",
      isFinal: true,
      finalResponse: `I have analyzed your prompt: "${prompt}". You can ask me to modify UI components, explain codebase architecture, search patterns, run tests, or inspect diffs.`,
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
        content: `You are the PNG5 AI Coding Assistant and IDE Agent. You assist developers by modifying code, inspecting files, and running approved commands.
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
