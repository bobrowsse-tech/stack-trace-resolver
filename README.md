# Reverse Stack-Trace Lookup

Paste a production stack trace and jump to real source — through sourcemaps and, when a build id is present, as of the matching git commit.

## Install

```bash
git clone https://github.com/bobrowsse-tech/stack-trace-resolver.git
cd stack-trace-resolver
npm install
npm run package
npx @vscode/vsce package --no-dependencies
code --install-extension stack-trace-resolver-0.1.0.vsix
```

Or press **F5** after `npm install`.

## Use

| Action | What it does |
|---|---|
| **Paste Trace** | V8/JS, Python, or Java formats |
| **Resolve** | Sourcemap resolution for JS; direct for Python/Java; explicit unresolved when no map |
| **Jump to Commit** | Opens the frame at the embedded SHA when that commit exists locally |

Missing sourcemaps and missing commits are labeled clearly — never a silent wrong guess.

Agents can call `resolve_stack_trace` (report-only).

## How it’s built

`stacktrace-parser` + `@jridgewell/trace-mapping` + `simple-git`; TypeScript + esbuild CJS bundle.

```bash
npm run watch
npm run test:unit
npm run package
```

## License

MIT

## Contributing

Changes to `main` must go through a pull request. See [CONTRIBUTING.md](./CONTRIBUTING.md).
