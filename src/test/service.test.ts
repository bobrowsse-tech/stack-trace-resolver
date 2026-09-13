import * as path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  StackTraceService,
  detectFormat,
  extractBuildId,
  parseFrames,
  resolveFrame,
  resolveCommit,
} from '../service';

const fixtures = path.join(__dirname, 'fixtures');

describe('detectFormat / parseFrames', () => {
  it('parses V8 frames', () => {
    const trace = `Error: boom
    at boom (dist/bundle.js:1:35)
    at Object.<anonymous> (dist/bundle.js:1:50)`;
    assert.equal(detectFormat(trace), 'v8');
    const { frames } = parseFrames(trace);
    assert.ok(frames.length >= 1);
    assert.match(frames[0].file, /bundle\.js/);
  });

  it('parses Python frames', () => {
    const trace = `Traceback (most recent call last):
  File "app.py", line 12, in main
    boom()
  File "app.py", line 4, in boom
    raise ValueError("x")
ValueError: x`;
    assert.equal(detectFormat(trace), 'python');
    const { frames } = parseFrames(trace);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].file, 'app.py');
    assert.equal(frames[0].line, 12);
  });

  it('parses Java frames', () => {
    const trace = `Exception in thread "main" java.lang.RuntimeException: fail
\tat com.example.Foo.bar(Foo.java:42)
\tat com.example.Main.main(Main.java:10)`;
    assert.equal(detectFormat(trace), 'java');
    const { frames } = parseFrames(trace);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].file, 'Foo.java');
    assert.equal(frames[0].line, 42);
  });

  it('names unsupported formats', () => {
    const { format, notes } = parseFrames('goroutine 1 [running]:\nmain.main()');
    assert.equal(format, 'unknown');
    assert.ok(notes.some((n) => /Unsupported/i.test(n)));
  });
});

describe('sourcemap resolution', () => {
  it('resolves minified frame to original source via fixture map', () => {
    const frame = {
      file: 'dist/bundle.js',
      line: 1,
      column: 28,
      functionName: 'boom',
    };
    const resolved = resolveFrame(fixtures, frame, { buildDirs: ['dist'] });
    assert.equal(resolved.method, 'sourcemap');
    assert.match(resolved.resolved.file, /app\.ts$/);
    assert.equal(resolved.resolved.line, 2);
  });

  it('marks unresolved when no map exists', () => {
    const resolved = resolveFrame(fixtures, {
      file: 'dist/missing.js',
      line: 1,
      column: 0,
    });
    assert.equal(resolved.method, 'unresolved');
    assert.match(resolved.note ?? '', /No sourcemap/i);
  });
});

describe('build id / commit', () => {
  it('extracts build SHA from version field', () => {
    const id = extractBuildId('Error: x\nversion: deadbeefcafebabe0123456789abcdef01234567\nat boom');
    assert.equal(id, 'deadbeefcafebabe0123456789abcdef01234567');
  });

  it('notes when commit is not found locally', async () => {
    const fake = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const result = await resolveCommit(fixtures, fake);
    assert.equal(result.found, false);
    assert.match(result.note ?? '', /not found locally|not a git repo/i);
  });
});

describe('StackTraceService', () => {
  it('end-to-end resolves fixture V8 trace through sourcemap', async () => {
    const trace = `Error: boom
    at boom (dist/bundle.js:1:28)
version: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
    const service = new StackTraceService(fixtures);
    const report = await service.resolve(trace, { buildDirs: ['dist'] });
    assert.equal(report.format, 'v8');
    assert.ok(report.frames.some((f) => f.method === 'sourcemap'));
    assert.equal(report.commitFoundLocally, false);
    assert.ok(report.notes.some((n) => /not found locally|not a git repo/i.test(n)));
    assert.match(service.formatReport(report), /\[sourcemap\]/);
  });
});
