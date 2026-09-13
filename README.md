# Reverse Stack-Trace Lookup

Paste a production stack trace and jump to real source — through sourcemaps and, when a build id is present, as of the matching git commit.

1. **Paste Trace** — V8/JS, Python, or Java formats.
2. **Resolve** — sourcemap resolution for JS; direct for Python/Java; explicit unresolved markers when no map exists.
3. **Jump to Commit** — opens the frame at the embedded SHA when that commit exists locally; otherwise falls back to HEAD with a clear note.

Agents can call `resolve_stack_trace` with the raw trace text (report-only).

## Development

```bash
npm install
npm run watch
npm run test:unit
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

MIT
