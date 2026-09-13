import * as vscode from 'vscode';
import type { StackTraceService, ResolveReport } from './service';
import type { DashboardProvider } from './dashboardProvider';

interface ToolInput {
  trace: string;
}

/**
 * Report-only LM tool — returns resolved locations; does not open editors.
 */
export function registerResolveStackTraceTool(
  context: vscode.ExtensionContext,
  getService: () => StackTraceService | undefined,
  setReport: (report: ResolveReport) => void,
  dashboard: DashboardProvider,
  storeTrace: (trace: string) => Promise<void>
) {
  context.subscriptions.push(
    vscode.lm.registerTool('resolve_stack_trace', {
      async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ToolInput>,
        _token: vscode.CancellationToken
      ) {
        const service = getService();
        if (!service) {
          return textResult('No workspace folder is open.');
        }
        const trace = options.input?.trace;
        if (!trace) {
          return textResult('trace is required.');
        }
        try {
          await storeTrace(trace);
          const report = await service.resolve(trace);
          setReport(report);
          dashboard.showReport(report);
          dashboard.setSummary(`${report.frames.length} frame(s) · ${report.format}`);
          return textResult(service.formatReport(report));
        } catch (err) {
          return textResult(err instanceof Error ? err.message : String(err));
        }
      },
    })
  );
}

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
