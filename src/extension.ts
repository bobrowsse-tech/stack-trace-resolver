import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { DashboardProvider } from './dashboardProvider';
import { registerResolveStackTraceTool } from './lmTool';
import {
  StackTraceService,
  showFileAtCommit,
  type ResolveReport,
  type ResolvedFrame,
} from './service';

const LAST_REPORT_KEY = 'stackTrace.lastReport';
const LAST_TRACE_KEY = 'stackTrace.lastTrace';
const SELECTED_FRAME_KEY = 'stackTrace.selectedFrame';

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function createService(): StackTraceService | undefined {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Stack Trace Resolver needs an open workspace folder.');
    return undefined;
  }
  return new StackTraceService(root);
}

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('stack-trace-resolverView', dashboard)
  );

  const setReport = (report: ResolveReport) => {
    void context.workspaceState.update(LAST_REPORT_KEY, report);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('stackTrace.paste', async () => {
      const existing = context.workspaceState.get<string>(LAST_TRACE_KEY) ?? '';
      const trace = await vscode.window.showInputBox({
        title: 'Paste stack trace',
        value: existing,
        prompt: 'V8/JS, Python, or Java traces supported',
        ignoreFocusOut: true,
        placeHolder: 'Error: …\n    at …',
      });
      // InputBox is single-line — also offer a document paste for multi-line
      if (trace === undefined) {
        return;
      }
      let full = trace;
      if (!trace.includes('\n')) {
        const doc = await vscode.workspace.openTextDocument({
          content: existing || '// Paste your stack trace here, then run Resolve\n',
          language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc);
        const confirm = await vscode.window.showInformationMessage(
          'Paste the full multi-line trace into the editor, then click Resolve.',
          'Use Editor Content',
          'Use Single Line'
        );
        if (confirm === 'Use Editor Content') {
          full = doc.getText();
        } else if (confirm !== 'Use Single Line') {
          return;
        }
      }
      await context.workspaceState.update(LAST_TRACE_KEY, full);
      const formatHint = full.includes('Traceback')
        ? 'Python'
        : full.includes('.java:')
          ? 'Java'
          : 'V8/JS';
      dashboard.setSummary(`Trace pasted (${formatHint} detected). Click Resolve.`);
      dashboard.setTracePreview(full.slice(0, 500));
      vscode.window.showInformationMessage('Trace stored — run Resolve.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('stackTrace.resolve', async (payload?: { trace?: string }) => {
      const service = createService();
      if (!service) {
        return undefined;
      }
      let trace = payload?.trace ?? context.workspaceState.get<string>(LAST_TRACE_KEY);
      if (!trace) {
        await vscode.commands.executeCommand('stackTrace.paste');
        trace = context.workspaceState.get<string>(LAST_TRACE_KEY);
      }
      if (!trace) {
        return undefined;
      }
      await context.workspaceState.update(LAST_TRACE_KEY, trace);
      dashboard.setSummary('Resolving…');
      try {
        const report = await service.resolve(trace);
        setReport(report);
        dashboard.showReport(report);
        dashboard.setSummary(
          `${report.frames.length} frame(s) · ${report.format}` +
            (report.commitFoundLocally ? ` · commit ${report.commitSha?.slice(0, 7)}` : '')
        );
        return report;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dashboard.setSummary(`Resolve failed: ${msg}`);
        vscode.window.showErrorMessage(msg);
        return undefined;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('stackTrace.jumpToCommit', async (payload?: {
      frameIndex?: number;
    }) => {
      const root = workspaceRoot();
      const report = context.workspaceState.get<ResolveReport>(LAST_REPORT_KEY);
      if (!root || !report) {
        vscode.window.showWarningMessage('Resolve a stack trace first.');
        return;
      }

      let index =
        payload?.frameIndex ??
        context.workspaceState.get<number>(SELECTED_FRAME_KEY) ??
        0;
      if (index < 0 || index >= report.frames.length) {
        const pick = await vscode.window.showQuickPick(
          report.frames.map((f, i) => ({
            label: `${f.resolved.file}:${f.resolved.line}`,
            description: f.method,
            index: i,
          })),
          { title: 'Jump to which frame?' }
        );
        if (!pick) {
          return;
        }
        index = pick.index;
      }

      const frame = report.frames[index];
      await openResolvedFrame(root, report, frame);
    })
  );

  dashboard.onSelectFrame((index) => {
    void context.workspaceState.update(SELECTED_FRAME_KEY, index);
  });

  registerResolveStackTraceTool(context, () => createService(), setReport, dashboard, async (trace) => {
    await context.workspaceState.update(LAST_TRACE_KEY, trace);
  });
}

export function deactivate() {}

async function openResolvedFrame(
  root: string,
  report: ResolveReport,
  frame: ResolvedFrame
): Promise<void> {
  const targetPath = frame.resolved.file;
  const absGuess = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(root, targetPath.replace(/^\.\//, ''));

  if (report.commitFoundLocally && report.commitSha) {
    // Try historical content
    const rel = path.relative(root, absGuess).replace(/\\/g, '/');
    const content =
      (await showFileAtCommit(root, report.commitSha, rel)) ??
      (await showFileAtCommit(root, report.commitSha, targetPath));
    if (content !== undefined) {
      const tmp = path.join(
        os.tmpdir(),
        `stack-trace-${report.commitSha.slice(0, 7)}-${path.basename(targetPath)}`
      );
      fs.writeFileSync(tmp, content, 'utf8');
      const doc = await vscode.workspace.openTextDocument(tmp);
      const editor = await vscode.window.showTextDocument(doc);
      const line = Math.max(0, frame.resolved.line - 1);
      const pos = new vscode.Position(line, Math.max(0, frame.resolved.column));
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
      vscode.window.showInformationMessage(
        `Opened ${targetPath} as of ${report.commitSha.slice(0, 7)}`
      );
      return;
    }
    vscode.window.showWarningMessage(
      `Commit ${report.commitSha.slice(0, 7)} found but file not in that revision — opening working tree`
    );
  }

  // Working tree / unresolved
  let uri: vscode.Uri;
  if (fs.existsSync(absGuess)) {
    uri = vscode.Uri.file(absGuess);
  } else {
    // Search by basename
    const files = await vscode.workspace.findFiles(`**/${path.basename(targetPath)}`, '**/node_modules/**', 5);
    if (!files.length) {
      vscode.window.showWarningMessage(`Could not find ${targetPath} in workspace`);
      return;
    }
    uri = files[0];
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const line = Math.max(0, frame.resolved.line - 1);
  const pos = new vscode.Position(line, Math.max(0, frame.resolved.column));
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos));
}
