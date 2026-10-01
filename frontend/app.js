/**
 * PNG5 AI Local IDE — Complete Integrated Frontend Application Engine
 * 
 * Features:
 * - Monaco Editor with multi-tab workspace, syntax highlighting, and live diff mode
 * - File tree explorer with live directory creation, deletion, and file selection
 * - Codebase pattern search across active project workspace
 * - Git version control status, diff inspection, staging, and rollback
 * - Conversational AI Assistant with prompt categorization, tool step visualization, and active context
 * - Zero-Trust Governor Human Approval Modal & sidebar with 5-minute tickets
 * - Live Preview with hot reload, device viewports (desktop/tablet/mobile), and DOM inspector
 * - Controlled interactive terminal execution console
 * - Cryptographic SHA-256 audit ledger and blockchain-style verification
 * - Real-time Server-Sent Events (SSE) telemetry stream
 */

// Global State
let monacoEditor = null;
let monacoDiffEditor = null;
let currentProject = { name: "workspace", path: "", framework: "Static" };
let openFiles = new Map(); // path -> { content, original, language, dirty }
let activeFilePath = null;
let activeEditorMode = "editor"; // "editor" | "diff"
let activeActivityTab = "explorer";
let activeBottomTab = "terminal";
let activeApprovalId = null;
let activePromptForApproval = null;
let inspectedElement = null;
let isInspectorActive = false;
let terminalHistory = [];
let terminalHistoryIndex = -1;

// ============================================================
// Initialization & Monaco Loader
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  initializeMonaco();
  await loadActiveProject();
  await refreshProjectTree();
  await refreshGitStatus();
  await fetchPendingApprovals();
  await fetchAuditLogs();
  initSSEStream();

  // Keyboard Shortcuts
  window.addEventListener("keydown", handleGlobalShortcuts);

  // Element Inspector PostMessage Listener
  window.addEventListener("message", handleInspectorMessage);

  // Periodic Polling Fallback
  setInterval(fetchPendingApprovals, 5000);
  setInterval(refreshGitStatus, 10000);
});

function initializeMonaco() {
  if (typeof require === "undefined") {
    console.warn("Monaco loader not found, falling back to basic textarea");
    return;
  }

  require.config({
    paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" },
  });

  require(["vs/editor/editor.main"], () => {
    // Standard Code Editor
    const editorContainer = document.getElementById("monaco-editor-container");
    if (editorContainer) {
      monacoEditor = monaco.editor.create(editorContainer, {
        value: "/* Welcome to PNG5 Governed AI Local IDE */\n// Select a file from the explorer on the left or ask the AI assistant.",
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
    }

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

    // Open default starter file if available
    openFileByPath("style.css").catch(() => {
      openFileByPath("index.html").catch(() => {});
    });
  });
}

// ============================================================
// Real-time SSE Telemetry Stream
// ============================================================

function initSSEStream() {
  try {
    const eventSource = new EventSource("/api/stream");

    eventSource.addEventListener("action_event", (e) => {
      const data = JSON.parse(e.data);
      fetchAuditLogs();
      fetchPendingApprovals();
    });

    eventSource.addEventListener("approval_event", () => {
      fetchPendingApprovals();
      fetchAuditLogs();
    });

    eventSource.addEventListener("file_saved", (e) => {
      const data = JSON.parse(e.data);
      reloadLivePreview();
      refreshGitStatus();
      if (data.path === activeFilePath && openFiles.has(data.path)) {
        // Refresh local cache if modified externally
      }
    });

    eventSource.addEventListener("tree_updated", () => {
      refreshProjectTree();
      refreshGitStatus();
    });

    eventSource.addEventListener("project_changed", (e) => {
      const data = JSON.parse(e.data);
      loadActiveProject();
      refreshProjectTree();
      reloadLivePreview();
    });
  } catch (err) {
    console.warn("SSE connection deferred", err);
  }
}

// ============================================================
// Project Workspace & File Explorer
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

      // Auto-expand top level or important folders
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
// File Management & Monaco Tab System
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

    // Update Monaco Model
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
    }

    // Update UI elements
    renderEditorTabs();
    highlightActiveFileInTree();

    // Status bar info
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
  const container = document.getElementById("tabs-scroll-container") || document.getElementById("editor-tabs-container");
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

// ============================================================
// Workspace Switcher Modal & Operations
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
          ${isCurrent ? '<span class="pill-success" style="font-size: 0.65rem; padding: 1px 4px;">ACTIVE</span>' : ''}
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
    await loadActiveProject();
    await refreshProjectTree();
    
    // Open default file in new workspace
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
    // Create placeholder inside folder to register directory
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
      updateActiveFileBreadcrumbs();
    }
  }
  renderEditorTabs();
}

async function saveActiveFile() {
  if (!activeFilePath || !openFiles.has(activeFilePath)) return;

  const fileData = openFiles.get(activeFilePath);
  const currentContent = monacoEditor ? monacoEditor.getValue() : fileData.content;

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
    reloadLivePreview();
    refreshGitStatus();
  } catch (err) {
    alert(`Failed to save file: ${err.message}`);
  }
}

function updateActiveFileBreadcrumbs() {
  const bc = document.getElementById("editor-breadcrumb-text");
  if (bc) {
    bc.textContent = activeFilePath || "No file open";
  }
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

function setEditorViewMode(mode) {
  activeEditorMode = mode;
  const editorEl = document.getElementById("monaco-editor-container");
  const diffEl = document.getElementById("monaco-diff-container");
  const btnEditor = document.getElementById("btn-mode-editor");
  const btnDiff = document.getElementById("btn-mode-diff");

  if (mode === "diff") {
    editorEl?.classList.add("hidden");
    diffEl?.classList.remove("hidden");
    btnEditor?.classList.remove("active");
    btnDiff?.classList.add("active");
  } else {
    editorEl?.classList.remove("hidden");
    diffEl?.classList.add("hidden");
    btnEditor?.classList.add("active");
    btnDiff?.classList.remove("active");
  }
}

// ============================================================
// Activity Bar & Sidebar Navigation
// ============================================================

function switchActivityTab(tabName) {
  activeActivityTab = tabName;

  // Update Activity bar icons
  document.querySelectorAll(".activity-icon-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`act-btn-${tabName}`);
  if (activeBtn) activeBtn.classList.add("active");

  // If switched to preview tab
  if (tabName === "preview") {
    switchRightTab("preview");
    // Ensure the explorer sidebar stays open and visible
    document.querySelectorAll(".sidebar-view-panel").forEach((panel) => {
      panel.classList.remove("active");
    });
    document.getElementById("sidebar-explorer")?.classList.add("active");
    return;
  }

  // If switched to assistant tab
  if (tabName === "assistant") {
    switchRightTab("assistant");
    document.querySelectorAll(".sidebar-view-panel").forEach((panel) => {
      panel.classList.remove("active");
    });
    document.getElementById("sidebar-explorer")?.classList.add("active");
    return;
  }

  // Update Sidebar Panels
  document.querySelectorAll(".sidebar-view-panel").forEach((panel) => {
    panel.classList.remove("active");
  });
  const activePanel = document.getElementById(`sidebar-${tabName}`);
  if (activePanel) activePanel.classList.add("active");

  if (tabName === "git") refreshGitStatus();
  if (tabName === "security") fetchPendingApprovals();
}

function switchRightTab(tabName) {
  document.querySelectorAll(".right-tab-btn").forEach((btn) => btn.classList.remove("active"));
  document.querySelectorAll(".right-subpanel").forEach((panel) => panel.classList.remove("active"));

  const btn = document.getElementById(`tab-btn-${tabName}`);
  const panel = document.getElementById(`right-panel-${tabName}`);
  if (btn) btn.classList.add("active");
  if (panel) panel.classList.add("active");

  // Highlight preview button in toolbar if preview active
  const btnTogglePrev = document.getElementById("btn-toggle-preview");
  if (btnTogglePrev) {
    btnTogglePrev.classList.toggle("active", tabName === "preview");
  }

  if (tabName === "preview") {
    reloadLivePreview();
  }
}

function switchBottomTab(tabName) {
  activeBottomTab = tabName;
  document.querySelectorAll(".panel-tab-btn").forEach((btn) => btn.classList.remove("active"));
  document.querySelectorAll(".bottom-subpanel").forEach((panel) => panel.classList.remove("active"));

  const btns = document.querySelectorAll(".panel-tab-btn");
  if (tabName === "terminal" && btns[0]) btns[0].classList.add("active");
  if (tabName === "diagnostics" && btns[1]) btns[1].classList.add("active");
  if (tabName === "audit" && btns[2]) btns[2].classList.add("active");

  const panel = document.getElementById(`bottom-${tabName}`);
  if (panel) panel.classList.add("active");

  if (tabName === "audit") fetchAuditLogs();
}

function toggleBottomPanel() {
  const panel = document.getElementById("bottom-panel");
  panel?.classList.toggle("collapsed");
}

// ============================================================
// Codebase Search Engine
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

  container.innerHTML = `<div class="sidebar-loading">Searching codebase for "${escapeHtml(query)}"...</div>`;

  try {
    const res = await fetch(`/api/project/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      container.innerHTML = `<div class="sidebar-empty">No matches found for "${escapeHtml(query)}"</div>`;
      return;
    }

    let html = `<div class="search-summary">${data.total} results found:</div><div class="search-items-list">`;
    for (const r of data.results) {
      html += `
        <div class="search-result-item" onclick="openFileByPath('${escapeHtml(r.file)}')">
          <div class="search-res-file">📄 ${escapeHtml(r.file)} <span class="search-line-tag">:${r.line}</span></div>
          <div class="search-res-snippet"><code>${escapeHtml(r.text)}</code></div>
        </div>
      `;
    }
    html += `</div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="sidebar-empty" style="color: #ef4444;">Search failed: ${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================
// Git & Source Control
// ============================================================

async function refreshGitStatus() {
  try {
    const res = await fetch("/api/git/status");
    const data = await res.json();

    const branchTag = document.getElementById("git-branch-tag");
    const sbBranch = document.getElementById("sb-git-branch");
    const gitBadge = document.getElementById("git-badge");
    const container = document.getElementById("git-changes-list");

    if (branchTag) branchTag.textContent = `🌿 ${data.branch || "main"}`;
    if (sbBranch) sbBranch.textContent = `🌿 ${data.branch || "main"}`;

    const total = (data.modified?.length || 0) + (data.untracked?.length || 0);
    if (gitBadge) {
      if (total > 0) {
        gitBadge.textContent = total;
        gitBadge.classList.remove("hidden");
      } else {
        gitBadge.classList.add("hidden");
      }
    }

    if (!container) return;

    if (total === 0) {
      container.innerHTML = `<div class="sidebar-empty">No uncommitted changes. Working tree clean.</div>`;
      return;
    }

    let html = `<div class="git-header-row"><span>MODIFIED FILES (${total})</span></div>`;

    for (const m of data.modified || []) {
      html += `
        <div class="git-file-row">
          <span class="git-status-m">M</span>
          <span class="git-filename" onclick="openFileByPath('${escapeHtml(m)}'); setEditorViewMode('diff');">${escapeHtml(m)}</span>
          <button class="btn-git-action" title="Discard Changes" onclick="discardGitFile('${escapeHtml(m)}')">↩</button>
        </div>
      `;
    }

    for (const u of data.untracked || []) {
      html += `
        <div class="git-file-row">
          <span class="git-status-u">U</span>
          <span class="git-filename" onclick="openFileByPath('${escapeHtml(u)}')">${escapeHtml(u)}</span>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch {
    // Ignore error
  }
}

async function discardGitFile(path) {
  if (!confirm(`Discard changes in ${path}? This cannot be undone.`)) return;
  try {
    await fetch("/api/git/discard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    refreshGitStatus();
    openFiles.delete(path);
    openFileByPath(path);
  } catch (err) {
    alert("Discard failed: " + err.message);
  }
}

async function discardAllChanges() {
  if (!confirm("Discard all uncommitted changes in workspace?")) return;
  try {
    const res = await fetch("/api/git/status");
    const data = await res.json();
    for (const file of data.modified || []) {
      await fetch("/api/git/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file }),
      });
    }
    refreshGitStatus();
  } catch (err) {
    alert("Failed: " + err.message);
  }
}

// ============================================================
// AI Assistant & Chat Engine
// ============================================================

function setAiPrompt(text) {
  const textarea = document.getElementById("ai-prompt-input");
  if (textarea) {
    textarea.value = text;
    textarea.focus();
  }
}

function handleAiInputKey(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleAiPromptSubmit(event);
  }
}

function clearAiChat() {
  const viewport = document.getElementById("ai-chat-viewport");
  if (viewport) {
    viewport.innerHTML = `
      <div class="ai-bubble assistant">
        <div class="bubble-avatar">🛡️</div>
        <div class="bubble-content">
          <div class="bubble-header">
            <strong>PNG5 AI Coding Agent</strong>
            <span class="bubble-time">Ready</span>
          </div>
          <p>Chat cleared. Ready for your next coding task.</p>
        </div>
      </div>
    `;
  }
}

async function handleAiPromptSubmit(event, approvalId = null) {
  if (event) event.preventDefault();

  const textarea = document.getElementById("ai-prompt-input");
  const promptText = approvalId ? activePromptForApproval : textarea?.value.trim();
  if (!promptText) return;

  const btnText = document.getElementById("ai-btn-text");
  const spinner = document.getElementById("ai-spinner");
  const btn = document.getElementById("btn-submit-ai");

  if (!approvalId) {
    appendAiMessage("user", promptText);
    if (textarea) textarea.value = "";
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = "Processing...";
  if (spinner) spinner.classList.remove("hidden");

  const msgId = `ai-msg-${Date.now()}`;
  appendAiPlaceholder(msgId);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": "operator",
      },
      body: JSON.stringify({
        prompt: promptText,
        approvalId: approvalId || null,
        activeFile: activeFilePath || undefined,
        selectedElement: inspectedElement || undefined,
      }),
    });

    const data = await res.json();
    renderAiResponse(msgId, data);
    fetchPendingApprovals();
    fetchAuditLogs();
    refreshGitStatus();

    // If file was edited, reload in Monaco
    if (data.steps && data.steps.some((s) => s.tool === "edit_project_file" || s.tool === "create_project_file")) {
      for (const step of data.steps) {
        const filePath = step.arguments?.path;
        if (filePath) {
          openFiles.delete(filePath);
          openFileByPath(filePath);
        }
      }
      reloadLivePreview();
    }

    // If human approval required
    if (data.status === "approval_required" && data.approvalRequest) {
      showApprovalModal(data.approvalRequest, promptText);
    }
  } catch (err) {
    renderAiError(msgId, err.message || "Failed to communicate with AI server");
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "Generate ➔";
    if (spinner) spinner.classList.add("hidden");
  }
}

function appendAiMessage(role, text) {
  const container = document.getElementById("ai-chat-viewport");
  if (!container) return;

  const div = document.createElement("div");
  div.className = `ai-bubble ${role}`;
  div.innerHTML = `
    <div class="bubble-avatar">${role === "user" ? "👤" : "🛡️"}</div>
    <div class="bubble-content">
      <div class="bubble-header">
        <strong>${role === "user" ? "Operator" : "PNG5 AI Agent"}</strong>
        <span class="bubble-time">${new Date().toLocaleTimeString()}</span>
      </div>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendAiPlaceholder(id) {
  const container = document.getElementById("ai-chat-viewport");
  if (!container) return;

  const div = document.createElement("div");
  div.className = "ai-bubble assistant";
  div.id = id;
  div.innerHTML = `
    <div class="bubble-avatar">🤖</div>
    <div class="bubble-content">
      <div class="bubble-header">
        <strong>PNG5 AI Agent</strong>
        <span class="bubble-time">Evaluating Invariants...</span>
      </div>
      <div class="eval-spinner-row">
        <span class="spinner" style="margin-right: 8px;"></span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">Analyzing prompt risk & Governor policies...</span>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderAiResponse(id, data) {
  const el = document.getElementById(id);
  if (!el) return;

  const contentEl = el.querySelector(".bubble-content");
  let verdictBadge = "";

  if (data.status === "completed") {
    verdictBadge = `<span class="verdict-tag allow">ALLOW (Executed)</span>`;
  } else if (data.status === "approval_required") {
    verdictBadge = `<span class="verdict-tag escalate">ESCALATE (Approval Required)</span>`;
  } else if (data.status === "denied") {
    verdictBadge = `<span class="verdict-tag deny">DENY (Blocked by Policy)</span>`;
  }

  let stepsHtml = "";
  if (data.steps && data.steps.length > 0) {
    for (const s of data.steps) {
      const outputText = s.toolResult?.content?.[0]?.text || "";
      stepsHtml += `
        <div class="ai-tool-step-card">
          <div class="step-card-header">
            <span>Step ${s.stepNumber}: Tool <code>${escapeHtml(s.tool || "none")}</code></span>
            <span class="step-status ${s.status}">${s.status.toUpperCase()}</span>
          </div>
          <div class="step-thought">💡 ${escapeHtml(s.thought)}</div>
          ${outputText ? `<pre class="step-output">${escapeHtml(outputText)}</pre>` : ""}
        </div>
      `;
    }
  }

  contentEl.innerHTML = `
    <div class="bubble-header">
      <strong>PNG5 AI Agent</strong>
      ${verdictBadge}
      <span class="bubble-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="ai-markdown-body">${formatMarkdown(data.finalResponse)}</div>
    ${stepsHtml}
  `;

  const container = document.getElementById("ai-chat-viewport");
  if (container) container.scrollTop = container.scrollHeight;
}

function renderAiError(id, errText) {
  const el = document.getElementById(id);
  if (!el) return;
  const contentEl = el.querySelector(".bubble-content");
  contentEl.innerHTML = `
    <div class="bubble-header">
      <strong>System Error</strong>
      <span class="verdict-tag deny">ERROR</span>
    </div>
    <p style="color: #ef4444;">${escapeHtml(errText)}</p>
  `;
}

// ============================================================
// Zero-Trust Governor & Human Authorization Modal
// ============================================================

function showApprovalModal(approval, promptText) {
  activeApprovalId = approval.id;
  activePromptForApproval = promptText;

  const modal = document.getElementById("approval-modal");
  const body = document.getElementById("modal-body-content");
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="approval-field"><strong>Action Tool:</strong> <code>${escapeHtml(approval.tool)}</code></div>
    <div class="approval-field"><strong>Target Resource:</strong> <code>${escapeHtml(approval.target)}</code></div>
    <div class="approval-field"><strong>Risk Score:</strong> <span style="color: #f59e0b; font-weight: 700;">${(approval.riskScore * 100).toFixed(0)}%</span></div>
    <div class="approval-field"><strong>Policy Reason:</strong> ${escapeHtml(approval.reason)}</div>
    <div class="approval-field"><strong>Parameters:</strong></div>
    <pre class="approval-params-pre">${escapeHtml(JSON.stringify(approval.params, null, 2))}</pre>
    <p style="margin-top: 10px; font-size: 0.75rem; color: var(--text-muted);">
      Authorization token is cryptographically bound and valid for <strong>5 minutes</strong>.
    </p>
  `;

  modal.classList.remove("hidden");
}

function closeApprovalModal() {
  document.getElementById("approval-modal")?.classList.add("hidden");
}

async function handleModalDecision(decision) {
  if (!activeApprovalId) return;

  try {
    const res = await fetch(`/api/approvals/${activeApprovalId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewer: "operator" }),
    });

    closeApprovalModal();

    if (decision === "approved") {
      await handleAiPromptSubmit(null, activeApprovalId);
    } else {
      appendAiMessage("assistant", `🚫 Action **${activeApprovalId}** rejected by operator.`);
    }

    activeApprovalId = null;
    activePromptForApproval = null;
    fetchPendingApprovals();
  } catch (err) {
    alert("Approval error: " + err.message);
  }
}

async function fetchPendingApprovals() {
  try {
    const res = await fetch("/api/approvals");
    const data = await res.json();
    const pending = data.approvals || [];

    // Badges
    const sbCount = document.getElementById("sidebar-pending-count");
    const secBadge = document.getElementById("security-badge");
    const statusApprovals = document.getElementById("sb-approvals-count");

    if (sbCount) sbCount.textContent = `${pending.length} PENDING`;
    if (secBadge) {
      secBadge.textContent = pending.length;
      secBadge.classList.toggle("hidden", pending.length === 0);
    }
    if (statusApprovals) statusApprovals.textContent = `⚖️ ${pending.length} Approvals`;

    // Sidebar list
    const sidebarList = document.getElementById("sidebar-approvals-list");
    if (!sidebarList) return;

    if (pending.length === 0) {
      sidebarList.innerHTML = `<div class="sidebar-empty">No actions pending authorization.</div>`;
      return;
    }

    let html = "";
    for (const a of pending) {
      html += `
        <div class="sidebar-approval-card">
          <div class="approval-card-title"><code>${escapeHtml(a.tool)}</code> on <code>${escapeHtml(a.target)}</code></div>
          <div class="approval-card-meta">Risk: ${(a.riskScore * 100).toFixed(0)}% • ID: ${escapeHtml(a.id)}</div>
          <div class="approval-card-reason">${escapeHtml(a.reason)}</div>
          <div class="approval-card-btns">
            <button class="btn-card-approve" onclick="decideInlineApproval('${escapeHtml(a.id)}', 'approved')">Approve</button>
            <button class="btn-card-reject" onclick="decideInlineApproval('${escapeHtml(a.id)}', 'rejected')">Reject</button>
          </div>
        </div>
      `;
    }
    sidebarList.innerHTML = html;
  } catch {
    // Ignore error
  }
}

async function decideInlineApproval(id, decision) {
  try {
    await fetch(`/api/approvals/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewer: "operator" }),
    });
    fetchPendingApprovals();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// ============================================================
// Controlled Terminal Execution Panel
// ============================================================

function handleTerminalCommand(event) {
  const input = document.getElementById("terminal-cmd-input");
  if (!input) return;

  if (event.key === "Enter") {
    const cmd = input.value.trim();
    if (!cmd) return;

    terminalHistory.push(cmd);
    terminalHistoryIndex = terminalHistory.length;
    input.value = "";

    appendTerminalOutput(`❯ ${cmd}`, "stdin");
    executeTerminalCommand(cmd);
  } else if (event.key === "ArrowUp") {
    if (terminalHistoryIndex > 0) {
      terminalHistoryIndex--;
      input.value = terminalHistory[terminalHistoryIndex];
    }
  } else if (event.key === "ArrowDown") {
    if (terminalHistoryIndex < terminalHistory.length - 1) {
      terminalHistoryIndex++;
      input.value = terminalHistory[terminalHistoryIndex];
    } else {
      terminalHistoryIndex = terminalHistory.length;
      input.value = "";
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
    if (data.exitCode !== 0) {
      appendTerminalOutput(`Process exited with code ${data.exitCode}`, "error");
    }
  } catch (err) {
    appendTerminalOutput(`Execution error: ${err.message}`, "error");
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
    container.innerHTML = `<div class="terminal-line system">Terminal cleared.</div>`;
  }
}

async function runDiagnosticsTest(cmd) {
  switchBottomTab("diagnostics");
  const outputEl = document.getElementById("diagnostics-output");
  if (outputEl) {
    outputEl.innerHTML = `<div class="diagnostics-running"><span class="spinner"></span> Running <code>${escapeHtml(cmd)}</code>...</div>`;
  }

  try {
    const res = await fetch("/api/terminal/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    });
    const data = await res.json();

    if (outputEl) {
      outputEl.innerHTML = `
        <div class="diagnostics-result ${data.exitCode === 0 ? "success" : "failed"}">
          <h4>${data.exitCode === 0 ? "✅ Tests Passed" : "❌ Execution Failed"} (Exit code: ${data.exitCode})</h4>
          <pre>${escapeHtml(data.stdout || data.stderr || "No output returned")}</pre>
        </div>
      `;
    }
  } catch (err) {
    if (outputEl) {
      outputEl.innerHTML = `<div class="diagnostics-result failed"><h4>Error</h4><pre>${escapeHtml(err.message)}</pre></div>`;
    }
  }
}

// ============================================================
// Cryptographic Audit Ledger
// ============================================================

async function fetchAuditLogs() {
  try {
    const res = await fetch("/api/audit");
    const data = await res.json();
    const container = document.getElementById("audit-ledger-table-container");
    const totalEl = document.getElementById("audit-total-records");

    const logs = data.auditLogs || [];
    if (totalEl) totalEl.textContent = `Total Records: ${logs.length}`;

    if (!container) return;

    if (logs.length === 0) {
      container.innerHTML = `<div class="sidebar-empty">No audit records recorded yet.</div>`;
      return;
    }

    let tableHtml = `
      <table class="audit-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Tool</th>
            <th>Resource</th>
            <th>Decision</th>
            <th>Session</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const log of logs.slice(-20).reverse()) {
      const timeStr = new Date(log.timestamp).toLocaleTimeString();
      const decClass = log.decision === "allow" ? "allow" : (log.decision === "approval_required" ? "escalate" : "deny");
      tableHtml += `
        <tr>
          <td>${timeStr}</td>
          <td><code>${escapeHtml(log.tool)}</code></td>
          <td class="res-col" title="${escapeHtml(log.resource)}">${escapeHtml(log.resource)}</td>
          <td><span class="verdict-tag ${decClass}">${escapeHtml(log.decision.toUpperCase())}</span></td>
          <td><code>${escapeHtml(log.agentSessionId ? log.agentSessionId.substring(0, 8) + "..." : "system")}</code></td>
        </tr>
      `;
    }

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
  } catch {
    // Ignore error
  }
}

async function runAuditVerification() {
  switchBottomTab("audit");
  try {
    const res = await fetch("/api/audit/verify");
    const data = await res.json();

    if (data.verified) {
      alert(`✅ Cryptographic Audit Chain Verified!\n\nAll ${data.recordsChecked || "stored"} audit records form an intact, unbroken SHA-256 hash chain.`);
    } else {
      alert("❌ Audit chain validation error.");
    }
  } catch (err) {
    alert("Verification request failed: " + err.message);
  }
}

async function runTamperDemo() {
  switchBottomTab("audit");
  try {
    const res = await fetch("/api/audit/tamper-demo", { method: "POST" });
    const data = await res.json();
    alert(`🧪 Tamper Simulation Alert:\n\n${data.message}\n\nExpected Hash: ${data.expectedHash}\nActual Hash:   ${data.actualHash}`);
  } catch (err) {
    alert("Tamper demo error: " + err.message);
  }
}

// ============================================================
// Live Preview & Visual Element Inspector
// ============================================================

function reloadLivePreview() {
  const iframe = document.getElementById("live-preview-iframe");
  if (iframe) {
    iframe.src = `/preview/index.html?t=${Date.now()}`;
  }
}

function openPreviewInNewTab() {
  window.open("/preview/index.html", "_blank");
}

function setPreviewViewport(mode, btn) {
  document.querySelectorAll(".btn-viewport").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  const wrapper = document.getElementById("preview-frame-wrapper");
  if (!wrapper) return;

  wrapper.className = "preview-frame-wrapper";
  if (mode === "tablet") wrapper.classList.add("viewport-tablet");
  if (mode === "mobile") wrapper.classList.add("viewport-mobile");
}

function toggleElementInspector(btn) {
  isInspectorActive = !isInspectorActive;
  btn?.classList.toggle("active", isInspectorActive);
  const statusEl = document.getElementById("inspector-status-bar");
  statusEl?.classList.toggle("hidden", !isInspectorActive);
}

function handleInspectorMessage(event) {
  if (event.data && event.data.type === "PNG5_INSPECT_ELEMENT") {
    inspectedElement = event.data;
    const textEl = document.getElementById("inspector-selected-text");
    if (textEl) {
      textEl.innerHTML = `Selected: <strong>&lt;${escapeHtml(inspectedElement.tag)} class="${escapeHtml(inspectedElement.className)}"&gt;</strong> "${escapeHtml(inspectedElement.text)}"`;
    }
  }
}

function sendInspectedElementToAi() {
  if (!inspectedElement) return;
  switchRightTab("assistant");
  setAiPrompt(`Modify the selected element <${inspectedElement.tag} class="${inspectedElement.className}">: `);
}

// ============================================================
// Project Switcher Modal
// ============================================================

function openProjectModal() {
  document.getElementById("project-modal")?.classList.remove("hidden");
  fetchRecentProjects();
}

function closeProjectModal() {
  document.getElementById("project-modal")?.classList.add("hidden");
}

function closeModalOnBackdrop(event, modalId) {
  if (event.target.id === modalId) {
    document.getElementById(modalId)?.classList.add("hidden");
  }
}

async function fetchRecentProjects() {
  try {
    const res = await fetch("/api/project/recent");
    if (!res.ok) return;
    const data = await res.json();
    renderRecentProjectsList(data.recent || []);
  } catch {
    // ignore
  }
}

function renderRecentProjectsList(projects) {
  const container = document.getElementById("recent-projects-list");
  if (!container) return;

  if (!projects || projects.length === 0) {
    container.innerHTML = `<div class="sidebar-empty">No recent projects.</div>`;
    return;
  }

  let html = "";
  for (const p of projects) {
    html += `
      <div class="recent-project-row" onclick="selectRecentProject('${escapeHtml(p)}')">
        <span>📂 ${escapeHtml(p)}</span>
      </div>
    `;
  }
  container.innerHTML = html;
}

function selectRecentProject(path) {
  const input = document.getElementById("custom-project-path-input");
  if (input) input.value = path;
  submitOpenProject();
}

async function submitOpenProject() {
  const input = document.getElementById("custom-project-path-input");
  const path = input?.value.trim() || "root";

  try {
    const res = await fetch("/api/project/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Invalid path");
    }

    closeProjectModal();
    openFiles.clear();
    await loadActiveProject();
    await refreshProjectTree();
    reloadLivePreview();
    openFileByPath("style.css").catch(() => openFileByPath("index.html").catch(() => {}));
  } catch (err) {
    alert("Failed to open workspace: " + err.message);
  }
}

// ============================================================
// New File / Folder Prompt Helpers
// ============================================================

async function promptNewFile() {
  const name = prompt("Enter new file path (relative to workspace root):");
  if (!name) return;

  try {
    const res = await fetch("/api/project/file/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: name, isDirectory: false, content: "" }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await refreshProjectTree();
    openFileByPath(name);
  } catch (err) {
    alert("Create file failed: " + err.message);
  }
}

async function promptNewFolder() {
  const name = prompt("Enter new folder path (relative to workspace root):");
  if (!name) return;

  try {
    const res = await fetch("/api/project/file/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: name, isDirectory: true }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await refreshProjectTree();
  } catch (err) {
    alert("Create folder failed: " + err.message);
  }
}

// ============================================================
// Global Keyboard Shortcuts
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
    document.getElementById("ai-prompt-input")?.focus();
  }
}

// ============================================================
// Markdown & HTML Formatters
// ============================================================

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

// ============================================================
// Enhanced UI & Layout Control Handlers
// ============================================================

function injectPrompt(text) {
  const ta1 = document.getElementById("prompt-textarea");
  const ta2 = document.getElementById("ai-prompt-input");
  if (ta1) { ta1.value = text; ta1.focus(); }
  if (ta2) { ta2.value = text; ta2.focus(); }
}

function handlePromptSubmit(event) {
  if (event) event.preventDefault();
  const ta = document.getElementById("prompt-textarea") || document.getElementById("ai-prompt-input");
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
          <div class="msg-text">${formatMarkdown(data.response || data.message || "Action processed.")}</div>
          ${verdictBadge}
          ${stepsHtml}
        `;
        chatContainer.appendChild(aiDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      refreshLivePreview();
      if (activeFilePath) {
        openFiles.delete(activeFilePath);
        openFileByPath(activeFilePath);
      }
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

function switchRightTab(tab) {
  const previewTab = document.getElementById("right-tab-preview");
  const assistantTab = document.getElementById("right-tab-assistant");
  const previewView = document.getElementById("right-view-preview");
  const assistantView = document.getElementById("right-view-assistant");

  if (tab === "preview") {
    previewTab?.classList.add("active");
    assistantTab?.classList.remove("active");
    previewView?.classList.add("active");
    assistantView?.classList.remove("active");
  } else {
    assistantTab?.classList.add("active");
    previewTab?.classList.remove("active");
    assistantView?.classList.add("active");
    previewView?.classList.remove("active");
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

function runAuditVerification() {
  fetch("/api/audit/verify")
    .then((r) => r.json())
    .then((data) => {
      const statusEl = document.getElementById("audit-verify-status");
      if (statusEl) {
        statusEl.textContent = data.valid
          ? `Cryptographic SHA-256 Ledger: VERIFIED (${data.totalRecords} events)`
          : `Audit Chain Warning: Tamper detected at Seq #${data.firstBadSeq}`;
        statusEl.style.color = data.valid ? "#00ff88" : "#ff3366";
      }
      alert(data.valid ? "✅ Audit Chain Integrity Verified: All SHA-256 HMAC signatures valid." : "⚠️ Audit Chain Tamper Detected at Seq #" + data.firstBadSeq);
    })
    .catch((err) => alert("Audit check failed: " + err.message));
}
