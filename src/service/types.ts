export type TraceFormat = 'v8' | 'python' | 'java' | 'unknown';

export interface StackFrame {
  file: string;
  line: number;
  column: number;
  functionName?: string;
}

export type ResolveMethod = 'sourcemap' | 'direct' | 'unresolved';

export interface ResolvedFrame {
  original: StackFrame;
  resolved: StackFrame;
  method: ResolveMethod;
  mapFile?: string;
  note?: string;
}

export interface ResolveReport {
  format: TraceFormat;
  frames: ResolvedFrame[];
  buildId?: string;
  commitSha?: string;
  commitFoundLocally: boolean;
  notes: string[];
  resolvedAt: string;
}
