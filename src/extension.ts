import * as vscode from 'vscode';
import { DashboardProvider } from './dashboardProvider';
import { registerResolveStackTraceTool } from './lmTool';

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("stack-trace-resolverView", dashboard)
  );

  context.subscriptions.push(vscode.commands.registerCommand("stackTrace.paste", () => {
    // TODO (Paste Trace): Opens an input panel for a raw stack trace, auto-detecting the stack format (V8, Python traceback, Java) to pick the right frame parser.
    vscode.window.showInformationMessage("Paste Trace \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("stackTrace.resolve", () => {
    // TODO (Resolve): Resolves every frame through its matching sourcemap (or, for Python/Java, directly since those aren't typically minified) and lists real file:line for each.
    vscode.window.showInformationMessage("Resolve \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("stackTrace.jumpToCommit", () => {
    // TODO (Jump to Commit): If the trace or an accompanying build id maps to a known git commit, opens that file as of that commit instead of the current working tree.
    vscode.window.showInformationMessage("Jump to Commit \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  // Exposes the same capability to Copilot Chat / Claude Code / any MCP-aware
  // agent via the Language Model Tool API — see contributes.languageModelTools
  // in package.json and DIRECTIVE.md, section "Language Model Tool".
  registerResolveStackTraceTool(context);
}

export function deactivate() {}
