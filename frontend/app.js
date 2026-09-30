/**
 * PNG5 Web Console — Frontend Application Logic
 */

let activeApprovalId = null;
let activePromptForApproval = null;
let metrics = { total: 0, allow: 0, escalate: 0, deny: 0 };

document.addEventListener("DOMContentLoaded", () => {
  checkSystemHealth();
  fetchPendingApprovals();
  fetchAuditLogs();
  setInterval(fetchPendingApprovals, 5000);
  setInterval(fetchAuditLogs, 10000);
});

function setPrompt(text) {
  const input = document.getElementById("prompt-input");
  input.value = text;
  input.focus();
}

function clearChat() {
  document.getElementById("chat-messages").innerHTML = `
    <div class="message assistant">
      <div class="message-avatar">🤖</div>
      <div class="message-body">
        <p>Chat cleared. Ready for your next request.</p>
      </div>
    </div>
  `;
}

/**
 * Submit user prompt to backend chat API.
 */
async function submitPrompt(event, approvalId = null) {
  if (event) event.preventDefault();

  const input = document.getElementById("prompt-input");
  const promptText = approvalId ? activePromptForApproval : input.value.trim();
  if (!promptText) return;

  const sendBtn = document.getElementById("send-btn");
  const btnText = document.getElementById("btn-text");
  const btnSpinner = document.getElementById("btn-spinner");

  if (!approvalId) {
    appendUserMessage(promptText);
    input.value = "";
  }

  // Loading state
  sendBtn.disabled = true;
  btnText.textContent = "Processing...";
  btnSpinner.classList.remove("hidden");

  // Add Assistant placeholder
  const msgId = `msg-${Date.now()}`;
  appendAssistantPlaceholder(msgId);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": "website-operator",
      },
      body: JSON.stringify({
        prompt: promptText,
        approvalId: approvalId || null,
      }),
    });

    const data = await res.json();
    renderAssistantResponse(msgId, data);
    updateMetrics(data);
    fetchPendingApprovals();
    fetchAuditLogs();

    // If approval required, show modal
    if (data.status === "approval_required" && data.approvalRequest) {
      showApprovalModal(data.approvalRequest, promptText);
    }
  } catch (err) {
    renderAssistantError(msgId, err.message || "Failed to communicate with server");
  } finally {
    sendBtn.disabled = false;
    btnText.textContent = "Submit Prompt ➔";
    btnSpinner.classList.add("hidden");
  }
}

function appendUserMessage(text) {
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "message user";
  div.innerHTML = `
    <div class="message-avatar">👤</div>
    <div class="message-body"><p>${escapeHtml(text)}</p></div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendAssistantPlaceholder(id) {
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "message assistant";
  div.id = id;
  div.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-body">
      <div class="spinner" style="margin-right: 8px;"></div>
      <span>Evaluating prompt against Governor policy...</span>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderAssistantResponse(id, data) {
  const el = document.getElementById(id);
  if (!el) return;

  const bodyEl = el.querySelector(".message-body");
  let badgeHtml = "";

  if (data.status === "completed") {
    badgeHtml = `<span class="badge badge-success" style="margin-bottom: 8px;">● POLICY PERMITTED</span>`;
  } else if (data.status === "approval_required") {
    badgeHtml = `<span class="badge badge-warning" style="margin-bottom: 8px;">⚠️ APPROVAL REQUIRED</span>`;
  } else if (data.status === "denied") {
    badgeHtml = `<span class="badge badge-danger" style="margin-bottom: 8px;">🚫 POLICY DENIED</span>`;
  }

  let stepsHtml = "";
  if (data.steps && data.steps.length > 0) {
    for (const step of data.steps) {
      const toolOut = step.toolResult?.content?.[0]?.text || "";
      stepsHtml += `
        <div class="step-box">
          <div class="step-header">
            <span>⚙️ Step ${step.stepNumber}: Tool <code>${step.tool || "none"}</code></span>
            <span class="tool-tag ${step.status === "success" ? "tag-allow" : "tag-danger"}">${step.status.toUpperCase()}</span>
          </div>
          <p style="margin-bottom: 4px; color: #94a3b8;">${escapeHtml(step.thought)}</p>
          ${toolOut ? `<div class="tool-output-box">${escapeHtml(toolOut)}</div>` : ""}
        </div>
      `;
    }
  }

  bodyEl.innerHTML = `
    ${badgeHtml}
    <div style="margin-top: 4px; white-space: pre-wrap;">${formatMarkdown(data.finalResponse)}</div>
    ${stepsHtml}
  `;

  document.getElementById("chat-messages").scrollTop = document.getElementById("chat-messages").scrollHeight;
}

function renderAssistantError(id, errorText) {
  const el = document.getElementById(id);
  if (!el) return;
  const bodyEl = el.querySelector(".message-body");
  bodyEl.innerHTML = `
    <span class="badge badge-danger" style="margin-bottom: 8px;">💥 SYSTEM ERROR</span>
    <p style="color: #ef4444;">${escapeHtml(errorText)}</p>
  `;
}

/**
 * Human Approval Modal Controls
 */
function showApprovalModal(approval, promptText) {
  activeApprovalId = approval.id;
  activePromptForApproval = promptText;

  const modal = document.getElementById("approval-modal");
  const content = document.getElementById("modal-body-content");

  content.innerHTML = `
    <p style="margin-bottom: 12px;"><strong>Action:</strong> <code>${approval.tool}</code> (${approval.action})</p>
    <p style="margin-bottom: 12px;"><strong>Target Resource:</strong> <code>${approval.target}</code></p>
    <p style="margin-bottom: 12px;"><strong>Risk Score:</strong> <span style="color: #f59e0b; font-weight: bold;">${(approval.riskScore * 100).toFixed(0)}%</span></p>
    <p style="margin-bottom: 12px;"><strong>Governor Policy Reason:</strong> ${approval.reason}</p>
    <p style="margin-bottom: 12px;"><strong>Parameters:</strong></p>
    <pre style="background: #111822; padding: 8px; border-radius: 6px; font-family: monospace; font-size: 0.8rem; overflow-x: auto;">${JSON.stringify(approval.params, null, 2)}</pre>
    <p style="margin-top: 12px; font-size: 0.8rem; color: #94a3b8;">Expires in: <strong>5 minutes</strong>. Approving will authorize one-time execution.</p>
  `;

  modal.classList.remove("hidden");
}

function closeApprovalModal() {
  document.getElementById("approval-modal").classList.add("hidden");
}

async function decideModalApproval(decision) {
  if (!activeApprovalId) return;

  try {
    const res = await fetch(`/api/approvals/${activeApprovalId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewer: "web-operator" }),
    });

    const data = await res.json();
    closeApprovalModal();

    if (decision === "approved") {
      // Resume execution with the approved token
      await submitPrompt(null, activeApprovalId);
    } else {
      appendUserMessage(`[Human Operator Rejected Action ${activeApprovalId}]`);
    }

    activeApprovalId = null;
    activePromptForApproval = null;
  } catch (err) {
    alert(`Failed to submit approval: ${err.message}`);
  }
}

/**
 * Pending Approvals Queue
 */
async function fetchPendingApprovals() {
  try {
    const res = await fetch("/api/approvals");
    const data = await res.json();
    const listEl = document.getElementById("approval-list");
    const countEl = document.getElementById("approval-count");

    const pending = data.approvals || [];
    countEl.textContent = `${pending.length} Pending`;

    if (pending.length === 0) {
      listEl.innerHTML = `<p class="empty-state">No pending actions requiring approval.</p>`;
      return;
    }

    let html = "";
    for (const a of pending) {
      html += `
        <div class="approval-item">
          <div class="approval-info">
            <strong>${a.tool}</strong> on <code>${a.target}</code>
            <div style="color: #94a3b8; font-size: 0.75rem;">Risk: ${(a.riskScore * 100).toFixed(0)}% • ID: ${a.id}</div>
          </div>
          <div class="approval-actions">
            <button class="btn-small" style="background: #10b981; color: white;" onclick="decideInlineApproval('${a.id}', 'approved')">Approve</button>
            <button class="btn-small" style="background: #ef4444; color: white;" onclick="decideInlineApproval('${a.id}', 'rejected')">Reject</button>
          </div>
        </div>
      `;
    }
    listEl.innerHTML = html;
  } catch {
    // Ignore periodic poll error
  }
}

async function decideInlineApproval(id, decision) {
  try {
    await fetch(`/api/approvals/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewer: "web-operator" }),
    });
    fetchPendingApprovals();
  } catch (err) {
    alert("Error deciding approval: " + err.message);
  }
}

/**
 * Audit Logs
 */
async function fetchAuditLogs() {
  try {
    const res = await fetch("/api/audit");
    const data = await res.json();
    const tbody = document.getElementById("audit-tbody");
    const logs = data.auditLogs || [];

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No audit records yet.</td></tr>`;
      return;
    }

    let html = "";
    for (const log of logs.slice(-10).reverse()) {
      const timeStr = new Date(log.timestamp).toLocaleTimeString();
      const outcomeClass = log.decision === "allow" ? "tag-allow" : (log.decision === "approval_required" ? "tag-escalate" : "tag-danger");
      html += `
        <tr>
          <td>${timeStr}</td>
          <td><code>${log.tool}</code></td>
          <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${log.resource}</td>
          <td><span class="tool-tag ${outcomeClass}">${log.decision.toUpperCase()}</span></td>
        </tr>
      `;
    }
    tbody.innerHTML = html;
  } catch {
    // Ignore poll error
  }
}

/**
 * Health Check
 */
async function checkSystemHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const mcpEl = document.getElementById("mcp-status");
    if (data.mcpConnected) {
      mcpEl.className = "badge badge-success";
      mcpEl.textContent = "● MCP Connected";
    } else {
      mcpEl.className = "badge badge-warning";
      mcpEl.textContent = "● MCP Initializing";
    }
  } catch {
    const mcpEl = document.getElementById("mcp-status");
    mcpEl.className = "badge badge-danger";
    mcpEl.textContent = "● MCP Offline";
  }
}

function updateMetrics(result) {
  metrics.total++;
  if (result.status === "completed") metrics.allow++;
  else if (result.status === "approval_required") metrics.escalate++;
  else if (result.status === "denied") metrics.deny++;

  document.getElementById("metric-total").textContent = metrics.total;
  document.getElementById("metric-allow").textContent = metrics.allow;
  document.getElementById("metric-escalate").textContent = metrics.escalate;
  document.getElementById("metric-deny").textContent = metrics.deny;
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
  // Inline Code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Code Blocks
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  return html;
}
