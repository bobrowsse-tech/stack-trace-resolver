export type {
  ResolveMethod,
  ResolveReport,
  ResolvedFrame,
  StackFrame,
  TraceFormat,
} from './types';

export { detectFormat, extractBuildId, parseFrames } from './parse';
export { resolveFrame, resolveFrames } from './sourcemap';
export { resolveCommit, showFileAtCommit } from './commit';

import { extractBuildId, parseFrames } from './parse';
import { resolveFrames } from './sourcemap';
import { resolveCommit } from './commit';
import type { ResolveReport } from './types';

export interface ResolveOptions {
  buildDirs?: string[];
}

/**
 * VS Code–free stack trace resolver.
 */
export class StackTraceService {
  constructor(private readonly root: string) {}

  async resolve(trace: string, options: ResolveOptions = {}): Promise<ResolveReport> {
    const parsed = parseFrames(trace);
    const notes = [...parsed.notes];
    const buildId = extractBuildId(trace);
    const commit = await resolveCommit(this.root, buildId);
    if (commit.note) {
      notes.push(commit.note);
    }

    const frames =
      parsed.format === 'unknown'
        ? []
        : resolveFrames(this.root, parsed.frames, { buildDirs: options.buildDirs });

    return {
      format: parsed.format,
      frames,
      buildId,
      commitSha: commit.sha,
      commitFoundLocally: commit.found,
      notes,
      resolvedAt: new Date().toISOString(),
    };
  }

  formatReport(report: ResolveReport): string {
    const lines = [
      `Stack trace resolved at ${report.resolvedAt}`,
      `Format: ${report.format}`,
    ];
    if (report.buildId) {
      lines.push(
        `Build id: ${report.buildId}` +
          (report.commitFoundLocally
            ? ` → commit ${report.commitSha}`
            : ' (commit not found locally)')
      );
    }
    lines.push(`Frames: ${report.frames.length}`, '');
    if (!report.frames.length) {
      lines.push('No frames resolved.');
    }
    for (const f of report.frames) {
      const badge =
        f.method === 'sourcemap'
          ? '[sourcemap]'
          : f.method === 'direct'
            ? '[direct]'
            : '[unresolved]';
      const fn = f.resolved.functionName ? `${f.resolved.functionName} ` : '';
      lines.push(
        `${badge} ${fn}${f.resolved.file}:${f.resolved.line}:${f.resolved.column}`
      );
      if (f.method === 'sourcemap') {
        lines.push(
          `  from ${f.original.file}:${f.original.line}:${f.original.column}`
        );
      }
      if (f.note) {
        lines.push(`  ${f.note}`);
      }
    }
    if (report.notes.length) {
      lines.push('', 'Notes:', ...report.notes.map((n) => `- ${n}`));
    }
    return lines.join('\n');
  }
}
