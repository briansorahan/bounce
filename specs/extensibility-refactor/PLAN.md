# Plan: Extensibility Refactor

**Spec:** specs/extensibility-refactor  
**Created:** 2026-03-20  
**Status:** Ready for Implementation

## Context

The four largest TypeScript files — `bounce-api.ts` (2,619L), `bounce-result.ts` (1,284L), `database.ts` (1,229L), `main.ts` (1,017L) — contain nearly all of the application logic. Adding any new REPL namespace, IPC channel, or result type requires editing at least two of these files. IPC channels are string literals duplicated across three files with no compile-time contract, and 42 of 50 `window.electron` methods are missing from `types.d.ts`. Error handling is inconsistent: ~22 handlers silently swallow errors. The audio engine MessagePort protocol is entirely untyped.

Research resolved these decisions (see RESEARCH.md Resolved Questions):
- **Incremental, leaf-to-root** extraction order
- **Throw/catch with `BounceError`** (base class, `code: string`, no central enum)
- **`src/shared/`** for cross-process contracts
- **Defer** `database.ts` refactor and `BouncePromise<T>` generic

## Approach Summary

Decompose the four monolithic modules into small, focused files organized by domain. Establish a typed IPC contract as the single source of truth. Standardize error handling. This is a purely structural refactoring — no user-facing behavior changes except improved error messages.

The work is organized into six phases, each independently shippable and verifiable via the existing Playwright test suite. Phases 2–4 have no dependencies on each other and can be implemented in any order (all depend only on Phase 1).

## Architecture Changes

### New Directory Structure

```
src/
├── shared/                          # NEW — cross-process contracts
│   ├── ipc-contract.ts              # Channel names, request/response types
│   ├── bounce-error.ts              # BounceError base class + error codes
│   └── audio-engine-protocol.ts     # Typed MessagePort message unions
│
├── electron/
│   ├── main.ts                      # SLIMMED — bootstrap only (~200L)
│   ├── ipc/                         # NEW — extracted handler modules
│   │   ├── register.ts              # Wires all handler modules to ipcMain
│   │   ├── filesystem-handlers.ts   # fs-ls, fs-cd, fs-pwd, fs-glob, fs-walk, fs-complete-path
│   │   ├── project-handlers.ts      # get-current-project, list-projects, load-project, remove-project
│   │   ├── history-handlers.ts      # save-command, get-command-history, clear/dedupe history, debug logs
│   │   ├── sample-handlers.ts       # list-samples, get-sample-by-hash/name, create-slice-samples, derived samples
│   │   ├── feature-handlers.ts      # store-feature, get-most-recent-feature, list-features
│   │   ├── audio-handlers.ts        # read-audio-file, store-recording, play-sample, stop-sample
│   │   ├── analysis-handlers.ts     # analyze-onset-slice, analyze-buf-nmf, analyze-mfcc
│   │   ├── corpus-handlers.ts       # corpus-build, corpus-query, corpus-resynthesize
│   │   ├── nmf-handlers.ts          # analyze-nmf, visualize-nmf, sep, nx (replaces Command framework)
│   │   └── repl-handlers.ts         # save/get-repl-env, transpile-typescript
│   ├── preload.ts                   # UPDATED — typed via IPC contract
│   ├── types.d.ts                   # UPDATED — derived from IPC contract
│   ├── commands/                    # DELETED — migrated to ipc/nmf-handlers.ts
│   └── (database.ts, corpus-manager.ts, settings-store.ts — unchanged)
│
├── renderer/
│   ├── results/                     # NEW — extracted from bounce-result.ts
│   │   ├── index.ts                 # Barrel re-export for backwards compat
│   │   ├── base.ts                  # BounceResult, HelpableResult, FeatureResult
│   │   ├── sample.ts               # Sample, AudioResult, SampleListResult, SamplePromise, CurrentSamplePromise
│   │   ├── features.ts             # OnsetFeature, NmfFeature, NxFeature, MfccFeature + Promise wrappers
│   │   ├── visualization.ts        # VisScene, VisStack, VisSceneListResult, VisScenePromise
│   │   ├── project.ts              # ProjectResult, ProjectListResult
│   │   ├── filesystem.ts           # LsResult, GlobResult, LsResultPromise, GlobResultPromise
│   │   ├── recording.ts            # InputsResult, AudioDevice, RecordingHandle
│   │   └── environment.ts          # EnvScopeResult, EnvInspectionResult, EnvFunctionListResult
│   │
│   ├── namespaces/                  # NEW — extracted from bounce-api.ts
│   │   ├── types.ts                 # NamespaceDeps interface
│   │   ├── sample-namespace.ts      # buildSampleNamespace(deps) — sn
│   │   ├── vis-namespace.ts         # buildVisNamespace(deps) — vis
│   │   ├── project-namespace.ts     # buildProjectNamespace(deps) — proj
│   │   ├── env-namespace.ts         # buildEnvNamespace(deps) — env
│   │   ├── corpus-namespace.ts      # buildCorpusNamespace(deps) — corpus
│   │   ├── fs-namespace.ts          # buildFsNamespace(deps) — fs
│   │   └── globals.ts               # help(), clear(), debug(), clearDebug()
│   │
│   ├── bounce-api.ts                # SLIMMED — thin orchestrator (~100-150L)
│   ├── bounce-result.ts             # REPLACED — re-exports from results/index.ts
│   └── (app.ts, repl-evaluator.ts, etc. — unchanged)
```

### Component Diagram (After)

```
┌──────────────────────┐   Typed IPC Contract    ┌─────────────────────────┐
│   Main Process       │◄──────────────────────►│   Renderer Process       │
│  main.ts (bootstrap) │  src/shared/ipc-        │  bounce-api.ts (orch.)   │
│  ipc/register.ts     │  contract.ts            │  namespaces/*.ts         │
│  ipc/*-handlers.ts   │                         │  results/*.ts            │
│  database.ts         │                         │  app.ts                  │
│  corpus-manager.ts   │                         │  repl-evaluator.ts       │
└────────┬─────────────┘                         └──────────────────────────┘
         │ Typed MessagePort
         │ src/shared/audio-engine-protocol.ts
         ▼
┌──────────────────────┐
│  Utility Process     │
│  audio-engine-       │
│  process.ts          │
└──────────────────────┘
```

## Changes Required

### Native C++ Changes

None. This refactor is purely TypeScript structural changes. The native addon layer is unaffected.

### TypeScript Changes

#### Phase 1: Shared Foundation

| File | Action | Description |
|------|--------|-------------|
| `src/shared/bounce-error.ts` | Create | `BounceError` class extending `Error` with `code: string` and optional `details: Record<string, unknown>`. Domain modules own their own error code constants as string conventions. Include `serialize()` / `deserialize()` static methods for IPC transport. |
| `src/shared/ipc-contract.ts` | Create | Single source of truth for all 50 IPC channels. Define `IpcContract` as a type mapping channel names → `{ request: T; response: U }`. Export channel name constants. Export `ElectronAPI` interface derived from the contract. |
| `src/shared/audio-engine-protocol.ts` | Create | Discriminated unions `AudioEngineCommand` and `AudioEngineTelemetry` for all MessagePort messages. |

#### Phase 2: Result Type Decomposition

| File | Action | Description |
|------|--------|-------------|
| `src/renderer/results/base.ts` | Create | Extract `BounceResult`, `HelpableResult`, `FeatureResult` |
| `src/renderer/results/sample.ts` | Create | Extract `Sample`, `AudioResult`, `SampleListResult`, `SamplePromise`, `CurrentSamplePromise`, `SampleMethodBindings`, `SampleNamespace`, `SampleNamespaceBindings`, `SampleSummaryFeature` |
| `src/renderer/results/features.ts` | Create | Extract `OnsetFeature`, `NmfFeature`, `NxFeature`, `MfccFeature` and all their Promise wrappers and Bindings interfaces |
| `src/renderer/results/visualization.ts` | Create | Extract `VisScene`, `VisStack`, `VisSceneListResult`, `VisScenePromise`, and bindings interfaces |
| `src/renderer/results/project.ts` | Create | Extract `ProjectResult`, `ProjectListResult`, `ProjectNamespace`, `ProjectNamespaceBindings`, `ProjectSummary` |
| `src/renderer/results/filesystem.ts` | Create | Extract `LsResult`, `GlobResult`, `LsResultPromise`, `GlobResultPromise`, `formatLsEntries()` |
| `src/renderer/results/recording.ts` | Create | Extract `InputsResult`, `AudioDevice`, `RecordingHandle`, `AudioInputDevice`, `RecordOptions`, `AudioDeviceBindings` |
| `src/renderer/results/environment.ts` | Create | Extract `EnvScopeResult`, `EnvInspectionResult`, `EnvFunctionListResult`, related interfaces |
| `src/renderer/results/index.ts` | Create | Barrel re-export of all result modules |
| `src/renderer/bounce-result.ts` | Replace | Becomes `export * from "./results/index.ts"` for backwards compatibility |

**Extraction order** (leaf-to-root by import dependency):
1. `base.ts` (no internal deps)
2. `filesystem.ts` (depends on base)
3. `project.ts` (depends on base)
4. `recording.ts` (depends on base)
5. `environment.ts` (depends on base)
6. `visualization.ts` (depends on base, sample types)
7. `features.ts` (depends on base, sample types)
8. `sample.ts` (depends on base, features, visualization)
9. `index.ts` (barrel)

#### Phase 3: Main Process Decomposition

| File | Action | Description |
|------|--------|-------------|
| `src/electron/ipc/filesystem-handlers.ts` | Create | Extract `fs-ls`, `fs-cd`, `fs-pwd`, `fs-complete-path`, `fs-glob`, `fs-walk` handlers. Receives `settingsStore`. |
| `src/electron/ipc/project-handlers.ts` | Create | Extract `get-current-project`, `list-projects`, `load-project`, `remove-project`. Receives `dbManager`, `settingsStore`. |
| `src/electron/ipc/history-handlers.ts` | Create | Extract `save-command`, `get-command-history`, `clear-command-history`, `dedupe-command-history`, `debug-log`, `get-debug-logs`, `clear-debug-logs`. Receives `dbManager`. |
| `src/electron/ipc/sample-handlers.ts` | Create | Extract `list-samples`, `get-sample-by-hash`, `get-sample-by-name`, `create-slice-samples`, `get-derived-samples`, `get-derived-sample-by-index`, `list-derived-samples-summary`, `granularize-sample`. Receives `dbManager`. |
| `src/electron/ipc/feature-handlers.ts` | Create | Extract `store-feature`, `get-most-recent-feature`, `list-features`. Receives `dbManager`. |
| `src/electron/ipc/audio-handlers.ts` | Create | Extract `read-audio-file`, `store-recording`, `play-sample` (ipcMain.on), `stop-sample` (ipcMain.on). Receives `dbManager`, `audioEnginePort`. |
| `src/electron/ipc/analysis-handlers.ts` | Create | Extract `analyze-onset-slice`, `analyze-buf-nmf`, `analyze-mfcc`. Pure computation, receives native bindings. |
| `src/electron/ipc/corpus-handlers.ts` | Create | Extract `corpus-build`, `corpus-query`, `corpus-resynthesize`. Receives `corpusManager`, `dbManager`. |
| `src/electron/ipc/nmf-handlers.ts` | Create | Migrate `analyze-nmf`, `visualize-nmf`, `sep`, `nx` from Command framework to typed IPC handlers. Receives `dbManager`, `mainWindow`. |
| `src/electron/ipc/repl-handlers.ts` | Create | Extract `save-repl-env`, `get-repl-env`, `transpile-typescript`. Receives `dbManager`. |
| `src/electron/ipc/register.ts` | Create | Imports all handler modules, calls each module's `register(deps)` function. |
| `src/electron/commands/` | Delete | Remove `types.ts`, `analyze-nmf.ts`, `sep.ts`, `nx.ts`, `visualize-nmf.ts`, `visualize-nx.ts` after migrating to `nmf-handlers.ts`. |
| `src/electron/main.ts` | Slim | Remove all inline handlers, keep only: app lifecycle, window creation, audio engine process start, and call to `ipc/register.ts`. Target ~200 lines. |

Each handler module exports a `register(deps: HandlerDeps)` function:
```typescript
interface HandlerDeps {
  dbManager: DatabaseManager;
  settingsStore: SettingsStore;
  corpusManager: CorpusManager;
  getAudioEnginePort: () => MessagePortMain | null;
  getMainWindow: () => BrowserWindow | null;
}
```

Handler modules receive only what they need (a subset of `HandlerDeps`).

#### Phase 4: Type Declaration Alignment

| File | Action | Description |
|------|--------|-------------|
| `src/electron/types.d.ts` | Rewrite | Derive `ElectronAPI` interface from `src/shared/ipc-contract.ts`. All 50 methods will be typed. |
| `src/electron/preload.ts` | Update | Add type assertion `satisfies ElectronAPI` so TypeScript catches missing or mistyped methods. |
| `src/renderer/bounce-globals.d.ts` | Update | Ensure declarations match extracted namespace/result types. |

#### Phase 5: Namespace Decomposition

| File | Action | Description |
|------|--------|-------------|
| `src/renderer/namespaces/types.ts` | Create | Define `NamespaceDeps` interface (subset of `BounceApiDeps` plus internal helpers). |
| `src/renderer/namespaces/fs-namespace.ts` | Create | Extract `fs` namespace. `buildFsNamespace(deps)` returns `FsApi`. |
| `src/renderer/namespaces/corpus-namespace.ts` | Create | Extract `corpus` namespace. `buildCorpusNamespace(deps)`. |
| `src/renderer/namespaces/env-namespace.ts` | Create | Extract `env` namespace. `buildEnvNamespace(deps)`. |
| `src/renderer/namespaces/project-namespace.ts` | Create | Extract `proj` namespace. `buildProjectNamespace(deps)`. |
| `src/renderer/namespaces/vis-namespace.ts` | Create | Extract `vis` namespace. `buildVisNamespace(deps)`. |
| `src/renderer/namespaces/sample-namespace.ts` | Create | Extract `sn` namespace (most complex — includes `bindSample`, analysis, playback). `buildSampleNamespace(deps)`. |
| `src/renderer/namespaces/globals.ts` | Create | Extract `help()`, `clear()`, `debug()`, `clearDebug()`. |
| `src/renderer/bounce-api.ts` | Slim | Becomes thin orchestrator: import namespace builders, compose into API object, return. Target ~100-150 lines. |

**Extraction order** (leaf-to-root by coupling):
1. `fs` (zero inbound deps from other namespaces)
2. `corpus` (depends only on sample results)
3. `env` (depends on runtime introspection)
4. `proj` (depends on project results)
5. `globals` (depends on debug log IPC)
6. `vis` (depends on sample, visualization results)
7. `sn` (most connected — depends on analysis, playback, visualization, all feature types)

#### Phase 6: Error Handling Standardization

| File | Action | Description |
|------|--------|-------------|
| All `src/electron/ipc/*-handlers.ts` | Update | Convert ~22 silent-failure handlers (console.error + return []) to throw `BounceError` with appropriate codes. |
| `src/electron/ipc/audio-handlers.ts` | Update | Add error telemetry channel: audio engine errors forward to renderer via `webContents.send("playback-error", ...)`. |
| `src/shared/audio-engine-protocol.ts` | Update | Add `{ type: "error"; sampleHash?: string; code: string; message: string }` to `AudioEngineTelemetry`. |
| `src/renderer/app.ts` | Update | Listen for `playback-error` events and display in terminal. |
| `src/renderer/bounce-api.ts` (or namespace modules) | Update | Handle `BounceError` in catch blocks, extract `code` for programmatic error handling where useful. |

### Terminal UI Changes

No visual changes. The terminal UI is unaffected except:
- Errors that were previously silently swallowed will now display as red error messages in the REPL (Phase 6).
- Error messages will include error codes for clarity (e.g., `Error [SAMPLE_NOT_FOUND]: ...`).
- All existing `help()` text remains identical.

### REPL Interface Contract

This refactor does **not** change the REPL-facing API surface. All namespaces (`sn`, `env`, `vis`, `proj`, `fs`, `corpus`), global functions (`help`, `clear`, `debug`, `clearDebug`), and all result types retain identical behavior and display output. The `help()` method implementations move to namespace modules but their output text is unchanged.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not — preserved as-is
- [x] Every returned custom REPL type defines a useful terminal summary — preserved as-is
- [x] The summary highlights workflow-relevant properties, not raw internal structure — preserved as-is
- [x] Unit tests and/or Playwright tests are identified for `help()` output — existing Playwright suite covers this
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior — existing Playwright suite covers this

### Configuration/Build Changes

| File | Action | Description |
|------|--------|-------------|
| `tsconfig.json` | Verify | Ensure `src/shared/` is included in compilation. It should be covered by existing `include` patterns. |
| `package.json` | No change | No new dependencies needed. |
| `binding.gyp` | No change | No native changes. |

## Testing Strategy

**Core principle:** This is a behavior-preserving refactor. The existing 18 Playwright specs are the primary verification mechanism. All 18 must pass after each phase.

### Unit Tests

| Test | Phase | Description |
|------|-------|-------------|
| `src/shared/bounce-error.test.ts` | 1 | `BounceError` construction, serialization/deserialization across IPC boundary, code field preservation. |
| `src/shared/ipc-contract.test.ts` | 1 | Contract type exhaustiveness: every channel in the contract maps to a handler and a preload method (static assertion via TypeScript, runtime enumeration test). |
| Existing `src/bounce-api.test.ts` | 2, 5 | Must continue passing after result extraction and namespace extraction. |
| Existing `src/repl-evaluator.test.ts` | 5 | Must continue passing — REPL evaluation behavior unchanged. |
| Existing `src/settings-store.test.ts` | 3 | Must continue passing — SettingsStore is unchanged. |
| Existing `src/database-projects.test.ts` | 3 | Must continue passing — DatabaseManager is unchanged. |

### E2E Tests

All 18 existing Playwright specs must pass after each phase. Key specs by coverage area:

| Spec | Validates |
|------|-----------|
| `commands.spec.ts` | REPL commands, help text, basic interactions |
| `filesystem.spec.ts` | `fs` namespace operations |
| `playback.spec.ts` | `sn.read()`, `play()`, `stop()`, audio engine round-trip |
| `onset-analysis.spec.ts` | `sample.onsets()`, onset feature display |
| `nmf-analysis.spec.ts` | `sample.nmf()`, NMF feature display |
| `granularize.spec.ts` | `sample.granularize()` |
| `projects.spec.ts` | `proj` namespace operations |
| `runtime-introspection.spec.ts` | `env` namespace operations |
| `tab-completion.spec.ts` | Tab completion for all namespaces |
| `terminal-ui.spec.ts` | Terminal rendering, display format |

### Manual Testing

After all phases:
- Verify that error messages from previously-silent-failure handlers now display meaningful text
- Verify audio engine errors (e.g., playing a corrupt sample) surface in the terminal
- Spot-check that tab completion still works for all namespaces after extraction

## Success Criteria

1. **All 18 Playwright E2E specs pass** — behavioral equivalence verified
2. **All existing unit tests pass** — no regression in isolated logic
3. **`npm run lint` passes** — code style preserved
4. **`main.ts` is ≤250 lines** — reduced from 1,017
5. **`bounce-api.ts` is ≤200 lines** — reduced from 2,619
6. **`bounce-result.ts` is a barrel re-export** — reduced from 1,284 to ~1 line
7. **`types.d.ts` declares all 50 `ElectronAPI` methods** — zero gap with preload
8. **No string-literal IPC channel names outside `src/shared/ipc-contract.ts`** — single source of truth
9. **Zero silent-failure IPC handlers** — all errors surface to user
10. **New unit tests pass** for `BounceError` and IPC contract exhaustiveness

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Circular import** introduced during extraction | Medium | Build fails | Extract leaf-to-root. Run `tsc --noEmit` after each file extraction. |
| **Barrel re-export breaks tree-shaking or bundle** | Low | Larger bundle | Electron apps don't tree-shake; barrel is safe. Verify build size doesn't regress. |
| **Tab completion breaks** after namespace extraction | Medium | UX regression | `tab-completion.spec.ts` catches this. Run after Phase 5. |
| **IPC contract type too restrictive** | Medium | Blocks future features | Use generic `Record<string, unknown>` for extensible payloads where needed. Keep contract additive. |
| **Command framework removal breaks `send-command` callers** | Low | Runtime error | Search for all `sendCommand` call sites in renderer. Migrate callers to use direct typed IPC methods. |
| **`this` binding lost in extracted namespace** | Medium | Runtime error | Namespace builders return plain objects (not classes), so `this` is not relevant. Use closure-based patterns. |
| **Merge conflicts with concurrent feature work** | High | Delays | Complete each phase as a separate PR. Rebase frequently. |

## Implementation Order

### Phase 1: Shared Foundation
Create `src/shared/` with `bounce-error.ts`, `ipc-contract.ts`, and `audio-engine-protocol.ts`. Write unit tests. This phase has no external dependencies and can land independently.

### Phase 2: Result Type Decomposition
Split `bounce-result.ts` into `src/renderer/results/` modules. Create barrel re-export. Replace `bounce-result.ts` contents with re-export. Verify all importers still work.

### Phase 3: Main Process Decomposition
Extract handlers from `main.ts` into `src/electron/ipc/` modules. Create `register.ts` wiring. Migrate Command framework commands to `nmf-handlers.ts`. Delete `commands/` directory. Slim `main.ts` to bootstrap.

### Phase 4: Type Declaration Alignment
Rewrite `types.d.ts` to derive `ElectronAPI` from IPC contract. Add `satisfies` assertion to preload. Update `bounce-globals.d.ts`.

### Phase 5: Namespace Decomposition
Extract REPL namespaces from `bounce-api.ts` into `src/renderer/namespaces/` modules. Define `NamespaceDeps`. Slim `bounce-api.ts` to orchestrator.

### Phase 6: Error Handling Standardization
Convert silent-failure handlers to throw `BounceError`. Add audio engine error channel. Surface all errors in REPL.

**Dependency graph:**
```
Phase 1 (shared foundation)
  ├── Phase 2 (result types)      ── independent ──┐
  ├── Phase 3 (main handlers)     ── independent ──┤── Phase 5 depends on Phase 2
  └── Phase 4 (type declarations) ── depends on 1 ─┘── Phase 6 depends on Phases 1, 3
```

Phases 2, 3, and 4 can be done in any order after Phase 1. Phase 5 depends on Phase 2 (extracted result types). Phase 6 depends on Phases 1 and 3 (BounceError + extracted handlers).

## Estimated Scope

**Large.** Six phases spanning all process boundaries. ~40 new files, ~5 deleted files, ~4 substantially rewritten files. Estimated at several focused working sessions per phase, with the Playwright suite as the safety net at each step.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements — behavior-preserving refactor, no REPL API changes
- [x] All sections agree on the data model / schema approach — database.ts is deferred, no schema changes
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries — no REPL changes; existing coverage preserved
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable — all 18 Playwright specs serve as regression suite
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
