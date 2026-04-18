# Testing Strategy

Bounce uses three tiers of tests, each with different speed/fidelity tradeoffs.
This document explains how they fit together, how code coverage works, and what
coding guidelines keep the coverage reports accurate.

## Test Tiers

### Tier 1 — Unit Tests (`src/*.test.ts`)

Fast, isolated tests that run under **tsx** (esbuild-backed TypeScript runner).
Each file is an independent process:

```bash
npm test          # run all unit + workflow tests
npm run lint      # ESLint
```

Unit tests may use the **native addons** (FluCoMa, miniaudio) but must not
depend on Electron, a browser window, or IPC. If a test needs `window.electron`,
it must install a temporary mock and restore the original value in a `finally`
block (see the `no-unguarded-global-mock` hygiene rule).

**When to add a unit test:** Any pure-TypeScript module, native-addon wrapper,
parser, data structure, or result class.

### Tier 2 — Workflow Tests (`tests/workflows/*.workflow.ts`)

Integration tests that exercise **main-process services** (analysis, playback,
instruments, projects, MIDI, mixer, etc.) through the typed RPC layer — without
Electron. They use `InMemoryStore` and `EventBusImpl` to replace SQLite and
real IPC, but real native addons (FluCoMa analysis, audio decoding) are loaded.

Workflow tests are run by `tests/workflows/run.ts` and are included in
`npm test`. They use a DAG runner: nodes are either *actions* (produce output)
or *checks* (assert on output), and are topologically ordered by their `after`
dependencies.

**When to add a workflow test:** Any feature that crosses the service boundary
(e.g. "read a WAV, analyse onsets, store results, query them back").

### Tier 3 — End-to-End Tests (`tests/*.spec.ts`)

Playwright tests that launch a real Electron instance with xterm.js and verify
user-facing REPL behaviour. These **must** run inside Docker with a virtual
framebuffer:

```bash
./build.sh        # Docker build + xvfb-run playwright test
```

Never run `npx playwright test` directly from a host shell — the build
environment and native modules may differ from what Electron expects.

Each spec creates a unique `BOUNCE_USER_DATA_PATH` temp directory to isolate
its SQLite database and settings from other specs.

**When to add an e2e test:** Any change to REPL commands, terminal rendering,
keyboard shortcuts, or the visualization canvas.

## Code Coverage

### Toolchain

Coverage is collected via **c8** using V8's built-in coverage engine — no
Istanbul instrumentation, no bytecode rewriting. Each `tsx` invocation writes
raw V8 coverage JSON to `coverage/tmp/`, and `c8 report` merges them at the
end into lcov, text, and HTML reports.

```bash
npm run test:coverage   # unit + workflow tests with coverage
open coverage/index.html    # browse the HTML report
```

### Why c8 + V8 Coverage?

Traditional tools (Istanbul, Jest/ts-jest) inject counting statements into
transpiled output, which requires two source-map hops (transpiler → Istanbul →
original) and is lossy. c8 reads V8's native bytecode-range coverage and maps
it back through a single esbuild source map — no code rewriting, more accurate
line attribution.

### CI Integration

The GitHub Actions `test` job runs `npm run test:coverage` and uploads
`coverage/lcov.info` to **Codecov** via `codecov/codecov-action@v5`.
The upload is configured with `fail_ci_if_error: true` — if the Codecov upload
fails or the token is missing, CI fails.

Coverage thresholds are enforced by `codecov.yml`:

| Gate | Target | Threshold |
|------|--------|-----------|
| Project (overall) | 80% | 1% drift allowed |
| Patch (new code in PRs) | 80% | 5% drift allowed |

### What We Ignore (and Why)

The `codecov.yml` ignore list excludes files where unit-test coverage is either
impossible or meaningless. Every exclusion falls into one of five categories:

| Category | Reason | Examples |
|----------|--------|----------|
| **Electron main process** | Requires a live Electron runtime (`ipcMain`, `BrowserWindow`, `app`) | `src/electron/main.ts`, `src/electron/ipc/**`, `src/electron/database.ts` |
| **Renderer UI** | Requires `window`, Canvas 2D, xterm.js DOM | `src/renderer/app.ts`, `*-visualizer.ts`, `src/renderer/terminal.ts` |
| **Namespace objects** | Proxy classes that forward every call to `window.electron.*` IPC | `src/renderer/namespaces/**` |
| **Utility sub-processes** | Electron utility-process code (audio engine, language service) | `src/utility/**` |
| **Type-only / generated** | No executable runtime statements | `src/shared/ipc-contract.ts`, `src/**/*.generated.ts` |
| **Source-map misattribution** | Esbuild decorator + `#` private-field interaction (see below) | `src/renderer/results/pattern.ts`, `src/renderer/results/instrument.ts` |

These files are still tested — by **Tier 2 workflow tests** (services behind
the IPC handlers) and **Tier 3 e2e tests** (the full Electron app). They are
only excluded from the line-coverage gate because c8 cannot attribute their
bytecode accurately without a running Electron process.

## Coding Guidelines for Accurate Coverage

### Use JS-native private fields (`#x`), not TypeScript `private`

TypeScript's `private` keyword is a compile-time-only check. esbuild erases it
and emits a bare class-field declaration (`x;`) whose bytecode sits in the
constructor initializer region. V8's coverage engine can't cleanly attribute
those bytes to a specific TypeScript source line, causing method bodies on the
same class to appear uncovered even when called.

JS-native `#x` private fields cannot be polyfilled, so esbuild emits them
**verbatim** with a 1:1 source map. V8 understands `#x` natively and produces
accurate per-line coverage.

```typescript
// ✗ Bad — coverage will be artificially low on method bodies
class Foo {
  private bar: number;
  constructor() { this.bar = 0; }
  inc() { this.bar++; }
}

// ✓ Good — accurate coverage
class Foo {
  #bar: number;
  constructor() { this.#bar = 0; }
  inc() { this.#bar++; }
}
```

This applies to `private readonly` parameter properties as well — convert them
to `readonly #field` with an explicit assignment in the constructor and a
public getter if external access is needed.

### Legacy decorators + `#` fields = source-map misalignment

Files that combine **legacy TypeScript decorators** (`@replType`, `@describe`)
with **native private fields** trigger a double-transform in esbuild: decorator
helpers + private-field accessor helpers. The composed source map drifts enough
that c8 misattributes lines. V8's function-level coverage still shows 100%
coverage, but line numbers are wrong.

If you must use both in the same file, add the file to `codecov.yml`'s ignore
list with a comment explaining why. Prefer moving decorator usage out of files
that need private fields.

### Wire new test files into both npm scripts

The `test` and `test:coverage` scripts in `package.json` explicitly list every
`tsx` invocation. When you add a new `src/*.test.ts` file, add it to **both**
scripts or it won't run and coverage won't be collected. The
`test-hygiene.test.ts` meta-test auto-discovers `.test.ts` files for rule
scanning, but it does not verify they're listed in the npm scripts.

### Avoid `globalThis.window` leaks

The `no-unguarded-global-mock` hygiene rule requires that any test setting
`globalThis.window` also restores the original value. Use a try/finally:

```typescript
const original = (globalThis as any).window;
(globalThis as any).window = { electron: mockElectron };
try {
  // … tests …
} finally {
  (globalThis as any).window = original;
}
```

### Keep e2e fixtures isolated

The `no-dirname-test-files` hygiene rule forbids writing WAV fixtures to
`__dirname` (risks collisions in parallel runs). Use `os.tmpdir()` or
`fs.mkdtempSync()`. E2e specs should set `BOUNCE_USER_DATA_PATH` to a per-test
temp directory to avoid SQLite contention.

## Test Hygiene Rules

`src/test-hygiene.test.ts` runs automatically as part of `npm test` and
enforces structural rules across all test files:

| Rule | Scope | What it catches |
|------|-------|-----------------|
| `no-waitForTimeout` | e2e | Hardcoded `waitForTimeout(ms)` — use condition-based waits instead |
| `no-dirname-test-files` | e2e | Writing fixtures to `__dirname` — use temp dirs |
| `no-unguarded-global-mock` | unit | Setting `globalThis.window` without cleanup |
| `no-fragile-array-index` | e2e | `samples[0]` — find by name or hash instead |

Add `// flaky-ok: <reason>` on the offending line to exempt intentional uses.

## Pre-Commit Hook

`scripts/check-no-debug-logging.sh` prevents committing
`window.electron.debugLog` calls. The git pre-commit hook runs this script
automatically.

## Quick Reference

| Task | Command |
|------|---------|
| Run unit + workflow tests | `npm test` |
| Run tests with coverage | `npm run test:coverage` |
| Run e2e tests (Docker) | `./build.sh` |
| Lint | `npm run lint` |
| View HTML coverage report | `open coverage/index.html` |
| Rebuild native addons | `npm run rebuild` |
