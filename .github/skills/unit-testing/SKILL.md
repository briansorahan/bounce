---
name: unit-testing
description: Guide for writing, running, and verifying unit tests in Bounce. Covers test file structure, coverage toolchain (c8 + V8), coding rules for accurate source maps, the window.electron mock pattern, and CI integration with Codecov.
license: ISC
metadata:
  author: briansorahan
  version: "1.0"
  created: "2026-04-18"
---

# Skill: Unit Testing

## Purpose

This skill guides you through writing unit tests for Bounce. It covers file structure, assertion patterns, wiring into npm scripts, collecting coverage, and the coding guidelines that keep coverage reports accurate.

## When to Use

- Adding tests for a new or existing TypeScript module
- Adding tests for a native-addon wrapper (FluCoMa, miniaudio)
- Improving code coverage on a file that's below the 80% gate
- Verifying that a bug fix doesn't regress

## When NOT to Use

- **Workflow tests** (integration tests that exercise services through the RPC layer without Electron) — see `tests/workflows/` and follow the existing DAG runner pattern
- **E2e tests** (Playwright specs that launch real Electron) — run `./build.sh`, never raw `npx playwright test`

---

## Test Tiers Overview

Bounce has three tiers of tests. This skill covers Tier 1.

| Tier | Location | Runner | What it tests |
|------|----------|--------|---------------|
| 1 — Unit | `src/*.test.ts` | `tsx` (esbuild) | Pure TS modules, native-addon wrappers, parsers, result classes |
| 2 — Workflow | `tests/workflows/*.workflow.ts` | `tsx` via `tests/workflows/run.ts` | Main-process services through RPC (in-memory store, real native addons, no Electron) |
| 3 — E2e | `tests/*.spec.ts` | Playwright inside Docker (`./build.sh`) | Full Electron app, REPL commands, terminal rendering, visualization |

---

## Step-by-Step: Adding a Unit Test

### Step 1: Create the test file

Place it in `src/` next to the module it tests. Name it `<module>.test.ts`:

```
src/
  normalization.ts          ← module under test
  normalization.test.ts     ← test file
```

### Step 2: Write the test

Use `node:assert/strict` and block-scoped test groups. No test framework — plain Node assertions:

```typescript
/**
 * Unit tests for src/normalization.ts
 */

import assert from "node:assert/strict";
import { Normalization } from "./normalization";

// ---------------------------------------------------------------------------
// fit() + transform()
// ---------------------------------------------------------------------------

{
  console.log("Normalization fit + transform...");

  const norm = new Normalization();
  norm.fit([[0, 10], [5, 30], [10, 20]]);
  const result = norm.transform([[0, 10], [5, 30], [10, 20]]);

  assert.equal(result.length, 3, "output has same number of rows");
  assert.ok(Math.abs(result[0][0] - 0.0) < 1e-6, "col0 row0 → 0.0");
  assert.ok(Math.abs(result[1][0] - 0.5) < 1e-6, "col0 row1 → 0.5");

  console.log("  ✓ fit + transform");
}

// ---------------------------------------------------------------------------
// clear() resets state
// ---------------------------------------------------------------------------

{
  console.log("Normalization clear...");

  const norm = new Normalization();
  norm.fit([[0], [10]]);
  norm.clear();
  norm.fit([[0], [20]]);
  const after = norm.transformFrame([10]);
  assert.ok(Math.abs(after[0] - 0.5) < 1e-6, "re-fitted correctly after clear");

  console.log("  ✓ clear");
}

console.log("\nAll normalization tests passed.");
```

Key conventions:
- **Block-scoped groups** (`{ ... }`) isolate variables between test cases
- **Console.log labels** before each group, `✓` after — provides readable output
- **Descriptive assertion messages** — the second argument to `assert.*` is mandatory
- **Final summary line** at the end of the file

### Step 3: Wire the test into npm scripts

Open `package.json` and add the new file to **both** `"test"` and `"test:coverage"`:

```
"test": "... && tsx --tsconfig tsconfig.renderer.json src/normalization.test.ts && ...",
"test:coverage": "... && NODE_V8_COVERAGE=coverage/tmp tsx --tsconfig tsconfig.renderer.json src/normalization.test.ts && ...",
```

⚠️ **Both scripts must be updated.** The `test:coverage` variant adds `NODE_V8_COVERAGE=coverage/tmp` before each `tsx` invocation. If you only add to `test`, coverage won't be collected; if you only add to `test:coverage`, the fast `npm test` path won't run your tests.

### Step 4: Run and verify

```bash
npm test                  # all tests pass
npm run test:coverage     # generates coverage report
npm run lint              # no lint errors
```

Check the coverage report output for your module — it should show improved line/branch numbers.

---

## Coverage Toolchain

### How It Works

Coverage uses **c8** with **V8's built-in coverage engine** — no Istanbul, no bytecode rewriting.

1. Each `tsx` invocation writes raw V8 coverage JSON to `coverage/tmp/`
2. `c8 report` merges all JSON files and maps byte offsets back to TypeScript source via esbuild's source maps
3. Output: `coverage/lcov.info` (for Codecov), `coverage/index.html` (for humans)

### CI Integration

The GitHub Actions `test` job runs `npm run test:coverage` and uploads `coverage/lcov.info` to **Codecov**. Thresholds are defined in `codecov.yml`:

| Gate | Target | Threshold |
|------|--------|-----------|
| Project (overall) | 80% | 1% drift allowed |
| Patch (new code in PRs) | 80% | 5% drift allowed |

The Codecov upload step uses `fail_ci_if_error: true` — CI fails if the upload fails.

### What's Excluded from Coverage

`codecov.yml` ignores files where unit-test coverage is impossible or meaningless:

| Category | Reason | Examples |
|----------|--------|----------|
| Electron main process | Requires live Electron (`ipcMain`, `BrowserWindow`) | `src/electron/main.ts`, `src/electron/ipc/**` |
| Renderer UI | Requires `window`, Canvas 2D, xterm.js DOM | `src/renderer/app.ts`, `*-visualizer.ts` |
| Namespace objects | Forward every call to `window.electron.*` IPC | `src/renderer/namespaces/**` |
| Utility sub-processes | Electron utility-process code | `src/utility/**` |
| Type-only / generated | No executable runtime statements | `src/shared/ipc-contract.ts`, `*.generated.ts` |
| Source-map misattribution | Decorator + `#` field interaction (see below) | `src/renderer/results/pattern.ts` |

These files are tested by Tier 2 workflow tests and Tier 3 e2e tests — they're excluded from the line-coverage gate because c8 can't attribute their bytecode without a running Electron process.

---

## Coding Rules for Accurate Coverage

### Rule 1: Use `#x` native private fields, not TypeScript `private`

TypeScript's `private` keyword is erased at compile time. esbuild outputs a bare class-field declaration (`x;`) whose bytecode sits in the constructor initializer region. V8 can't cleanly attribute those bytes to a source line, so **method bodies on the same class appear uncovered even when called**.

JS-native `#x` fields are emitted verbatim by esbuild with 1:1 source maps. V8 understands them natively → accurate coverage.

```typescript
// ✗ Bad — coverage will be artificially low
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

This also applies to `private readonly` parameter properties — convert to `readonly #field` with an explicit constructor assignment and a public getter if external access is needed.

### Rule 2: Avoid combining legacy decorators with `#` fields

Files using **both** legacy TypeScript decorators (`@replType`, `@describe`) and native `#` fields trigger a double-transform in esbuild. The composed source map drifts enough that c8 misattributes lines.

If you must use both, add the file to `codecov.yml`'s ignore list with a comment explaining the source-map limitation.

### Rule 3: Mock `window.electron` with save/restore

The `test-hygiene.test.ts` rule `no-unguarded-global-mock` requires restoring the original value:

```typescript
const original = (globalThis as Record<string, unknown>).window;
(globalThis as Record<string, unknown>).window = { electron: mockElectron };
try {
  // … tests …
} finally {
  (globalThis as Record<string, unknown>).window = original;
}
```

### Rule 4: Use temp directories for file fixtures

The `no-dirname-test-files` hygiene rule forbids writing fixtures to `__dirname`. Use `os.tmpdir()` or `fs.mkdtempSync()`:

```typescript
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-test-"));
const wavPath = path.join(tmpDir, "test.wav");
// … create fixture, run tests …
fs.rmSync(tmpDir, { recursive: true, force: true });
```

---

## Test Hygiene Rules

`src/test-hygiene.test.ts` runs automatically as part of `npm test` and enforces structural rules:

| Rule | Scope | What it catches |
|------|-------|-----------------|
| `no-waitForTimeout` | e2e | Hardcoded `waitForTimeout(ms)` — use condition-based waits |
| `no-dirname-test-files` | e2e | Writing fixtures to `__dirname` — use temp dirs |
| `no-unguarded-global-mock` | unit | Setting `globalThis.window` without cleanup |
| `no-fragile-array-index` | e2e | `samples[0]` — find by name or hash |

Add `// flaky-ok: <reason>` on the offending line to exempt intentional uses.

---

## Pre-Commit Hook

`scripts/check-no-debug-logging.sh` prevents committing `window.electron.debugLog` calls.

---

## Checklist

Before considering a test complete, verify:

- [ ] Test file is at `src/<module>.test.ts`
- [ ] Uses `node:assert/strict` with descriptive messages
- [ ] Each test group is block-scoped (`{ ... }`)
- [ ] File ends with a summary `console.log`
- [ ] Added to **both** `"test"` and `"test:coverage"` in `package.json`
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:coverage` shows improved coverage for the target module
- [ ] No `private` keyword used — `#x` native private fields only
- [ ] Any `globalThis.window` mock is wrapped in try/finally
- [ ] File fixtures use temp directories, not `__dirname`

---

## Quick Reference

| Task | Command |
|------|---------|
| Run unit + workflow tests | `npm test` |
| Run tests with coverage | `npm run test:coverage` |
| Run e2e tests (Docker) | `./build.sh` |
| Lint | `npm run lint` |
| View HTML coverage report | `open coverage/index.html` |
| Rebuild native addons | `npm run rebuild` |
