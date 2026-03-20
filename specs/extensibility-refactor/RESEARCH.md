# Research: Extensibility Refactor

**Spec:** specs/extensibility-refactor  
**Created:** 2026-03-20  
**Status:** In Progress

## Problem Statement

As Bounce grows toward the features on the roadmap (tutorials, simple transformations, live-coding, Ableton Link, scripts, Freesound, multichannel audio, and eventually a plugin system), the codebase needs to be easier to extend. Today, adding a new feature requires touching several large, tightly-coupled modules and duplicating ad-hoc patterns for IPC communication, error handling, REPL namespace registration, and help text. This spec researches the structural issues and proposes directions for the PLAN phase.

## Background

The roadmap contains features that span every layer of the architecture:

- **New REPL namespaces** — tutorials, user scripts, Freesound integration
- **New native algorithms** — simple transformations (gain, normalize, reverse, fade, crop, resample), loudness/dynamics analysis
- **New IPC channels** — every new feature that needs main-process resources adds IPC surface area
- **New audio engine messages** — live-coding instruments, Ableton Link, pattern DSL

Each of these will be significantly easier to implement if the current monolithic modules are decomposed into smaller units with clear interfaces and consistent patterns. (Note: the AI-generated "Plugin System" idea in ROADMAP.md is not part of the Bounce vision. VST/CLAP hosting in the audio utility process is a distant possibility but out of scope here.)

## Current Architecture Snapshot

### File Size Distribution (top 10 non-test .ts files)

| File | Lines | Role |
|------|-------|------|
| `src/renderer/bounce-api.ts` | 2,619 | REPL API surface (all namespaces) |
| `src/renderer/bounce-result.ts` | 1,284 | ~30 result/namespace/promise classes |
| `src/electron/database.ts` | 1,229 | All DB operations |
| `src/electron/main.ts` | 1,017 | All 44 IPC handlers + app lifecycle |
| `src/renderer/app.ts` | 787 | Terminal input/output/rendering |
| `src/renderer/repl-evaluator.ts` | 686 | TypeScript transpile + eval + scope |
| `src/renderer/bounce-globals.d.ts` | 497 | REPL type declarations |
| `src/renderer/waveform-visualizer.ts` | 319 | Waveform rendering |
| `src/renderer/audio-context.ts` | 319 | Audio playback management |
| `src/renderer/tab-completion.ts` | 261 | Tab completion logic |

### Process Architecture

```
┌────────────────────┐   IPC (50+ channels)   ┌──────────────────────┐
│   Main Process     │◄──────────────────────►│   Renderer Process    │
│  (main.ts — 1017L) │                        │  (bounce-api.ts —     │
│  44 ipcMain.handle │                        │   2619L)              │
│  database.ts       │                        │  (bounce-result.ts —  │
│  commands/*.ts     │                        │   1284L)              │
│  corpus-manager.ts │                        │  (app.ts — 787L)      │
│  settings-store.ts │                        │  (repl-evaluator.ts)  │
└────────┬───────────┘                        └───────────────────────┘
         │ MessagePort
         ▼
┌────────────────────┐
│  Utility Process   │
│  audio-engine-     │
│  process.ts        │
│  (native C++ addon)│
└────────────────────┘
```

## Research Finding 1: IPC Layer Has No Formal Contract

### Current State

IPC channels are defined by **string literals** scattered across three files with no single source of truth:

1. **`main.ts`** — handlers registered via `ipcMain.handle("channel-name", ...)` (44 handlers)
2. **`preload.ts`** — `ipcRenderer.invoke("channel-name", ...)` wrappers (44 methods)
3. **`types.d.ts` / `bounce-globals.d.ts`** — TypeScript declarations for `window.electron`

A channel name typo in any of these files creates a silent runtime failure. There is no compile-time check that a handler exists for every renderer call or vice versa.

### Type Coverage

- `src/electron/ipc-types.ts` defines shared option interfaces (`OnsetSliceOptions`, `BufNMFOptions`, `MFCCOptions`, `NMFVisualizationData`) — but only for analysis parameters.
- `src/electron/types.d.ts` defines `ElectronAPI` with full method signatures — but it is a **manual copy** of the preload shape, not derived from it. The two can diverge.
- Return types for many IPC calls are inline anonymous object literals — not shared interfaces.
- MessagePort messages (audio engine protocol) are entirely untyped.

### Recommendation

Define a single `ipc-contract.ts` that is the **source of truth** for:
- Channel names (string enum or const object)
- Request payload types
- Response payload types
- Error response types

Both `main.ts` handlers and `preload.ts` wrappers should be derived from this contract, so the TypeScript compiler catches mismatches.

## Research Finding 2: Inconsistent Error Handling

### Current Error Strategies

IPC handlers use three different strategies with no clear rule for which to use:

| Strategy | Count | Behavior | User Sees Error? |
|----------|-------|----------|-------------------|
| **Re-throw with context** | ~18 handlers | `throw new Error(\`Context: ${err.message}\`)` | ✅ Yes |
| **Console.error + default** | ~22 handlers | `console.error(...); return [];` | ❌ No — silent fallback |
| **No catch** | ~2 handlers | Error propagates as unhandled rejection | ⚠️ Unpredictable |

### Problems

1. **Silent failures** — When `list-samples`, `get-command-history`, `get-most-recent-feature`, etc. fail, they return empty arrays/null. The REPL user sees "no data" with no indication that something went wrong.

2. **Lost error structure** — Electron's IPC serializer only preserves `Error.message` and `Error.name`. Stack traces, `cause` chains, and custom properties are stripped. The renderer cannot distinguish a "not found" error from a "database corrupt" error.

3. **No error codes** — All errors are plain `Error` objects with prose messages. Programmatic error handling (e.g., "if not found, try creating") requires string-matching on error messages.

4. **Audio engine errors are fire-and-forget** — `play-sample` and `stop-sample` use `ipcMain.on()` (no response channel). If the audio engine fails to play a sample, the renderer is never informed.

### Error Propagation Path

```
C++ NAPI throw → ipcMain.handle catch → re-throw → ipcRenderer.invoke rejects
                                                     → ReplEvaluator catch
                                                     → app.ts formatError
                                                     → terminal.writeln (red text)
```

This chain works for the "happy error path" but loses context at each boundary.

### Recommendation

- Define a `BounceError` base class with `code: string` and optional `details: Record<string, unknown>`.
- Define error code categories: `SAMPLE_NOT_FOUND`, `FEATURE_NOT_FOUND`, `DB_ERROR`, `NATIVE_ERROR`, `FS_ERROR`, etc.
- Serialize errors as structured objects across IPC (not thrown Error instances).
- Convert silent-failure handlers to return `{ ok: true, data }` / `{ ok: false, error }` result types — or throw with structured errors.
- Add a response channel for audio engine errors so playback failures reach the REPL.

## Research Finding 3: Monolithic REPL API Module

### Current State of `bounce-api.ts` (2,619 lines)

The entire REPL surface is built inside a single `buildBounceApi()` function. It defines:

- **14+ REPL namespaces/globals**: `sn`, `env`, `vis`, `proj`, `fs`, `corpus`, `nx`, `sep`, `analyze`, `analyzeNmf`, `analyzeMFCC`, `slice`, `granularize`, `debug`, `clearDebug`, `help`, `clear`, `list`, `playSlice`, `playComponent`
- **~400 lines of help text** functions
- **~200 lines of binding/utility** helpers
- **All feature logic** (onset analysis, NMF, MFCC, slicing, granularization, corpus operations)

Every new REPL-facing feature requires editing this single function, which is already the largest file in the codebase.

### How New Namespaces Are Added (Current Pattern)

```typescript
// 1. Define methods with Object.assign for .help()
const myFunc = Object.assign(
  async function myFunc(args) { /* implementation */ },
  { help: (): BounceResult => new BounceResult("...help text...") }
);

// 2. Create namespace via class (SampleNamespace, ProjectNamespace) or plain object
const ns = { help() { ... }, method1: myFunc, method2: ... };

// 3. Add to the returned api object
api = { sn, vis, proj, env, fs, corpus, ...otherGlobals };
return api;
```

This pattern is **reasonable** but breaks down at scale because everything is in one file.

### Recommendation

Extract each namespace into its own module that exports a factory function:

```typescript
// src/renderer/namespaces/sample-namespace.ts
export function buildSampleNamespace(deps: NamespaceDeps): SampleNamespace { ... }

// src/renderer/namespaces/vis-namespace.ts
export function buildVisNamespace(deps: NamespaceDeps): VisNamespace { ... }

// src/renderer/bounce-api.ts (becomes thin orchestrator)
export function buildBounceApi(deps: BounceApiDeps) {
  return {
    sn: buildSampleNamespace(deps),
    vis: buildVisNamespace(deps),
    proj: buildProjectNamespace(deps),
    // ...
  };
}
```

A `NamespaceDeps` interface or subset thereof would provide each namespace only the dependencies it needs (terminal, audioManager, sceneManager, etc.).

## Research Finding 4: Monolithic Result Types

### Current State of `bounce-result.ts` (1,284 lines)

This file contains ~30 exported classes:
- Base types: `BounceResult`, `HelpableResult`, `AudioResult`
- Domain types: `Sample`, `OnsetFeature`, `NmfFeature`, `MfccFeature`
- Visualization: `VisScene`, `VisStack`, `VisSceneListResult`
- Collections: `SampleListResult`, `ProjectResult`, `ProjectListResult`
- Namespace containers: `SampleNamespace`, `ProjectNamespace`
- Promise wrappers: `SamplePromise`, `OnsetFeaturePromise`, `NmfFeaturePromise`, `MfccFeaturePromise`, `GrainCollectionPromise`, `VisScenePromise`, `CurrentSamplePromise`
- Filesystem: `LsResult`, `GlobResult`, `LsResultPromise`, `GlobResultPromise`
- Recording: `InputsResult`, `AudioDevice`, `RecordingHandle`

### Problems

- Adding a new feature type (e.g., `SpectralShapeFeature`, `LoudnessFeature`) requires adding classes to this already-large file.
- The promise wrapper classes are boilerplate-heavy — each one is ~30-50 lines of the same pattern.
- Namespace container classes (`SampleNamespace`, `ProjectNamespace`) mix REPL display concerns with method dispatch.

### Recommendation

Split into a `results/` directory:
- `results/base.ts` — `BounceResult`, `HelpableResult`
- `results/sample.ts` — `Sample`, `AudioResult`, `SampleListResult`, `SamplePromise`, `CurrentSamplePromise`
- `results/features.ts` — `OnsetFeature`, `NmfFeature`, `MfccFeature` and their promise wrappers
- `results/visualization.ts` — `VisScene`, `VisStack`, `VisSceneListResult`, `VisScenePromise`
- `results/project.ts` — `ProjectResult`, `ProjectListResult`
- `results/filesystem.ts` — `LsResult`, `GlobResult`, `LsResultPromise`, `GlobResultPromise`
- `results/recording.ts` — `InputsResult`, `AudioDevice`, `RecordingHandle`

Consider a generic `BouncePromise<T>` base to reduce promise wrapper boilerplate.

## Research Finding 5: Monolithic Main Process

### Current State of `main.ts` (1,017 lines)

This single file handles:
1. **App lifecycle** — window creation, `app.whenReady()`, quit handling
2. **44 IPC handlers** — all inline with business logic
3. **Audio engine subprocess** — `startAudioEngineProcess()`, MessagePort relay
4. **Filesystem utilities** — `fs-ls`, `fs-cd`, `fs-pwd`, `fs-glob`, `fs-walk`, path resolution
5. **Command dispatch** — `send-command` with dynamic imports of `commands/*.ts`
6. **TypeScript transpilation** — lazy-loaded TS compiler
7. **Type definitions** — `FsEntry`, `WalkEntry`, `FileType` exported from main.ts

### Recommendation

Split handlers into domain modules under `src/electron/ipc/`:
- `ipc/audio-handlers.ts` — `read-audio-file`, `store-recording`, `play-sample`, `stop-sample`
- `ipc/analysis-handlers.ts` — `analyze-onset-slice`, `analyze-buf-nmf`, `analyze-mfcc`
- `ipc/database-handlers.ts` — sample/feature/project CRUD, command history, debug logs
- `ipc/filesystem-handlers.ts` — `fs-ls`, `fs-cd`, `fs-pwd`, `fs-glob`, `fs-walk`
- `ipc/corpus-handlers.ts` — `corpus-build`, `corpus-query`, `corpus-resynthesize`
- `ipc/command-handlers.ts` — `send-command`, `analyze-nmf`, `visualize-nmf`, `sep`, `nx`

Each module exports a `register(deps)` function that receives what it needs (`dbManager`, `settingsStore`, `corpusManager`) and calls `ipcMain.handle()`. Main.ts becomes a thin bootstrap.

## Research Finding 6: Type Declaration Duplication

### Current State

The `ElectronAPI` interface in `src/electron/types.d.ts` is a **manual duplicate** of what `preload.ts` actually exposes. These files must be kept in sync by hand. Currently they have already diverged — `types.d.ts` is missing several methods that `preload.ts` exposes (e.g., `fsWalk`, `getSampleByName`, `storeRecording`, `transpileTypeScript`, `corpusBuild`, `corpusQuery`, `corpusResynthesize`, `fsCompletePath`, `sendCommand`, `analyzeNMF`, `visualizeNMF`, `sep`, `nx`, `onOverlayNMF`, `playSample`, `stopSample`, `onPlaybackPosition`, `onPlaybackEnded`, `granularizeSample`, `listDerivedSamplesSummary`, `getDerivedSampleByIndex`, `getDerivedSamples`, `createSliceSamples`, `getMostRecentFeature`, `storeFeature`, `getDebugLogs`, `clearDebugLogs`, `debugLog`, `dedupeCommandHistory`, `clearCommandHistory`, `getCommandHistory`, `getSampleByHash`, `listFeatures`, `listSamples`).

This means the renderer TypeScript code that calls `window.electron.*` for many methods is **not type-checked** — it relies on `any` or the runtime to catch mistakes.

### Recommendation

Either:
- **Generate** `types.d.ts` from the IPC contract, or
- **Define** the `ElectronAPI` interface as the contract, and have preload.ts implement it with a type assertion (so TypeScript catches missing methods).

## Research Finding 7: MessagePort Protocol is Untyped

### Current State

The audio engine utility process communicates via MessagePort with these messages:

**Main → Utility:**
- `{ type: "init" }` (with port transfer)
- `{ type: "play", sampleHash, pcm, sampleRate, loop }`
- `{ type: "stop", sampleHash }`
- `{ type: "stop-all" }`

**Utility → Main:**
- `{ type: "position", sampleHash, positionInSamples }`
- `{ type: "ended", sampleHash }`

These are typed only with inline casts (`as { type: string; ... }`) at the receive sites. No shared interface exists.

### Why This Matters for the Roadmap

The roadmap includes:
- **Live-coding sample playback** — new instrument instantiation messages, pattern trigger messages
- **Ableton Link** — tempo/transport sync messages
- **Simple transformations** — potentially offloaded to utility process

The MessagePort protocol will grow significantly. Without typed message contracts, bugs will be hard to find.

### Recommendation

Define a discriminated union for audio engine messages:

```typescript
// src/shared/audio-engine-protocol.ts
type AudioEngineCommand =
  | { type: "play"; sampleHash: string; pcm: Float32Array; sampleRate: number; loop: boolean }
  | { type: "stop"; sampleHash: string }
  | { type: "stop-all" }
  | { type: "create-instrument"; instrumentId: string; samples: Map<number, string> }
  | { type: "trigger-pattern"; instrumentId: string; pattern: string };

type AudioEngineTelemetry =
  | { type: "position"; sampleHash: string; positionInSamples: number }
  | { type: "ended"; sampleHash: string }
  | { type: "error"; sampleHash?: string; code: string; message: string };
```

## Research Finding 8: Command Framework Should Be Replaced by IPC Contract

### Current State

There is a `Command` interface in `src/electron/commands/types.ts`:

```typescript
export interface Command {
  name: string;
  description: string;
  usage: string;
  execute(args, mainWindow, dbManager): Promise<CommandResult>;
}
```

Only 5 commands use it (`analyze-nmf`, `visualize-nmf`, `visualize-nx`, `sep`, `nx`). The other 39 IPC handlers are registered directly in `main.ts` without going through this framework.

### Problems

The `Command` interface takes `args: string[]` (CLI-style positional arguments) while the rest of the codebase passes typed parameters through IPC. This creates two competing patterns for main-process operations. The `CommandResult` type (`{ success: boolean; message: string }`) is also less expressive than returning typed domain objects.

### Recommendation

Remove the `Command` framework and migrate the 5 commands that use it to typed IPC handlers derived from the IPC contract (Finding 1). The `send-command` dispatcher and the `commands/types.ts` file can be deleted. The individual command implementations (`analyze-nmf.ts`, `sep.ts`, `nx.ts`, etc.) would become handler modules that receive typed parameters instead of string arrays.

## Research Finding 9: Coupling Between Namespaces and Result Types

### Current State

`bounce-api.ts` imports from `bounce-result.ts` and creates result instances directly. The `Sample` class, for example, is:
- **Defined** in `bounce-result.ts`
- **Instantiated** in `bounce-api.ts` via `bindSample()` helper
- **Bound** with methods that close over `bounce-api.ts` internal functions (`playSlice`, `playComponent`, etc.)

This creates circular logical dependencies — `Sample` needs to know about analysis operations, and analysis operations need to return `Sample` instances.

### Recommendation

Use a method-binding pattern where `Sample` is defined with placeholder methods, and `bounce-api.ts` (or the namespace modules) bind implementations at construction time. This is already partially the pattern (the `bindSample` helper) but could be made more explicit with an interface.

## Technical Constraints

- **Electron IPC serialization** — Only structured-cloneable data crosses IPC. No functions, no class instances, no circular references. Error objects lose everything except `message` and `name`.
- **Context isolation** — Renderer cannot access Node.js. All main-process access goes through the preload bridge.
- **Utility process isolation** — Audio engine runs in a separate V8 isolate. Communication is MessagePort only.
- **Cross-platform** — All refactoring must work on macOS, Linux, and Windows.
- **Native addon stability** — C++ bindings are the hardest to change. Prefer TypeScript-side refactoring.

## Terminal UI Considerations

This refactor is primarily structural — it should not change any user-facing behavior. However, the improved error handling will affect what users see when things go wrong:

- Structured errors should produce clear, actionable REPL messages (e.g., `Error [SAMPLE_NOT_FOUND]: No sample with hash "abc123" — did you mean "abc12345"?`)
- Audio engine errors should surface in the terminal instead of being silently swallowed.
- Help text should remain identical after the refactor.

## Cross-Platform Considerations

No platform-specific concerns for this refactor — it is purely a TypeScript structural change. The native C++ addon layer is not affected.

## Open Questions

1. **Incremental vs. big-bang?** — Should we refactor one module at a time (e.g., extract filesystem namespace first), or do a coordinated refactor of all modules? Incremental is safer but may require temporary shims.

2. **Result type protocol** — Should IPC calls return `{ ok: true, data } | { ok: false, error }` discriminated unions, or should they continue using throw/catch with structured `BounceError` objects? The discriminated union approach is more explicit but changes every call site.

3. **Shared types package** — Should `src/shared/` be a separate directory for types used across all three processes (main, renderer, utility), or should each process import from the process that defines the contract?

4. **Database refactor scope** — `database.ts` (1,229 lines) is large but relatively well-organized. Should it be split in this refactor, or left for a separate spec?

5. **How much of bounce-result.ts's class hierarchy do we preserve?** — The ~30 classes work well for the REPL's thenable/chainable API. But the promise wrapper boilerplate is repetitive. A generic `BouncePromise<T>` could cut this significantly.

## Research Findings Summary

| Finding | Severity | Impact on Roadmap |
|---------|----------|-------------------|
| No formal IPC contract | 🔴 High | Every new feature adds untyped IPC surface |
| Inconsistent error handling | 🔴 High | Users can't distinguish errors; silent failures |
| Monolithic bounce-api.ts | 🔴 High | Every new REPL namespace edits 2,600-line file |
| Monolithic bounce-result.ts | 🟡 Medium | New feature types add to 1,284-line file |
| Monolithic main.ts | 🔴 High | Every new IPC handler edits 1,017-line file |
| Type declaration duplication | 🟡 Medium | types.d.ts already out of sync with preload |
| Untyped MessagePort protocol | 🟡 Medium | Will become high when live-coding features land |
| Command framework superseded by IPC contract | 🟡 Medium | Remove in favor of typed IPC handlers |
| Namespace/result coupling | 🟢 Low | Current binding pattern works; just needs extraction |

## Next Steps

The PLAN phase should:
1. Define the IPC contract type system and migration strategy
2. Design the namespace module extraction pattern (factory functions + dependency injection)
3. Design the structured error system
4. Propose a file/directory structure for the refactored modules
5. Define the order of extraction (which modules to extract first)
6. Establish testing strategy to ensure behavioral equivalence after refactoring
