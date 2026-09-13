# Reverse Stack-Trace Lookup

Pastes a production stack trace and jumps straight to the real source line, even through minification and past commits.

## Status

Scaffold generated. Core logic is not yet implemented — see `DIRECTIVE.md` for the full build plan.

## Development

```bash
npm install
npm run watch    # esbuild + tsc in watch mode
```

Then press `F5` in VS Code to launch an Extension Development Host.
