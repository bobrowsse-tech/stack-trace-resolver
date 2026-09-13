import * as fs from 'fs';
import * as path from 'path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import type { ResolvedFrame, StackFrame } from './types';

export interface SourcemapOptions {
  /** Extra directories to search for .map files (e.g. dist/). */
  buildDirs?: string[];
}

function readSourceMappingUrl(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const m = text.match(/\/\/[#@]\s*sourceMappingURL=(\S+)\s*$/m);
  return m?.[1];
}

function findMapForFile(workspaceRoot: string, frameFile: string, buildDirs: string[]): string | undefined {
  const candidates: string[] = [];

  // Absolute or workspace-relative path as given in the frame
  const asIs = path.isAbsolute(frameFile)
    ? frameFile
    : path.join(workspaceRoot, frameFile);
  candidates.push(asIs);
  candidates.push(asIs + '.map');

  const base = path.basename(frameFile);
  for (const dir of buildDirs) {
    candidates.push(path.join(workspaceRoot, dir, base));
    candidates.push(path.join(workspaceRoot, dir, base + '.map'));
  }

  for (const c of candidates) {
    if (c.endsWith('.map') && fs.existsSync(c)) {
      return c;
    }
    if (fs.existsSync(c)) {
      const url = readSourceMappingUrl(c);
      if (url) {
        if (url.startsWith('data:')) {
          return c; // inline — handled by caller via file content
        }
        const mapPath = path.isAbsolute(url) ? url : path.join(path.dirname(c), url);
        if (fs.existsSync(mapPath)) {
          return mapPath;
        }
      }
      if (fs.existsSync(c + '.map')) {
        return c + '.map';
      }
    }
  }
  return undefined;
}

function loadTraceMap(mapPath: string, generatedFile?: string): TraceMap | undefined {
  try {
    if (generatedFile && mapPath === generatedFile) {
      // Inline data URL case — extract from comment
      const text = fs.readFileSync(generatedFile, 'utf8');
      const m = text.match(/sourceMappingURL=data:application\/json[^,]*;base64,([A-Za-z0-9+/=]+)/);
      if (m) {
        const json = Buffer.from(m[1], 'base64').toString('utf8');
        return new TraceMap(JSON.parse(json));
      }
      return undefined;
    }
    const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    return new TraceMap(raw);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a JS frame through its sourcemap when available.
 */
export function resolveFrame(
  workspaceRoot: string,
  frame: StackFrame,
  options: SourcemapOptions = {}
): ResolvedFrame {
  const buildDirs = options.buildDirs ?? ['dist', 'build', 'out', '.next'];
  const isJs =
    /\.(js|mjs|cjs|jsx|tsx?|vue)(\?|$)/i.test(frame.file) ||
    frame.file.includes('.js') ||
    !/\.(py|java)$/i.test(frame.file);

  if (!isJs || /\.(py|java)$/i.test(frame.file)) {
    return {
      original: frame,
      resolved: frame,
      method: 'direct',
      note: 'Language typically ships unminified — using frame as-is',
    };
  }

  const mapPath = findMapForFile(workspaceRoot, frame.file, buildDirs);
  if (!mapPath) {
    return {
      original: frame,
      resolved: frame,
      method: 'unresolved',
      note: 'No sourcemap available — showing minified frame as-is',
    };
  }

  const generatedPath = mapPath.endsWith('.map')
    ? mapPath.replace(/\.map$/, '')
    : undefined;
  const tracer = loadTraceMap(mapPath, mapPath.endsWith('.map') ? undefined : generatedPath);
  if (!tracer) {
    return {
      original: frame,
      resolved: frame,
      method: 'unresolved',
      note: 'Sourcemap could not be parsed — showing minified frame as-is',
      mapFile: mapPath,
    };
  }

  const pos = originalPositionFor(tracer, {
    line: frame.line,
    column: Math.max(0, frame.column),
  });

  if (!pos.source || pos.line == null) {
    return {
      original: frame,
      resolved: frame,
      method: 'unresolved',
      note: 'Sourcemap had no mapping for this position',
      mapFile: mapPath,
    };
  }

  return {
    original: frame,
    resolved: {
      file: pos.source,
      line: pos.line,
      column: pos.column ?? 0,
      functionName: pos.name ?? frame.functionName,
    },
    method: 'sourcemap',
    mapFile: mapPath,
  };
}

export function resolveFrames(
  workspaceRoot: string,
  frames: StackFrame[],
  options?: SourcemapOptions
): ResolvedFrame[] {
  return frames.map((f) => resolveFrame(workspaceRoot, f, options));
}
