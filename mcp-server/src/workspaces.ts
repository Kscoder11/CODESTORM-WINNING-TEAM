/**
 * PNG5 MCP Server — Workspace Registry
 *
 * Workspaces are registered SERVER-SIDE only (PROJECT_ROOT and optional
 * WORKSPACE_PATHS environment variables). Clients select a workspace by
 * id; they can never inject an arbitrary filesystem path, and every path
 * is re-validated against the registered root before access.
 */

import { resolve, basename, isAbsolute } from "path";
import { existsSync, statSync } from "fs";
import { config, log } from "./config.js";

export interface WorkspaceInfo {
  id: string;
  name: string;
  root: string;
  source: string;
  active: boolean;
}

let cachedList: WorkspaceInfo[] | null = null;
let activeId: string | null = null;

function buildList(): WorkspaceInfo[] {
  const roots: Array<{ root: string; source: string }> = [
    { root: config.projectRoot, source: "PROJECT_ROOT" },
  ];

  const extra = process.env.WORKSPACE_PATHS || "";
  for (const item of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
    const root = isAbsolute(item) ? item : resolve(config.projectRoot, item);
    if (!roots.some((r) => r.root === root)) {
      roots.push({ root, source: "WORKSPACE_PATHS" });
    }
  }

  const list: WorkspaceInfo[] = [];
  roots.forEach((entry, index) => {
    try {
      const stat = statSync(entry.root);
      if (!stat.isDirectory()) return;
    } catch {
      log("warn", "Registered workspace path is not accessible", { root: entry.root });
      return;
    }
    list.push({
      id: `ws_${index + 1}`,
      name: basename(entry.root) || entry.root,
      root: entry.root,
      source: entry.source,
      active: false,
    });
  });

  return list;
}

function ensureList(): WorkspaceInfo[] {
  if (!cachedList) {
    cachedList = buildList();
    if (cachedList.length === 0) {
      log("error", "No valid workspaces registered", { projectRoot: config.projectRoot });
    }
  }

  if (!activeId || !cachedList.some((w) => w.id === activeId)) {
    activeId = cachedList.length > 0 ? cachedList[0].id : null;
  }

  for (const ws of cachedList) {
    ws.active = ws.id === activeId;
  }

  return cachedList;
}

export function listWorkspaces(): WorkspaceInfo[] {
  return ensureList();
}

export function getWorkspaceById(id: string): WorkspaceInfo | undefined {
  return ensureList().find((w) => w.id === id);
}

export function getActiveWorkspace(): WorkspaceInfo | undefined {
  return ensureList().find((w) => w.active);
}

export function activateWorkspace(id: string): WorkspaceInfo | undefined {
  const list = ensureList();
  const target = list.find((w) => w.id === id);
  if (!target) return undefined;
  activeId = target.id;
  for (const ws of list) {
    ws.active = ws.id === activeId;
  }
  return target;
}

export function workspaceRootExists(root: string): boolean {
  try {
    return existsSync(root) && statSync(root).isDirectory();
  } catch {
    return false;
  }
}
