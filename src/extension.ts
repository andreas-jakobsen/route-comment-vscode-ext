import * as vscode from "vscode";
import {
  buildCommentLine,
  deriveRouteFromFile,
  findExistingRouteCommentTop,
} from "./routeUtils";

export function activate(context: vscode.ExtensionContext) {
  const cfg = () => vscode.workspace.getConfiguration("routeComment");

  // Command: Insert/Update
  const insertCmd = vscode.commands.registerCommand(
    "routeComment.insert",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const doc = editor.document;
      const wf = vscode.workspace.getWorkspaceFolder(doc.uri);
      const includeApp = cfg().get<boolean>("includeAppSegment", true);
      const style = cfg().get<"auto" | "slash" | "hash" | "block">(
        "commentStyle",
        "slash"
      );

      const route = deriveRouteFromFile(doc.uri.fsPath, wf, includeApp);
      if (!route) {
        vscode.window.showWarningMessage(
          "Route Comment: Could not derive route for this file."
        );
        return;
      }

      const commentLine = buildCommentLine(route, doc.languageId, style);
      const existing = findExistingRouteCommentTop(doc);

      await editor.edit((edit) => {
        if (existing) {
          edit.replace(existing.range, commentLine);
        } else {
          edit.insert(new vscode.Position(0, 0), commentLine + "\n\n");
        }
      });

      vscode.window.setStatusBarMessage(`Route Comment: ${route}`, 2500);
    }
  );

  // Command: Copy Route (from derived or existing)
  const copyCmd = vscode.commands.registerCommand(
    "routeComment.copy",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const doc = editor.document;
      const wf = vscode.workspace.getWorkspaceFolder(doc.uri);
      const includeApp = cfg().get<boolean>("includeAppSegment", true);

      let route: string | null = null;
      const existing = findExistingRouteCommentTop(doc);
      if (existing) {
        route = existing.text
          .replace(/^\/\*|\*\/$/g, "")
          .replace(/^(\/\/|#)\s*/, "")
          .trim();
      } else {
        route = deriveRouteFromFile(doc.uri.fsPath, wf, includeApp);
      }

      if (!route) {
        vscode.window.showWarningMessage(
          "Route Comment: No route available to copy."
        );
        return;
      }
      await vscode.env.clipboard.writeText(route);
      vscode.window.setStatusBarMessage(`Copied route: ${route}`, 2000);
    }
  );

  // Command: Open in Browser
  const openCmd = vscode.commands.registerCommand(
    "routeComment.open",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const doc = editor.document;
      const wf = vscode.workspace.getWorkspaceFolder(doc.uri);
      const includeApp = cfg().get<boolean>("includeAppSegment", true);
      const base = cfg()
        .get<string>("openBaseUrl", "http://localhost:3000")
        .replace(/\/+$/, "");

      let route: string | null = null;
      const existing = findExistingRouteCommentTop(doc);
      if (existing) {
        route = existing.text
          .replace(/^\/\*|\*\/$/g, "")
          .replace(/^(\/\/|#)\s*/, "")
          .trim();
      } else {
        route = deriveRouteFromFile(doc.uri.fsPath, wf, includeApp);
      }

      if (!route) {
        vscode.window.showWarningMessage(
          "Route Comment: No route available to open."
        );
        return;
      }
      const url = vscode.Uri.parse(`${base}${route}`);
      vscode.env.openExternal(url);
    }
  );

  // CodeLens: show actions when a route comment is present near top
  const codeLensProvider: vscode.CodeLensProvider = {
    provideCodeLenses(doc) {
      const existing = findExistingRouteCommentTop(doc);
      if (!existing) return [];

      const lenses: vscode.CodeLens[] = [];
      const routeText = existing.text
        .replace(/^\/\*|\*\/$/g, "")
        .replace(/^(\/\/|#)\s*/, "")
        .trim();

      lenses.push(
        new vscode.CodeLens(existing.range, {
          command: "routeComment.copy",
          title: "Copy Route",
        }),
        new vscode.CodeLens(existing.range, {
          command: "routeComment.open",
          title: "Open in Browser",
        }),
        new vscode.CodeLens(existing.range, {
          command: "routeComment.insert",
          title: "Refresh Route",
        })
      );

      // Small hover hint
      (lenses as any).forEach((l: vscode.CodeLens) => l);
      return lenses;
    },
  };
  const codeLensReg = vscode.languages.registerCodeLensProvider(
    { scheme: "file" },
    codeLensProvider
  );

  // Status bar button
  let statusItem: vscode.StatusBarItem | undefined;
  const setupStatusBar = () => {
    const enabled = cfg().get<boolean>("statusBar", true);
    if (!enabled) {
      statusItem?.dispose();
      statusItem = undefined;
      return;
    }
    if (!statusItem) {
      statusItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
      );
      statusItem.command = "routeComment.insert";
      statusItem.text = "$(link-external) Route";
      statusItem.tooltip = "Insert/Update Route Comment";
      statusItem.show();
      context.subscriptions.push(statusItem);
    }
  };
  setupStatusBar();

  // React to config changes
  const cfgWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("routeComment.statusBar")) setupStatusBar();
  });

  context.subscriptions.push(
    insertCmd,
    copyCmd,
    openCmd,
    codeLensReg,
    cfgWatcher
  );
}

export function deactivate() {}
