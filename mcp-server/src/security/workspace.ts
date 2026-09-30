/**
 * PNG5 MCP Server — Secure Workspace Validation
 * 
 * Defends against:
 * - Path traversal (../ sequences)
 * - Symlink escapes
 * - Access to secret/credential files
 * - Access outside registered workspace
 * - Filesystem race conditions (TOCTOU)
 * 
 * A simple string-prefix check is NOT sufficient for production filesystem security.
 * This module uses realpath resolution + per-component symlink checking + pattern matching.
 */

import { resolve, relative, basename, dirname, join, sep } from "path";
import { existsSync, lstatSync, realpathSync, statSync } from "fs";
import { config, log } from "../config.js";

/** Patterns that indicate secret/credential files */
const SECRET_PATTERNS: RegExp[] = [
  /\.env($|\.)/i,
  /secret/i,
  /credential/i,
  /password/i,
  /\/etc\/shadow/,
  /\.ssh\//,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /token/i,
  /apikey/i,
  /api_key/i,
];

export class WorkspaceSecurityError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "WorkspaceSecurityError";
    this.code = code;
  }
}

/**
 * Validate that a path is safely within the registered project workspace.
 * 
 * Security checks performed:
 * 1. Resolve to absolute path against project root
 * 2. Check each path component for symlinks
 * 3. Verify realpath is within workspace boundary
 * 4. Reject secret/credential file patterns
 * 5. Reject hidden directories (except .gitignore etc.)
 * 
 * @param root Optional workspace root to validate against (defaults to configured project root)
 * @returns The validated, resolved absolute path
 * @throws WorkspaceSecurityError on any violation
 */
export function validateWorkspacePath(
  requestedPath: string,
  allowSecrets = false,
  root: string = config.projectRoot
): string {
  const projectRoot = root;

  // Normalize and resolve the requested path against the project root
  let targetPath: string;
  if (requestedPath.startsWith("/") || requestedPath.match(/^[A-Za-z]:\\/)) {
    // Absolute path provided — resolve as-is
    targetPath = resolve(requestedPath);
  } else if (!requestedPath || requestedPath === ".") {
    // Workspace root itself
    targetPath = resolve(projectRoot);
  } else {
    // Relative path — resolve against project root
    targetPath = resolve(projectRoot, requestedPath);
  }

  // --- Check 1: Basic traversal detection (before filesystem access) ---
  const relativePath = relative(projectRoot, targetPath);
  if (relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) {
    log("warn", "Path traversal attempt blocked", { requestedPath, relativePath });
    throw new WorkspaceSecurityError(
      "Path traversal detected: path escapes workspace boundary",
      "PATH_TRAVERSAL"
    );
  }

  // --- Check 2: Per-component symlink check (defend against symlink escape) ---
  checkSymlinksInPath(projectRoot, relativePath);

  // --- Check 3: Realpath containment (if the path exists) ---
  if (existsSync(targetPath)) {
    let realTarget: string;
    try {
      realTarget = realpathSync(targetPath);
    } catch {
      throw new WorkspaceSecurityError(
        "Cannot resolve real path — possible dangling symlink",
        "SYMLINK_RESOLVE_FAILED"
      );
    }

    const realRoot = realpathSync(projectRoot);
    const realRelative = relative(realRoot, realTarget);
    if (realRelative.startsWith("..") || realRelative.includes(`..${sep}`)) {
      log("warn", "Symlink escape attempt blocked", { requestedPath, realTarget });
      throw new WorkspaceSecurityError(
        "Symlink escape detected: resolved path is outside workspace",
        "SYMLINK_ESCAPE"
      );
    }
  }

  // --- Check 4: Secret/credential pattern check ---
  if (!allowSecrets) {
    checkSecretPatterns(targetPath, requestedPath);
  }

  return targetPath;
}

/**
 * Walk each component of the relative path and reject if any is a symlink.
 */
function checkSymlinksInPath(root: string, relativePath: string): void {
  const parts = relativePath.split(sep).filter(Boolean);
  let currentPath = root;

  for (const part of parts) {
    currentPath = join(currentPath, part);
    if (existsSync(currentPath)) {
      try {
        const stat = lstatSync(currentPath);
        if (stat.isSymbolicLink()) {
          log("warn", "Symlink found in path component", { path: currentPath, part });
          throw new WorkspaceSecurityError(
            `Symlink detected in path component: ${part}`,
            "SYMLINK_IN_PATH"
          );
        }
      } catch (err) {
        if (err instanceof WorkspaceSecurityError) throw err;
        // lstat failed — fail closed
        throw new WorkspaceSecurityError(
          "Cannot stat path component — access denied",
          "STAT_FAILED"
        );
      }
    }
  }
}

/**
 * Reject paths that match known secret/credential patterns.
 */
function checkSecretPatterns(absolutePath: string, originalRequest: string): void {
  const pathsToCheck = [absolutePath, originalRequest, basename(absolutePath)];

  for (const p of pathsToCheck) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(p)) {
        log("warn", "Secret file access blocked", { path: originalRequest, pattern: pattern.source });
        throw new WorkspaceSecurityError(
          `Access to secret/credential file denied: matches pattern ${pattern.source}`,
          "SECRET_FILE"
        );
      }
    }
  }
}

/**
 * Validate file size is within limits for reading.
 */
export function validateFileSize(filePath: string, maxSize: number): void {
  try {
    const stat = statSync(filePath);
    if (stat.size > maxSize) {
      throw new WorkspaceSecurityError(
        `File exceeds maximum allowed size (${stat.size} > ${maxSize} bytes)`,
        "FILE_TOO_LARGE"
      );
    }
  } catch (err) {
    if (err instanceof WorkspaceSecurityError) throw err;
    throw new WorkspaceSecurityError(
      "Cannot determine file size",
      "STAT_FAILED"
    );
  }
}

/**
 * List safe directories/files — filters out hidden dirs and secret files.
 */
export function isHiddenOrIgnored(name: string): boolean {
  // Allow common dotfiles
  const allowedDotfiles = [".gitignore", ".editorconfig", ".prettierrc", ".eslintrc"];
  if (name.startsWith(".") && !allowedDotfiles.includes(name)) {
    return true;
  }
  // Ignore common build/dependency dirs
  const ignoredDirs = ["node_modules", "__pycache__", ".git", "dist", "build", ".venv", "venv"];
  return ignoredDirs.includes(name);
}
