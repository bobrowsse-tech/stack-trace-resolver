import * as vscode from 'vscode';
import type { ResolveReport } from './service';

const BUTTONS: { label: string; command: string }[] = [
  { label: 'Paste Trace', command: 'stackTrace.paste' },
  { label: 'Resolve', command: 'stackTrace.resolve' },
  { label: 'Jump to Commit', command: 'stackTrace.jumpToCommit' },
];

export class DashboardProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private summary = 'Paste a stack trace to begin.';
  private report?: ResolveReport;
  private selectHandler?: (index: number) => void;

  constructor(private readonly extensionUri: vscode.Uri) {}

  onSelectFrame(handler: (index: number) => void) {
    this.selectHandler = handler;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === 'runCommand') {
        void vscode.commands.executeCommand(message.command, message.payload);
      } else if (message.type === 'select') {
        this.selectHandler?.(message.index);
      } else if (message.type === 'jump') {
        void vscode.commands.executeCommand('stackTrace.jumpToCommit', {
          frameIndex: message.index,
        });
      }
    });
    if (this.report) {
      this.showReport(this.report);
    }
  }

  setSummary(text: string) {
    this.summary = text;
    this.post({ type: 'summary', text });
  }

  setTracePreview(text: string) {
    this.post({ type: 'preview', text });
  }

  showReport(report: ResolveReport) {
    this.report = report;
    this.post({
      type: 'report',
      report: {
        format: report.format,
        buildId: report.buildId,
        commitSha: report.commitSha,
        commitFoundLocally: report.commitFoundLocally,
        notes: report.notes,
        frames: report.frames.map((f) => ({
          method: f.method,
          file: f.resolved.file,
          line: f.resolved.line,
          column: f.resolved.column,
          functionName: f.resolved.functionName,
          original: `${f.original.file}:${f.original.line}:${f.original.column}`,
          note: f.note,
        })),
      },
    });
  }

  private post(message: unknown) {
    void this.view?.webview.postMessage(message);
  }

  private getHtml(): string {
    const buttonsHtml = BUTTONS.map(
      (b) => `<button data-command="${b.command}">${b.label}</button>`
    ).join('\n');
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: var(--vscode-font-size); }
    button {
      display: block; width: 100%; margin-bottom: 6px; padding: 6px 10px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; cursor: pointer; text-align: left;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    #summary { margin: 8px 0 12px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
    .frame { border-bottom: 1px solid var(--vscode-widget-border, transparent); padding: 6px 0; cursor: pointer; }
    .frame.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .badge { font-size: 0.7em; text-transform: uppercase; margin-right: 4px; }
    .badge.sourcemap { color: var(--vscode-testing-iconPassed); }
    .badge.direct { color: var(--vscode-descriptionForeground); }
    .badge.unresolved { color: var(--vscode-editorWarning-foreground); }
    .badge.commit { color: var(--vscode-textLink-foreground); }
    .meta { font-size: 0.75em; color: var(--vscode-descriptionForeground); }
    #preview { font-size: 0.75em; white-space: pre-wrap; max-height: 80px; overflow: auto; margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
    .hint { font-size: 0.75em; color: var(--vscode-descriptionForeground); margin-top: 8px; }
  </style>
</head>
<body>
  <div id="summary">${escapeHtml(this.summary)}</div>
  ${buttonsHtml}
  <div id="preview"></div>
  <div id="list"></div>
  <p class="hint">No sourcemap → unresolved marker (never a silent wrong guess). Unsupported languages are named explicitly.</p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const listEl = document.getElementById('list');
    const summaryEl = document.getElementById('summary');
    const previewEl = document.getElementById('preview');
    document.querySelectorAll('button[data-command]').forEach((btn) => {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'runCommand', command: btn.dataset.command }));
    });
    function esc(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'summary') summaryEl.textContent = msg.text;
      if (msg.type === 'preview') previewEl.textContent = msg.text;
      if (msg.type === 'report') {
        listEl.innerHTML = '';
        if (msg.report.commitSha) {
          const c = document.createElement('div');
          c.className = 'meta';
          c.innerHTML = msg.report.commitFoundLocally
            ? '<span class="badge commit">commit</span> ' + esc(msg.report.commitSha)
            : '<span class="badge unresolved">commit missing</span> ' + esc(msg.report.buildId);
          listEl.appendChild(c);
        }
        msg.report.frames.forEach((f, i) => {
          const div = document.createElement('div');
          div.className = 'frame';
          div.innerHTML =
            '<div><span class="badge ' + esc(f.method) + '">' + esc(f.method) + '</span>' +
            esc(f.functionName ? f.functionName + ' ' : '') + esc(f.file) + ':' + f.line + ':' + f.column + '</div>' +
            (f.method === 'sourcemap' ? '<div class="meta">from ' + esc(f.original) + '</div>' : '') +
            (f.note ? '<div class="meta">' + esc(f.note) + '</div>' : '');
          div.addEventListener('click', () => {
            listEl.querySelectorAll('.frame').forEach((x) => x.classList.remove('selected'));
            div.classList.add('selected');
            vscode.postMessage({ type: 'select', index: i });
            vscode.postMessage({ type: 'jump', index: i });
          });
          listEl.appendChild(div);
        });
        for (const n of msg.report.notes || []) {
          const d = document.createElement('div');
          d.className = 'hint';
          d.textContent = n;
          listEl.appendChild(d);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
