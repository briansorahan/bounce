# Plan: Help System Checks

**Spec:** specs/help-system-checks  
**Created:** 2026-03-28  
**Status:** In Progress

## Context

Research (RESEARCH.md) found that all 11 namespaces have namespace-level `help()`, but 5 namespaces (`corpus`, `midi`, `transport`, `pat`, `mx`) have 0% command-level help coverage (~19 missing `.help()` methods). Help text is scattered string literals with no shared data structure. There's no automated verification that namespace `help()` actually lists every exposed command.

## Approach Summary

1. Define a `CommandHelp` interface as the single source of truth for help metadata.
2. Create rendering utilities (`renderNamespaceHelp`, `renderCommandHelp`) that generate ANSI-formatted `BounceResult` from metadata.
3. Create a `withHelp(fn, meta)` utility that attaches `.help()` to any function via `Object.assign`.
4. Migrate all namespace builders to declare a `CommandHelp[]` array and use it to generate both namespace-level and command-level help.
5. Fill in the ~19 missing command-level `.help()` methods.
6. Write a unit test that structurally verifies complete help coverage.

## Architecture Changes

New file: `src/renderer/help.ts` — contains `CommandHelp` interface, rendering functions, and `withHelp` utility. No new processes, IPC channels, or native code.

Existing namespace builder files in `src/renderer/namespaces/` are refactored to use the new infrastructure. The external behavior (what help text is shown) may change in formatting but the information content stays the same.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### New file: `src/renderer/help.ts`

```typescript
export interface CommandHelp {
  name: string;        // e.g. "read"
  signature: string;   // e.g. "sn.read(path)"
  summary: string;     // one-line for namespace help() listing
  description?: string;
  params?: Array<{ name: string; type: string; description: string; optional?: boolean }>;
  examples?: string[];
}

export function renderNamespaceHelp(
  nsName: string,
  nsDescription: string,
  commands: CommandHelp[],
): BounceResult { /* ... */ }

export function renderCommandHelp(cmd: CommandHelp): BounceResult { /* ... */ }

export function withHelp<F extends (...args: any[]) => any>(
  fn: F,
  meta: CommandHelp,
): F & { help: () => BounceResult } {
  return Object.assign(fn, { help: () => renderCommandHelp(meta) });
}
```

#### Modified namespace files (all in `src/renderer/namespaces/`)

Each namespace builder migrates to this pattern:

```typescript
import { CommandHelp, renderNamespaceHelp, withHelp } from "../help.js";

const commands: CommandHelp[] = [
  { name: "build", signature: "corpus.build(source?)", summary: "Build a KDTree from onset slices", ... },
  { name: "query", signature: "corpus.query(index, k?)", summary: "Find nearest neighbors", ... },
  ...
];

const corpus = {
  help: () => renderNamespaceHelp("corpus", "KDTree corpus for nearest-neighbor resynthesis", commands),
  build: withHelp(async function build(...) { ... }, commands[0]),
  query: withHelp(async function query(...) { ... }, commands[1]),
  ...
};
```

**Files to modify:**
- `src/renderer/namespaces/fs-namespace.ts` — already 100% coverage, migrate to CommandHelp metadata
- `src/renderer/namespaces/vis-namespace.ts` — already 100%, migrate to CommandHelp
- `src/renderer/namespaces/env-namespace.ts` — already 100%, migrate to CommandHelp
- `src/renderer/namespaces/instrument-namespace.ts` — already 100%, migrate to CommandHelp
- `src/renderer/namespaces/project-namespace.ts` — already 100%, migrate from post-assignment to CommandHelp
- `src/renderer/namespaces/sample-namespace.ts` — already 100% at ns level, migrate from post-assignment to CommandHelp
- `src/renderer/namespaces/corpus-namespace.ts` — **add** command-level help via withHelp (3 commands)
- `src/renderer/namespaces/midi-namespace.ts` — **add** command-level help via withHelp (6 commands)
- `src/renderer/namespaces/transport-namespace.ts` — **add** command-level help via withHelp (3 commands)
- `src/renderer/namespaces/pat-namespace.ts` — **add** command-level help via withHelp (1 command: xox)
- `src/renderer/namespaces/mixer-namespace.ts` — **add** command-level help via withHelp (namespace-level commands: ch)
- `src/renderer/namespaces/globals.ts` — migrate existing help to CommandHelp metadata

#### New test file: `src/help-system.test.ts`

Unit test using `node:assert/strict` that:
1. Builds all namespaces with mocked `NamespaceDeps` and a stub `window.electron`
2. For each namespace, asserts it has a `help()` method
3. Uses `getCallablePropertyNames()` to enumerate commands (excluding `help` itself)
4. For each command, asserts it has a `.help` function property
5. Calls the namespace `help()`, converts to string, and asserts the output contains a reference to each command name

### Terminal UI Changes

Help output formatting becomes standardized via `renderNamespaceHelp` and `renderCommandHelp`. The visual structure stays the same (ANSI-colored headings, parameter lists, examples) but becomes consistent across all namespaces.

### REPL Interface Contract

No new REPL-facing API surface. Existing `namespace.help()` and `command.help()` keep returning `BounceResult`. The only change is that previously-missing `command.help()` methods now exist on corpus, midi, transport, pat, and mx commands.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [x] Unit tests and/or Playwright tests are identified for `help()` output
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

None. The new file `src/renderer/help.ts` is automatically included by existing tsconfig.

## Testing Strategy

### Unit Tests

**`src/help-system.test.ts`** — the core deliverable of this spec:

```typescript
// For each namespace (sn, vis, fs, proj, env, corpus, midi, transport, pat, mx, inst):
//   1. Verify namespace.help() exists and is callable
//   2. Enumerate callable properties (excluding "help")
//   3. For each property, verify it has a .help function
//   4. Call namespace.help().toString()
//   5. For each command name, verify it appears in the help output

// For globals (help, clear, debug, clearDebug, errors):
//   1. Verify each has a .help function
```

**Mocking strategy:** Create a minimal `window.electron` stub that provides no-op functions for IPC methods called during namespace construction (e.g. `onTransportTick`, `onMixerLevels`, `onMidiEvent`). The test never calls actual commands — only `.help()` methods and property enumeration.

**`src/help.test.ts`** — unit tests for the rendering utilities:
- `renderNamespaceHelp` produces output containing each command's name and summary
- `renderCommandHelp` produces output containing signature, description, params, examples
- `withHelp` attaches a callable `.help` to any function

### E2E Tests

No new Playwright tests. Existing E2E tests for help (e.g. `instrument.spec.ts` help tests) continue to pass.

### Manual Testing

- Launch the app, type `sn.help()`, verify the output looks good
- Type `corpus.build.help()` (previously missing), verify it works
- Type `midi.record.help()` (previously missing), verify it works

## Success Criteria

1. Every namespace command has a `.help()` method (verified by unit test)
2. Every namespace `help()` output references every command in that namespace (verified by unit test)
3. `npm test` passes (including new help-system.test.ts)
4. `npm run lint` passes
5. `npm run build:electron` succeeds
6. `./build.sh` passes (Dockerized Playwright suite)

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| `window.electron` references during namespace construction break unit tests | Create a comprehensive stub in the test setup; only methods called during `build*Namespace()` need stubs |
| Existing help text formatting changes break Playwright tests | Playwright tests check for text fragments, not exact formatting — low risk. Verify by running `./build.sh` |
| `SampleNamespace` and `ProjectNamespace` class-based patterns resist the `withHelp` approach | These classes use bindings objects; we can integrate CommandHelp into the bindings pattern rather than forcing Object.assign |
| Scope creep into result object methods (Sample.play.help, ChannelControl.gain.help) | Explicitly out of scope — test only enumerates namespace-level commands |

## Implementation Order

1. Create `src/renderer/help.ts` with `CommandHelp`, rendering functions, and `withHelp`
2. Create `src/help.test.ts` to test the rendering utilities
3. Create `src/help-system.test.ts` with the structural coverage test (will fail initially for namespaces missing command help)
4. Migrate `fs-namespace.ts` as the reference implementation (already 100% — mechanical migration)
5. Migrate remaining 100%-coverage namespaces: `vis`, `env`, `inst`, `proj`, `sn`, `globals`
6. Add missing command-level help to `corpus`, `midi`, `transport`, `pat`, `mx`
7. Verify `npm test`, `npm run lint`, `npm run build:electron` all pass
8. Run `./build.sh` for full Playwright verification

## Estimated Scope

Medium — ~12 files modified/created, mostly mechanical refactoring with some new help text to write.

## Out of Scope

- Tutorial system (follow-up spec)
- Result object method help (e.g. `Sample.play.help()`, `ChannelControl.gain.help()`)
- Online documentation generation from help metadata

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
