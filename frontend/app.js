/**
 * PNG5 AI Local IDE — Complete Integrated Frontend Application Engine
 * 
 * Features:
 * - Monaco Editor with multi-tab workspace, syntax highlighting, and live diff mode
 * - File tree explorer with live directory creation, deletion, and file selection
 * - Codebase pattern search across active project workspace
 * - Git version control status, diff inspection, and staging
 * - Conversational AI Assistant with prompt categorization, tool step visualization, and active context
 * - Zero-Trust Governor Human Approval Modal & sidebar
 * - Live Preview with hot reload and device viewports (desktop/tablet/mobile)
 * - Controlled interactive terminal execution console
 * - Cryptographic SHA-256 audit ledger and verification
 * - Real-time Server-Sent Events (SSE) telemetry stream
 */

// Global Application State
let monacoEditor = null;
let monacoDiffEditor = null;
let currentProject = { name: "workspace", path: "", framework: "Static" };
let openFiles = new Map(); // path -> { name, path, content, original, language, dirty }
let activeFilePath = null;
let activeEditorMode = "editor"; // "editor" | "diff"
let activeActivityTab = "explorer";
let activeBottomTab = "terminal";
let activeRightTab = "preview";
let activeApprovalId = null;
let activePromptForApproval = null;
let terminalHistory = [];
let terminalHistoryIndex = -1;

// ============================================================
// Initialization Lifecycle
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initializeMonaco();
  } catch (err) {
    console.warn("Monaco init deferred", err);
  }

  try {
    await loadActiveProject();
  } catch (err) {
    console.error("loadActiveProject error", err);
  }

  try {
    await refreshProjectTree();
  } catch (err) {
    console.error("refreshProjectTree error", err);
  }

  try {
    await refreshGitStatus();
  } catch (err) {
    console.error("refreshGitStatus error", err);
  }

  try {
    await fetchPendingApprovals();
  } catch (err) {
    console.error("fetchPendingApprovals error", err);
  }

  try {
    await fetchAuditLogs();
  } catch (err) {
    console.error("fetchAuditLogs error", err);
  }

  try {
    await loadSecurityScenarios();
  } catch (err) {
    console.error("loadSecurityScenarios error", err);
  }

  try {
    initSSEStream();
  } catch (err) {
    console.warn("SSE init deferred", err);
  }

  // Keyboard Shortcuts & Global Listeners
  window.addEventListener("keydown", handleGlobalShortcuts);

  // Periodic Polling Fallbacks
  setInterval(fetchPendingApprovals, 5000);
  setInterval(refreshGitStatus, 10000);
});

// ============================================================
// 1. Monaco Editor Initialization & Tab Management
// ============================================================

function initializeMonaco() {
  const editorContainer = document.getElementById("monaco-editor-container");
  if (!editorContainer) return;

  if (typeof require === "undefined" || !window.require) {
    console.warn("Monaco CDN loader not ready, creating fallback editor textarea");
    createFallbackTextarea(editorContainer);
    return;
  }

  try {
    require.config({
      paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" },
    });

    require(["vs/editor/editor.main"], () => {
      // Main Code Editor
      monacoEditor = monaco.editor.create(editorContainer, {
        value: "/* Welcome to PNG5 Governed AI Local IDE */\n// Select a file from the explorer on the left or instruct the AI assistant.",
        language: "javascript",
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        smoothScrolling: true,
      });

      monacoEditor.onDidChangeModelContent(() => {
        if (activeFilePath && openFiles.has(activeFilePath)) {
          const fileData = openFiles.get(activeFilePath);
          const currentVal = monacoEditor.getValue();
          fileData.content = currentVal;
          fileData.dirty = currentVal !== fileData.original;
          renderEditorTabs();
        }
      });

      // Diff Editor
      const diffContainer = document.getElementById("monaco-diff-container");
      if (diffContainer) {
        monacoDiffEditor = monaco.editor.createDiffEditor(diffContainer, {
          theme: "vs-dark",
          automaticLayout: true,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
          readOnly: true,
        });
      }

      // Automatically open default startup files
      openFileByPath("style.css").catch(() => {
        openFileByPath("index.html").catch(() => {});
      });
    });
  } catch (err) {
    console.warn("Monaco setup error", err);
    createFallbackTextarea(editorContainer);
  }
}

function createFallbackTextarea(container) {
  if (container.querySelector("textarea")) return;
  container.innerHTML = "";
  const ta = document.createElement("textarea");
  ta.id = "fallback-code-editor";
  ta.className = "fallback-code-area";
  ta.placeholder = "/* Code Editor */";
  ta.style.width = "100%";
  ta.style.height = "100%";
  ta.style.background = "#0b0c12";
  ta.style.color = "#00ff88";
  ta.style.fontFamily = "'JetBrains Mono', monospace";
  ta.style.fontSize = "13px";
  ta.style.padding = "16px";
  ta.style.border = "none";
  ta.style.outline = "none";
  ta.style.resize = "none";

  ta.addEventListener("input", () => {
    if (activeFilePath && openFiles.has(activeFilePath)) {
      const fileData = openFiles.get(activeFilePath);
      fileData.content = ta.value;
      fileData.dirty = ta.value !== fileData.original;
      renderEditorTabs();
    }
  });

  container.appendChild(ta);
}

// ============================================================
// 2. Real-time Server-Sent Events (SSE) Stream
// ============================================================

function initSSEStream() {
  try {
    const eventSource = new EventSource("/api/stream");

    eventSource.addEventListener("action_event", () => {
      fetchAuditLogs();
      fetchPendingApprovals();
    });

    eventSource.addEventListener("approval_event", () => {
      fetchPendingApprovals();
      fetchAuditLogs();
    });

    eventSource.addEventListener("file_saved", (e) => {
      const data = JSON.parse(e.data || "{}");
      refreshLivePreview();
      refreshGitStatus();
    });

    eventSource.addEventListener("tree_updated", () => {
      refreshProjectTree();
      refreshGitStatus();
    });

    eventSource.addEventListener("project_changed", () => {
      loadActiveProject();
      refreshProjectTree();
      refreshLivePreview();
    });
  } catch (err) {
    console.warn("SSE connection deferred", err);
  }
}

// ============================================================
// 3. Project Workspace & File Explorer
// ============================================================

async function loadActiveProject() {
  try {
    const res = await fetch("/api/project");
    if (!res.ok) return;
    const data = await res.json();
    currentProject = data;

    const nameEl = document.getElementById("active-project-name");
    const pathStatusEl = document.getElementById("active-file-path-status");
    if (nameEl) nameEl.textContent = data.name || "workspace";
    if (pathStatusEl) pathStatusEl.textContent = `📁 ${data.name || "workspace"}`;

    const recents = data.recentProjects || [];
    renderRecentProjectsList(recents);
  } catch (err) {
    console.error("Failed to load project metadata", err);
  }
}

async function refreshProjectTree() {
  const container = document.getElementById("file-tree-container");
  if (!container) return;

  try {
    container.innerHTML = `<div class="tree-loading">Scanning workspace...</div>`;
    const res = await fetch("/api/project/tree");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const nodes = data.tree || data.items || [];
    if (nodes.length === 0) {
      container.innerHTML = `<div class="sidebar-empty">Workspace is empty. Create a file with 📄+</div>`;
      return;
    }

    container.innerHTML = "";
    container.appendChild(renderTreeNodeList(nodes));
    highlightActiveFileInTree();
  } catch (err) {
    container.innerHTML = `<div class="sidebar-empty" style="color: #ff3366;">Failed to load tree: ${escapeHtml(err.message)}</div>`;
  }
}

function renderTreeNodeList(nodes) {
  const ul = document.createElement("ul");
  ul.className = "tree-list";

  for (const node of nodes) {
    const li = document.createElement("li");
    li.className = `tree-item ${node.type}`;
    const relPath = node.relativePath || node.path;

    if (node.type === "directory") {
      const header = document.createElement("div");
      header.className = "tree-node folder";
      header.innerHTML = `
        <svg class="tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        <svg class="tree-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
        <span class="node-name">${escapeHtml(node.name)}</span>
      `;
      
      const childrenWrapper = document.createElement("div");
      childrenWrapper.className = "folder-children";
      if (node.children && node.children.length > 0) {
        childrenWrapper.appendChild(renderTreeNodeList(node.children));
      }

      // Auto-expand prominent folders
      if (node.name === "demo" || node.name === "workspace" || node.name === "src" || node.name === "frontend") {
        header.classList.add("expanded");
        childrenWrapper.classList.remove("hidden");
      } else {
        header.classList.add("collapsed");
        childrenWrapper.classList.add("hidden");
      }

      header.addEventListener("click", () => {
        const isCollapsed = header.classList.toggle("collapsed");
        header.classList.toggle("expanded", !isCollapsed);
        childrenWrapper.classList.toggle("hidden", isCollapsed);
      });

      li.appendChild(header);
      li.appendChild(childrenWrapper);
    } else {
      const fileRow = document.createElement("div");
      const isActive = activeFilePath === relPath;
      fileRow.className = `tree-node file ${isActive ? "active" : ""}`;
      fileRow.dataset.path = relPath;
      
      const ext = ("." + (node.name.split(".").pop() || "")).toLowerCase();
      let extBadgeClass = "ext-default";
      if (ext === ".ts" || ext === ".tsx") extBadgeClass = "ext-ts";
      else if (ext === ".js" || ext === ".jsx") extBadgeClass = "ext-js";
      else if (ext === ".css") extBadgeClass = "ext-css";
      else if (ext === ".html") extBadgeClass = "ext-html";
      else if (ext === ".json" || ext === ".yaml" || ext === ".yml") extBadgeClass = "ext-json";
      else if (ext === ".py") extBadgeClass = "ext-py";

      fileRow.innerHTML = `
        <svg class="tree-file-icon ${extBadgeClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="node-name">${escapeHtml(node.name)}</span>
      `;

      fileRow.addEventListener("click", () => {
        openFileByPath(relPath);
      });

      li.appendChild(fileRow);
    }

    ul.appendChild(li);
  }
  return ul;
}

// ============================================================
// 4. File Management & Multi-Tab System
// ============================================================

async function openFileByPath(relPath) {
  if (!relPath) return;

  try {
    if (!openFiles.has(relPath)) {
      const res = await fetch(`/api/project/file?path=${encodeURIComponent(relPath)}`);
      if (!res.ok) throw new Error(`Could not load file: ${relPath}`);
      const data = await res.json();

      openFiles.set(relPath, {
        path: relPath,
        name: data.name || relPath.split("/").pop() || relPath,
        content: data.content,
        original: data.content,
        language: data.language || detectLanguage(relPath),
        dirty: false,
      });
    }

    activeFilePath = relPath;
    const fileData = openFiles.get(relPath);

    // Update Monaco Editor Model
    if (monacoEditor && window.monaco) {
      let model = monaco.editor.getModels().find((m) => m.uri.path === `/${relPath}`);
      if (!model) {
        model = monaco.editor.createModel(
          fileData.content,
          fileData.language,
          monaco.Uri.parse(`file:///${relPath}`)
        );
      } else {
        model.setValue(fileData.content);
      }
      monacoEditor.setModel(model);

      if (monacoDiffEditor) {
        const originalModel = monaco.editor.createModel(fileData.original, fileData.language);
        monacoDiffEditor.setModel({ original: originalModel, modified: model });
      }
    } else {
      const fallbackTa = document.getElementById("fallback-code-editor");
      if (fallbackTa) fallbackTa.value = fileData.content;
    }

    // Update UI elements
    renderEditorTabs();
    highlightActiveFileInTree();

    // Status bar path
    const pathStatusEl = document.getElementById("active-file-path-status");
    if (pathStatusEl) pathStatusEl.textContent = `📄 ${relPath}`;

  } catch (err) {
    console.error("Open file error:", err);
  }
}

function detectLanguage(filepath) {
  const ext = filepath.split(".").pop()?.toLowerCase();
  const map = {
    js: "javascript",
    mjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    py: "python",
    yaml: "yaml",
    yml: "yaml",
  };
  return map[ext] || "plaintext";
}

function renderEditorTabs() {
  const container = document.getElementById("tabs-scroll-container") || document.getElementById("editor-tabs-bar");
  if (!container) return;

  container.innerHTML = "";
  for (const [path, file] of openFiles.entries()) {
    const tab = document.createElement("div");
    tab.className = `editor-tab ${path === activeFilePath ? "active" : ""} ${file.dirty ? "dirty" : ""}`;
    tab.innerHTML = `
      <span class="tab-title">${escapeHtml(file.name)}</span>
      <span class="tab-dirty-indicator">●</span>
      <button class="tab-close" onclick="closeEditorTab(event, '${escapeHtml(path)}')">&times;</button>
    `;
    tab.addEventListener("click", () => openFileByPath(path));
    container.appendChild(tab);
  }
}

function closeEditorTab(event, path) {
  if (event) event.stopPropagation();
  openFiles.delete(path);

  if (activeFilePath === path) {
    const remaining = Array.from(openFiles.keys());
    if (remaining.length > 0) {
      openFileByPath(remaining[remaining.length - 1]);
    } else {
      activeFilePath = null;
      if (monacoEditor) {
        monacoEditor.setValue("/* No file open */");
      }
      const fallbackTa = document.getElementById("fallback-code-editor");
      if (fallbackTa) fallbackTa.value = "/* No file open */";
      const pathStatusEl = document.getElementById("active-file-path-status");
      if (pathStatusEl) pathStatusEl.textContent = "Ready";
    }
  }
  renderEditorTabs();
  highlightActiveFileInTree();
}

function highlightActiveFileInTree() {
  document.querySelectorAll(".tree-node.file").forEach((el) => {
    if (el.dataset.path === activeFilePath) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
}

async function saveActiveFile() {
  if (!activeFilePath || !openFiles.has(activeFilePath)) return;

  const fileData = openFiles.get(activeFilePath);
  let currentContent = fileData.content;
  if (monacoEditor) {
    currentContent = monacoEditor.getValue();
  } else {
    const ta = document.getElementById("fallback-code-editor");
    if (ta) currentContent = ta.value;
  }

  try {
    const res = await fetch("/api/project/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: activeFilePath,
        content: currentContent,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    fileData.original = currentContent;
    fileData.content = currentContent;
    fileData.dirty = false;
    renderEditorTabs();

    appendTerminalOutput(`[Saved] ${activeFilePath} successfully.`, "stdout");
    refreshLivePreview();
    refreshGitStatus();
  } catch (err) {
    alert(`Failed to save file: ${err.message}`);
  }
}

function toggleDiffMode() {
  const nextMode = activeEditorMode === "diff" ? "editor" : "diff";
  activeEditorMode = nextMode;
  
  const editorEl = document.getElementById("monaco-editor-container");
  const diffEl = document.getElementById("monaco-diff-container");
  const btn = document.getElementById("btn-toggle-diff");

  if (nextMode === "diff") {
    editorEl?.classList.add("hidden");
    diffEl?.classList.remove("hidden");
    btn?.classList.add("active");
  } else {
    editorEl?.classList.remove("hidden");
    diffEl?.classList.add("hidden");
    btn?.classList.remove("active");
  }
}

function toggleSplitPreview() {
  const rightPanel = document.getElementById("right-assistant-preview");
  const btn = document.getElementById("btn-toggle-split-preview");
  if (rightPanel) {
    const isHidden = rightPanel.classList.toggle("hidden");
    btn?.classList.toggle("active", !isHidden);
  }
}

// ============================================================
// 5. Workspace Switcher Modal
// ============================================================

function openProjectModal() {
  const modal = document.getElementById("project-modal");
  if (modal) {
    modal.classList.remove("hidden");
    fetchRecentProjects();
  }
}

function closeProjectModal() {
  const modal = document.getElementById("project-modal");
  if (modal) modal.classList.add("hidden");
}

async function fetchRecentProjects() {
  try {
    const res = await fetch("/api/project/recent");
    if (!res.ok) return;
    const data = await res.json();
    renderRecentProjectsList(data.recent || []);
  } catch (err) {
    console.error("Failed to fetch recent workspaces", err);
  }
}

function renderRecentProjectsList(projects) {
  const container = document.getElementById("recent-projects-list");
  if (!container) return;

  if (projects.length === 0) {
    container.innerHTML = `<div class="sidebar-empty">No other registered workspaces found.</div>`;
    return;
  }

  let html = "";
  for (const p of projects) {
    const isCurrent = currentProject && currentProject.path === p;
    const baseName = p.split("\\").pop() || p.split("/").pop() || p;
    html += `
      <div class="recent-project-row ${isCurrent ? 'active' : ''}" onclick="switchProjectWorkspace('${escapeHtml(p)}')">
        <div class="row-left">
          <svg class="svg-inline svg-accent-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
          <span class="project-basename font-bold">${escapeHtml(baseName)}</span>
          ${isCurrent ? '<span class="status-pill pill-success" style="font-size: 0.65rem; padding: 1px 4px;">ACTIVE</span>' : ''}
        </div>
        <div class="project-fullpath">${escapeHtml(p)}</div>
      </div>
    `;
  }
  container.innerHTML = html;
}

async function switchProjectWorkspace(path) {
  try {
    const res = await fetch("/api/project/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error("Failed to switch workspace");
    closeProjectModal();
    openFiles.clear();
    await loadActiveProject();
    await refreshProjectTree();
    refreshLivePreview();
    
    // Open starter file in new workspace
    openFileByPath("style.css").catch(() => {
      openFileByPath("index.html").catch(() => {});
    });
  } catch (err) {
    alert("Switch workspace failed: " + err.message);
  }
}

async function promptNewFile() {
  const filename = prompt("Enter new file path (e.g. components/Button.tsx or demo.css):");
  if (!filename || !filename.trim()) return;

  try {
    const res = await fetch("/api/project/file/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filename.trim(), content: "/* New file created */\n" }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to create file");
    }
    await refreshProjectTree();
    openFileByPath(filename.trim());
  } catch (err) {
    alert("Create file failed: " + err.message);
  }
}

async function promptNewFolder() {
  const foldername = prompt("Enter new folder name (e.g. src/utils):");
  if (!foldername || !foldername.trim()) return;

  try {
    await fetch("/api/project/file/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: `${foldername.trim()}/.gitkeep`, content: "" }),
    });
    await refreshProjectTree();
  } catch (err) {
    alert("Create folder failed: " + err.message);
  }
}

// ============================================================
// 6. Activity Bar & Navigation
// ============================================================

function switchActivityTab(tabName) {
  activeActivityTab = tabName;

  document.querySelectorAll(".activity-icon-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`act-btn-${tabName}`);
  if (activeBtn) activeBtn.classList.add("active");

  document.querySelectorAll(".sidebar-view-panel").forEach((panel) => {
    panel.classList.remove("active");
  });
  const activePanel = document.getElementById(`sidebar-${tabName}`);
  if (activePanel) activePanel.classList.add("active");

  if (tabName === "git") refreshGitStatus();
  if (tabName === "security") fetchPendingApprovals();
  if (tabName === "preview") switchRightTab("preview");
  if (tabName === "assistant") switchRightTab("assistant");
}

// ============================================================
// 7. Codebase Search Engine
// ============================================================

function handleSearchKeyDown(event) {
  if (event.key === "Enter") {
    execCodebaseSearch();
  }
}

async function execCodebaseSearch() {
  const input = document.getElementById("codebase-search-input");
  const container = document.getElementById("search-results-container");
  if (!input || !container) return;

  const query = input.value.trim();
  if (!query) return;

  container.innerHTML = `<div class="sidebar-empty">Searching codebase for "${escapeHtml(query)}"...</div>`;

  try {
    const res = await fetch(`/api/project/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Search error: ${res.status}`);
    const data = await res.json();
    const results = data.results || [];

    if (results.length === 0) {
      container.innerHTML = `<div class="sidebar-empty">No matching pattern found.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="search-summary">Found ${results.length} matches:</div>
      ${results.map((r) => `
        <div class="search-result-item" onclick="openFileByPath('${escapeHtml(r.file)}')">
          <div class="search-res-file">${escapeHtml(r.file)} <span class="search-line-tag">:${r.line}</span></div>
          <div class="search-res-snippet">${escapeHtml(r.text)}</div>
        </div>
      `).join("")}
    `;
  } catch (err) {
    container.innerHTML = `<div class="sidebar-empty" style="color: #ff3366;">${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================
// 8. Git & Version Control
// ============================================================

async function refreshGitStatus() {
  try {
    const res = await fetch("/api/git/status");
    if (!res.ok) return;
    const data = await res.json();

    const branchEl = document.getElementById("git-branch-name");
    const statusBranchEl = document.getElementById("git-status-branch");
    const badgeEl = document.getElementById("git-badge");
    const container = document.getElementById("git-changed-files");

    const branch = data.branch || "main";
    if (branchEl) branchEl.textContent = branch;
    if (statusBranchEl) statusBranchEl.innerHTML = `<svg class="svg-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg> ${escapeHtml(branch)}`;

    const files = data.files || [];
    if (badgeEl) {
      if (files.length > 0) {
        badgeEl.textContent = files.length;
        badgeEl.classList.remove("hidden");
      } else {
        badgeEl.classList.add("hidden");
      }
    }

    if (!container) return;

    if (files.length === 0) {
      container.innerHTML = `<div class="sidebar-empty">No modified files. Working tree clean.</div>`;
      return;
    }

    container.innerHTML = files.map((f) => `
      <div class="git-file-row" onclick="openFileByPath('${escapeHtml(f.path)}')">
        <span class="git-status-${(f.status || "M").toLowerCase()}">${escapeHtml(f.status || "M")}</span>
        <span class="git-filename" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span>
      </div>
    `).join("");
  } catch (err) {
    console.warn("Failed to refresh git status", err);
  }
}

// ============================================================
// 9. Zero-Trust Approvals & Policy Governor
// ============================================================

async function fetchPendingApprovals() {
  try {
    const res = await fetch("/api/approvals");
    if (!res.ok) return;
    const data = await res.json();
    const approvals = data.approvals || [];

    const badge = document.getElementById("security-badge");
    const countTag = document.getElementById("pending-approvals-count");
    const container = document.getElementById("pending-approvals-container");

    if (badge) {
      if (approvals.length > 0) {
        badge.textContent = approvals.length;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }

    if (countTag) {
      countTag.textContent = `${approvals.length} Pending`;
    }

    if (!container) return;

    if (approvals.length === 0) {
      container.innerHTML = `<div class="sidebar-empty">No actions currently requiring operator authorization.</div>`;
      return;
    }

    container.innerHTML = approvals.map((a) => `
      <div class="sidebar-approval-card">
        <div class="approval-card-title">${escapeHtml(a.toolName || a.tool)}</div>
        <div class="approval-card-meta">Risk: ${escapeHtml(a.riskLevel || "MEDIUM")} · Expires in ${Math.round((a.expiresAt - Date.now()) / 1000)}s</div>
        <div class="approval-card-reason">${escapeHtml(a.reason || "Action requires human operator sign-off")}</div>
        <div class="approval-card-btns">
          <button class="btn-card-approve" onclick="decideApproval('${escapeHtml(a.id)}', 'APPROVED')">Authorize</button>
          <button class="btn-card-reject" onclick="decideApproval('${escapeHtml(a.id)}', 'REJECTED')">Reject</button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.warn("fetchPendingApprovals error", err);
  }
}

async function decideApproval(id, decision) {
  try {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) throw new Error("Decision rejected by server");
    await fetchPendingApprovals();
    await fetchAuditLogs();
  } catch (err) {
    alert("Approval decision failed: " + err.message);
  }
}

// ============================================================
// 10. Bottom Integrated Console (Terminal / Audit / Scenarios)
// ============================================================

function switchBottomTab(tabName) {
  activeBottomTab = tabName;

  document.querySelectorAll(".panel-tab-btn").forEach((btn) => btn.classList.remove("active"));
  document.querySelectorAll(".panel-view-content").forEach((panel) => panel.classList.remove("active"));

  const btn = document.getElementById(`tab-btn-${tabName}`);
  if (btn) btn.classList.add("active");

  const panel = document.getElementById(`panel-view-${tabName}`);
  if (panel) panel.classList.add("active");

  if (tabName === "audit") fetchAuditLogs();
  if (tabName === "scenarios") loadSecurityScenarios();
}

function toggleBottomPanel() {
  const panel = document.getElementById("bottom-panel");
  panel?.classList.toggle("collapsed");
}

function handleTerminalKeyDown(event) {
  if (event.key === "Enter") {
    const input = document.getElementById("terminal-input") || document.getElementById("terminal-cmd-input");
    const cmd = input?.value.trim();
    if (!cmd) return;

    terminalHistory.push(cmd);
    terminalHistoryIndex = terminalHistory.length;
    if (input) input.value = "";

    appendTerminalOutput(`$ ${cmd}`, "stdin");
    executeTerminalCommand(cmd);
  } else if (event.key === "ArrowUp") {
    const input = document.getElementById("terminal-input");
    if (terminalHistoryIndex > 0) {
      terminalHistoryIndex--;
      if (input) input.value = terminalHistory[terminalHistoryIndex];
    }
  } else if (event.key === "ArrowDown") {
    const input = document.getElementById("terminal-input");
    if (terminalHistoryIndex < terminalHistory.length - 1) {
      terminalHistoryIndex++;
      if (input) input.value = terminalHistory[terminalHistoryIndex];
    } else {
      terminalHistoryIndex = terminalHistory.length;
      if (input) input.value = "";
    }
  }
}

async function executeTerminalCommand(command) {
  try {
    const res = await fetch("/api/terminal/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const data = await res.json();
    if (data.stdout) appendTerminalOutput(data.stdout, "stdout");
    if (data.stderr) appendTerminalOutput(data.stderr, "stderr");
    if (data.exitCode !== 0 && data.exitCode !== undefined) {
      appendTerminalOutput(`Process exited with code ${data.exitCode}`, "error");
    }
  } catch (err) {
    appendTerminalOutput(`Command execution error: ${err.message}`, "error");
  }
}

function appendTerminalOutput(text, type = "stdout") {
  const container = document.getElementById("terminal-output");
  if (!container) return;

  const div = document.createElement("div");
  div.className = `terminal-line ${type}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function clearTerminalOutput() {
  const container = document.getElementById("terminal-output");
  if (container) {
    container.innerHTML = `<div class="terminal-line system">Console cleared.</div>`;
  }
}

async function fetchAuditLogs() {
  try {
    const res = await fetch("/api/audit");
    if (!res.ok) return;
    const data = await res.json();

    const tbody = document.getElementById("audit-table-body");
    const logs = data.auditLogs || data.records || [];

    if (tbody) {
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No audit events recorded yet. Zero-Trust active.</td></tr>`;
      } else {
        tbody.innerHTML = logs.slice(-30).reverse().map((log, idx) => {
          const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "--:--:--";
          const dec = (log.decision || log.verdict || "allow").toLowerCase();
          const badgeClass = dec === "allow" ? "pill-success" : (dec === "escalate" || dec === "approval_required" ? "pill-warning" : "pill-danger");
          const seq = log.sequenceNumber ?? (logs.length - idx);
          const hmac = log.hmacSignature || log.hash || "valid_sha256";
          return `
            <tr>
              <td>#${seq}</td>
              <td>${timeStr}</td>
              <td><span class="tool-tag">${escapeHtml(log.tool || log.action || "read_file")}</span></td>
              <td class="res-col" title="${escapeHtml(log.resource || log.path || "")}">${escapeHtml((log.resource || log.path || "").substring(0, 35))}</td>
              <td><span class="status-pill ${badgeClass}">${dec.toUpperCase()}</span></td>
              <td><code class="hash-tag">${escapeHtml(hmac.substring(0, 10))}...</code></td>
            </tr>
          `;
        }).join("");
      }
    }
  } catch (err) {
    console.error("Failed to fetch audit logs", err);
  }
}

function runAuditVerification() {
  fetch("/api/audit/verify")
    .then((r) => r.json())
    .then((data) => {
      const statusEl = document.getElementById("audit-verify-status");
      if (statusEl) {
        statusEl.textContent = data.valid || data.verified
          ? `Cryptographic SHA-256 Ledger: VERIFIED (${data.totalRecords || data.recordsChecked || "stored"} events)`
          : `Audit Chain Warning: Tamper detected!`;
        statusEl.style.color = (data.valid || data.verified) ? "#00ff88" : "#ff3366";
      }
      alert((data.valid || data.verified) ? "✅ Audit Chain Integrity Verified: All SHA-256 HMAC signatures valid." : "⚠️ Audit Chain Tamper Detected!");
    })
    .catch((err) => alert("Audit check failed: " + err.message));
}

async function runTamperDemo() {
  switchBottomTab("audit");
  try {
    const res = await fetch("/api/audit/tamper-demo", { method: "POST" });
    const data = await res.json();
    alert(`🧪 Tamper Simulation Alert:\n\n${data.message || data.error}\n\nExpected Hash: ${data.expectedHash || "valid"}\nActual Hash:   ${data.actualHash || "corrupted"}`);
    await fetchAuditLogs();
  } catch (err) {
    alert("Tamper demo error: " + err.message);
  }
}

async function loadSecurityScenarios() {
  const container = document.getElementById("scenarios-grid");
  if (!container) return;

  try {
    const res = await fetch("/api/scenarios");
    if (!res.ok) return;
    const data = await res.json();
    const scenarios = data.scenarios || [];

    container.innerHTML = scenarios.map((s) => {
      const riskClass = s.riskLevel === "CRITICAL" ? "pill-danger" : (s.riskLevel === "HIGH" ? "pill-warning" : "pill-success");
      return `
        <div class="scenario-card">
          <div class="scenario-header">
            <span class="scenario-title font-bold">${escapeHtml(s.title)}</span>
            <span class="status-pill ${riskClass}">${escapeHtml(s.riskLevel)}</span>
          </div>
          <p class="scenario-desc">${escapeHtml(s.description)}</p>
          <div class="scenario-prompt-box">
            <code>${escapeHtml(s.prompt)}</code>
          </div>
          <button class="btn-micro btn-accent" onclick="injectPrompt('${escapeHtml(s.prompt).replace(/'/g, "\\'")}')">
            Load into Assistant ⚡
          </button>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = `<div class="sidebar-empty">Failed to load scenarios: ${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================
// 11. Right Split Pane (AI Assistant & Live Preview)
// ============================================================

function switchRightTab(tab) {
  activeRightTab = tab;
  const previewTab = document.getElementById("right-tab-preview");
  const assistantTab = document.getElementById("right-tab-assistant");
  const previewView = document.getElementById("right-view-preview");
  const assistantView = document.getElementById("right-view-assistant");

  if (tab === "preview") {
    previewTab?.classList.add("active");
    assistantTab?.classList.remove("active");
    previewView?.classList.add("active");
    assistantView?.classList.remove("active");
    refreshLivePreview();
  } else {
    assistantTab?.classList.add("active");
    previewTab?.classList.remove("active");
    assistantView?.classList.add("active");
    previewView?.classList.remove("active");
    document.getElementById("prompt-textarea")?.focus();
  }
}

function setPreviewViewport(viewport) {
  const iframeWrapper = document.getElementById("preview-iframe-wrapper");
  const btnD = document.getElementById("preview-viewport-desktop");
  const btnT = document.getElementById("preview-viewport-tablet");
  const btnM = document.getElementById("preview-viewport-mobile");

  btnD?.classList.toggle("active", viewport === "desktop");
  btnT?.classList.toggle("active", viewport === "tablet");
  btnM?.classList.toggle("active", viewport === "mobile");

  if (iframeWrapper) {
    if (viewport === "mobile") {
      iframeWrapper.style.maxWidth = "375px";
    } else if (viewport === "tablet") {
      iframeWrapper.style.maxWidth = "768px";
    } else {
      iframeWrapper.style.maxWidth = "100%";
    }
  }
}

function refreshLivePreview() {
  const iframe = document.getElementById("preview-frame");
  if (iframe) {
    iframe.src = "/preview/index.html?t=" + Date.now();
  }
}

function injectPrompt(text) {
  switchRightTab("assistant");
  const ta = document.getElementById("prompt-textarea");
  if (ta) {
    ta.value = text;
    ta.focus();
  }
}

function handlePromptSubmit(event) {
  if (event) event.preventDefault();
  const ta = document.getElementById("prompt-textarea");
  const promptText = ta?.value.trim();
  if (!promptText) return;

  const chatContainer = document.getElementById("chat-messages-container");
  if (chatContainer) {
    const userDiv = document.createElement("div");
    userDiv.className = "chat-msg user-msg";
    userDiv.innerHTML = `
      <div class="msg-header">
        <span class="msg-author">OPERATOR</span>
        <span class="msg-time">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="msg-text">${escapeHtml(promptText)}</div>
    `;
    chatContainer.appendChild(userDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  if (ta) ta.value = "";

  const sendBtn = document.getElementById("send-prompt-btn");
  if (sendBtn) sendBtn.disabled = true;

  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": "operator" },
    body: JSON.stringify({ prompt: promptText, activeFile: activeFilePath || undefined }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (chatContainer) {
        const aiDiv = document.createElement("div");
        aiDiv.className = "chat-msg assistant-msg";
        let stepsHtml = "";
        if (data.steps && data.steps.length > 0) {
          stepsHtml = `<div class="msg-steps-box">` + data.steps.map(s => `<div class="msg-step-row"><span class="step-num">Step ${s.stepNumber || 1}:</span> ${escapeHtml(s.tool || s.toolName || "Reasoning")}</div>`).join("") + `</div>`;
        }
        let verdictBadge = "";
        if (data.decision || data.status) {
          const action = data.decision?.action || (data.status === 'approval_required' ? 'approval_required' : data.status === 'denied' ? 'deny' : 'allow');
          const badgeClass = action === 'allow' ? 'pill-success' : action === 'approval_required' ? 'pill-warning' : 'pill-danger';
          verdictBadge = `<div class="msg-verdict ${badgeClass}">VERDICT: ${action.toUpperCase()} · ${escapeHtml(data.decision?.reason || data.reason || "")}</div>`;
        }
        aiDiv.innerHTML = `
          <div class="msg-header">
            <span class="msg-author">NOMOS AI AGENT</span>
            <span class="msg-time">${new Date().toLocaleTimeString()}</span>
          </div>
          <div class="msg-text">${formatMarkdown(data.finalResponse || data.response || data.message || "Action processed.")}</div>
          ${verdictBadge}
          ${stepsHtml}
        `;
        chatContainer.appendChild(aiDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      refreshLivePreview();
      refreshProjectTree();
      refreshGitStatus();
      if (data.steps && data.steps.length > 0) {
        for (const step of data.steps) {
          const filePath = step.arguments?.path;
          if (filePath && typeof filePath === "string") {
            openFileByPath(filePath);
          }
        }
      } else if (activeFilePath) {
        openFiles.delete(activeFilePath);
        openFileByPath(activeFilePath);
      }
      fetchPendingApprovals();
      fetchAuditLogs();
    })
    .catch((err) => {
      if (chatContainer) {
        const errDiv = document.createElement("div");
        errDiv.className = "chat-msg error-msg";
        errDiv.innerHTML = `<div class="msg-text">Error: ${escapeHtml(err.message)}</div>`;
        chatContainer.appendChild(errDiv);
      }
    })
    .finally(() => {
      if (sendBtn) sendBtn.disabled = false;
    });
}

// ============================================================
// 12. Global Helpers & Formatting
// ============================================================

function handleGlobalShortcuts(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveActiveFile();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "E") {
    e.preventDefault();
    switchActivityTab("explorer");
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
    e.preventDefault();
    switchActivityTab("search");
    document.getElementById("codebase-search-input")?.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "G") {
    e.preventDefault();
    switchActivityTab("git");
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "A") {
    e.preventDefault();
    switchActivityTab("assistant");
    document.getElementById("prompt-textarea")?.focus();
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Headers
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
  // Inline Code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Code Blocks
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  // Bullet lists
  html = html.replace(/^\- (.*$)/gim, "<li>$1</li>");
  // Numbered lists
  html = html.replace(/^\d+\. (.*$)/gim, "<li>$1</li>");
  return html;
}
