
# Build Directive — Reverse Stack-Trace Lookup

> Rank **#8** in the Unbuilt VS Code Tools roadmap. This directive is written for an AI coding agent (Claude Code, Copilot agent mode, or a human following along) to execute directly. The `stack-trace-resolver/` folder next to this file already contains a working scaffold — activation, side-panel dashboard, command registration, and a Language Model Tool stub — generated per the shared conventions in `../AGENTS.md`. Everything marked `TODO` below is the real remaining work.

## 1. Objective

Resolve a pasted production error's stack frames through the matching build's sourcemaps back to real source locations, and where the trace embeds a build/version identifier, map that to the exact git commit so the jump lands on the code as it was at deploy time, not as it is on HEAD today.

## 2. Why this doesn't already exist

APM tools (Sentry, Datadog) do this well, but only inside their own dashboard and only if the team is instrumented with and paying for that specific vendor. Nothing works generically from a trace pasted out of a log line or a Slack message.

## 3. VS Code surfaces this extension uses

- **Activity bar view container**: `stack-trace-resolverContainer` (icon: `debug`)
- **Side panel dashboard**: `stack-trace-resolverView`, a `WebviewViewProvider` — see `src/dashboardProvider.ts`
- **Commands**: `stackTrace.paste`, `stackTrace.resolve`, `stackTrace.jumpToCommit`
- **Language Model Tool**: `resolve_stack_trace` — see `src/lmTool.ts` and `contributes.languageModelTools` in `package.json`. This is what lets Copilot Chat, Claude Code, or any other MCP/agent-aware surface invoke this extension's core action conversationally instead of the user hunting for the right command.

## 4. Dashboard (side panel) spec

The sidebar webview is the primary UI. It must show, at minimum, the buttons below plus a status/summary area above them (current scan state, last-run timestamp, or a short result summary — specifics depend on the feature, see phase notes).

| Button | Command | Behavior |
|---|---|---|
| **Paste Trace** | `stackTrace.paste` | Opens an input panel for a raw stack trace, auto-detecting the stack format (V8, Python traceback, Java) to pick the right frame parser. |
| **Resolve** | `stackTrace.resolve` | Resolves every frame through its matching sourcemap (or, for Python/Java, directly since those aren't typically minified) and lists real file:line for each. |
| **Jump to Commit** | `stackTrace.jumpToCommit` | If the trace or an accompanying build id maps to a known git commit, opens that file as of that commit instead of the current working tree. |

Buttons call `vscode.commands.executeCommand`, not the tool logic directly — keep exactly one implementation of the core logic (a plain TypeScript service module with no VS Code imports) called from three places: the command handler, the dashboard's message handler, and the Language Model Tool's `invoke`. Do not fork the logic across these three entry points.

## 5. Implementation phases

1. **Frame parsing** — Detect trace format from its shape (a `stacktrace-parser`-compatible V8 trace vs. a Python `Traceback (most recent call last):` block vs. a Java trace) and parse into a normalized `{file, line, column, functionName}[]`.
2. **Sourcemap resolution** — For JS/TS frames pointing at a built/minified file, locate the matching `.map` file (adjacent `//# sourceMappingURL=` comment, or a configured build output directory) and resolve the real position with `@jridgewell/trace-mapping`'s `originalPositionFor`.
3. **Build-to-commit mapping** — If the deploy pipeline embeds a build id or git SHA in the trace's source (a common pattern: a `//# sourceURL=app.<sha>.js` comment, or a `version` field the team logs alongside the error), use `simple-git` to check whether that commit exists locally and, if so, open the resolved file as of that commit via `git show <sha>:<path>` rather than assuming HEAD matches what was actually deployed.
4. **Dashboard wiring** — WebviewView with a paste box, a 'Resolve' button, and the resolved frame list — each frame clickable, showing a small badge when it resolved via sourcemap vs. directly, and a git-commit badge when historical resolution applied.
5. **Language Model Tool** — Register `resolve_stack_trace` so an agent debugging from a pasted error can jump straight to real source instead of guessing from minified frames.
6. **Tests** — Fixture minified bundle + sourcemap pair with a known original position, asserting exact resolution; a fixture trace with an embedded SHA not present locally, asserting a clear 'commit not found locally, showing HEAD instead' fallback message rather than a silent wrong answer.

## 6. Suggested dependencies

`@jridgewell/trace-mapping`, `stacktrace-parser`, `simple-git`

Install as regular `dependencies` (already stubbed into `package.json` — replace the `"latest"` version pins with the actual resolved versions once installed, per the pinning convention in `AGENTS.md`).

## 7. Edge cases & safety notes

- No sourcemap available for a given build — fall back to showing the minified frame as-is with an explicit 'unresolved' marker rather than a wrong guess.
- A trace pasted from a language the extension doesn't yet parse (e.g. Go) should say so plainly and name what's supported, not fail silently.

## 8. Definition of done

- [ ] Core logic lives in a VS Code-free service module, unit-tested against fixtures (see phase notes above for what fixtures to build).
- [ ] All buttons in the dashboard spec are wired to real behavior, not the placeholder `showInformationMessage` stub.
- [ ] The Language Model Tool calls the same service module and returns a concise, agent-readable text result (not raw JSON dumped as text).
- [ ] No destructive or external-write action (file rewrite, PR post, process kill) runs without an explicit user-initiated click — the LM tool path in particular must stay read/report-only unless the directive above says otherwise.
- [ ] `npm run package` produces a `dist/extension.js` with no bundling warnings; `vsce package` produces a `.vsix` that installs cleanly via `code --install-extension`.
- [ ] README.md (user-facing, not this directive) documents what the extension does in plain language, per `AGENTS.md`'s copy conventions.
    