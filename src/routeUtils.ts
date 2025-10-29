import * as path from "path";
import * as vscode from "vscode";

export function detectLineComment(
  languageId: string,
  styleSetting: "auto" | "slash" | "hash" | "block"
): { prefix: string; suffix?: string } {
  if (styleSetting !== "auto") {
    if (styleSetting === "slash") return { prefix: "// " };
    if (styleSetting === "hash") return { prefix: "# " };
    return { prefix: "/* ", suffix: " */" };
  }
  // Heuristic for common languages
  const slashLangs = new Set([
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
    "java",
    "c",
    "cpp",
    "csharp",
    "rust",
    "go",
    "kotlin",
    "swift",
  ]);
  const hashLangs = new Set([
    "python",
    "ruby",
    "shellscript",
    "makefile",
    "perl",
  ]);
  if (slashLangs.has(languageId)) return { prefix: "// " };
  if (hashLangs.has(languageId)) return { prefix: "# " };
  return { prefix: "// " }; // safe default
}

export function deriveRouteFromFile(
  fileFsPath: string,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  includeAppSegment: boolean
): string | null {
  if (!workspaceFolder) return null;

  const rel = path.relative(workspaceFolder.uri.fsPath, fileFsPath);
  if (!rel || rel.startsWith("..")) return null;

  let segs = rel.split(path.sep);

  // Find 'app' directory anchor (mostly for Next.js App Router)
  const appIdx = segs.findIndex((s) => s.toLowerCase() === "app");
  if (appIdx === -1) {
    return (
      "/" +
      segs
        .map((s) => s.replace(/\\+/g, "/"))
        .join("/")
        .replace(/\.(tsx?|jsx?|mdx?)$/i, "")
    );
  }

  // --- skip group/parallel segments like (marketing) or @modal ---
  segs = segs.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith("@"));

  // Build route from app/
  let routeSegs = segs.slice(appIdx + (includeAppSegment ? 0 : 1));

  // Drop file extensions; handle special files
  const last = routeSegs[routeSegs.length - 1];
  const lastNoExt = last.replace(/\.(tsx?|jsx?|mdx?)$/i, "");
  const special = new Set([
    "page",
    "layout",
    "template",
    "error",
    "loading",
    "not-found",
    "route",
  ]);
  if (special.has(lastNoExt)) {
    routeSegs = routeSegs.slice(0, -1);
  } else {
    routeSegs[routeSegs.length - 1] = lastNoExt;
  }

  // Normalize Windows backslashes, ensure leading slash
  let route = "/" + routeSegs.join("/").replace(/\\/g, "/");
  route = route.replace(/\/+/g, "/");

  return route || "/";
}

export function buildCommentLine(
  route: string,
  languageId: string,
  commentStyle: "auto" | "slash" | "hash" | "block"
): string {
  const { prefix, suffix } = detectLineComment(languageId, commentStyle);
  return suffix ? `${prefix}${route}${suffix}` : `${prefix}${route}`;
}

export function findExistingRouteCommentTop(
  doc: vscode.TextDocument
): { range: vscode.Range; text: string } | null {
  const maxScan = Math.min(10, doc.lineCount);
  let startLine = 0;

  // --- NEW: skip shebang (#!/usr/bin/env node) if present ---
  if (doc.lineCount > 0 && doc.lineAt(0).text.startsWith("#!")) {
    startLine = 1;
  }

  for (let i = startLine; i < maxScan; i++) {
    const line = doc.lineAt(i).text.trim();
    if (!line) continue;

    if (
      /^(\/\/|#)\s*\/[^\s]*$/.test(line) ||
      /^\/\*\s*\/[^\s]*\s*\*\/$/.test(line)
    ) {
      return { range: doc.lineAt(i).range, text: line };
    }

    if (!/^(\/\/|#|\/\*)/.test(line)) break; // stop if first non-empty isn’t a comment
  }

  return null;
}
