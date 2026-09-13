import * as stackTraceParser from 'stacktrace-parser';
import type { StackFrame, TraceFormat } from './types';

export function detectFormat(trace: string): TraceFormat {
  if (/Traceback \(most recent call last\):/i.test(trace)) {
    return 'python';
  }
  if (/^\s*at\s+.+\(.+:\d+:\d+\)/m.test(trace) || /^\s*at\s+.+:\d+:\d+/m.test(trace)) {
    return 'v8';
  }
  // Java: at com.foo.Bar.baz(Bar.java:12)
  if (/^\s*at\s+[\w.$]+\([\w.]+\.java:\d+\)/m.test(trace)) {
    return 'java';
  }
  if (/Exception in thread/.test(trace) && /\.java:\d+/.test(trace)) {
    return 'java';
  }
  return 'unknown';
}

export function parseFrames(trace: string, format?: TraceFormat): {
  format: TraceFormat;
  frames: StackFrame[];
  notes: string[];
} {
  const detected = format ?? detectFormat(trace);
  const notes: string[] = [];

  if (detected === 'unknown') {
    notes.push(
      'Unsupported or unrecognized stack format. Supported: V8/JS, Python traceback, Java.'
    );
    return { format: detected, frames: [], notes };
  }

  if (detected === 'v8') {
    const parsed = stackTraceParser.parse(trace);
    const frames: StackFrame[] = parsed
      .filter((f) => f.file && f.lineNumber)
      .map((f) => ({
        file: f.file!,
        line: f.lineNumber!,
        column: f.column ?? 0,
        functionName: f.methodName ?? undefined,
      }));
    return { format: detected, frames, notes };
  }

  if (detected === 'python') {
    return { format: detected, frames: parsePython(trace), notes };
  }

  return { format: detected, frames: parseJava(trace), notes };
}

function parsePython(trace: string): StackFrame[] {
  const frames: StackFrame[] = [];
  // File "path/to/file.py", line 12, in func
  const re = /File "([^"]+)", line (\d+)(?:, in (\S+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trace))) {
    frames.push({
      file: m[1],
      line: Number(m[2]),
      column: 0,
      functionName: m[3],
    });
  }
  return frames;
}

function parseJava(trace: string): StackFrame[] {
  const frames: StackFrame[] = [];
  // at com.example.Foo.bar(Foo.java:42)
  const re = /at\s+([\w.$]+)\(([^:]+):(\d+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trace))) {
    frames.push({
      file: m[2],
      line: Number(m[3]),
      column: 0,
      functionName: m[1],
    });
  }
  return frames;
}

/** Extract build id / git SHA hints from the raw trace text. */
export function extractBuildId(trace: string): string | undefined {
  const patterns = [
    /sourceURL=.*\.([0-9a-f]{7,40})\.js/i,
    /(?:build|version|commit|revision|sha)[=:\s]+([0-9a-f]{7,40})/i,
    /\b([0-9a-f]{40})\b/,
    /\b([0-9a-f]{7,12})\b(?=.*(?:build|deploy|commit))/i,
  ];
  for (const re of patterns) {
    const m = trace.match(re);
    if (m?.[1]) {
      return m[1];
    }
  }
  return undefined;
}
