# Plan: REPL Intelligence — Unified Registration, Completion, and Help

**Spec:** specs/repl-intelligence
**Created:** 2026-04-04
**Status:** In Progress

## Context

Bounce's REPL discoverability systems (tab completion, help) are manually maintained and disconnected. This spec introduces a unified architecture: a decorator-based registration system, a TypeScript Language Service utility process for AST/type resolution, and a REPL Intelligence Layer that dispatches to reusable completers. See RESEARCH.md for full design rationale, CompletionContext shape, IPC channel inventory, and language service robustness design.

## Approach Summary

1. **Decorator-based registration**: All REPL-exposed namespaces and porcelain types become classes with `@describe`/`@param` decorated methods. Compile-time enforcement ensures nothing is exposed without descriptors — both porcelain and plumbing.
2. **Porcelain/plumbing visibility**: Runtime toggle (`env.dev(true)` or `BOUNCE_DEV=1`) controls whether plumbing items appear in help and completions. Build enforcement is identical for both.
3. **Language Service utility process**: Parses REPL input, resolves types, returns structured `CompletionContext`. Thin — no business logic. Auto-restarts on crash, reports health metrics.
4. **REPL Intelligence Layer** (main process): Receives `CompletionContext`, dispatches to registered completers, filters by visibility, returns candidates to renderer.
5. **Debounced IPC**: 150ms debounce from renderer, immediate on trigger characters (`.`, `(`, `{`). Quote characters debounced normally.

## Decorator API

### Class-level decorators

```ts
// Registers a REPL namespace (e.g. sn, fs, vis)
function namespace(name: string, meta: {
  summary: string;
  visibility?: Visibility; // default: "porcelain"
}): ClassDecorator;

// Registers a porcelain result type (e.g. Sample, SliceFeature)
function replType(name: string, meta: {
  summary: string;
  terminalSummary?: string; // template for terminal display
}): ClassDecorator;
```

### Method-level decorators

```ts
// Describes a method — required on every public method of registered classes
function describe(meta: {
  summary: string;
  visibility?: Visibility; // default: "porcelain"
  returns?: string;        // return type/description
}): MethodDecorator;

// Describes a parameter — stackable, one per parameter
function param(name: string, meta: {
  summary: string;
  kind?: ParamKind;        // completer dispatch hint
  expectedType?: string;   // for kind: "typed" — the type name to match
}): MethodDecorator;

type Visibility = "porcelain" | "plumbing";
type ParamKind = "filePath" | "sampleHash" | "typed" | "options" | "plain";
// "plain" is the default — no special completion
```

### `@param` decorator ordering

`@param` decorators apply bottom-up (the decorator closest to the method runs first). The registration implementation must **prepend** each entry to the parameter list so that the final list matches declaration order. Example: given `@param("other")` above `@param("opts")`, `opts` is processed first — prepending both yields `[other, opts]`.

### `Describable` interface

`@namespace` and `@replType` decorators automatically inject a `help()` method onto the class prototype. Decorated classes are considered to implement `Describable` — do not implement `help()` manually.

```ts
/**
 * Automatically implemented by every @namespace and @replType decorated class
 * via decorator injection. Do not implement manually.
 */
interface Describable {
  /** Print help for this namespace or type to the REPL output. */
  help(): void;
}
```

User invocation at the REPL is unchanged from the existing convention:

```
> sn.help()       // prints all sn methods with parameter summaries
> sample.help()   // prints Sample type methods
```

The injected `help()` looks up the class by its registered name in the runtime registry and delegates to `src/renderer/help.ts` for rendering. Help output format is unchanged in appearance — the only change is the data source (decorator metadata instead of JSDoc-generated files).

### `terminalSummary` template syntax

The `terminalSummary` field on `@replType` is an optional string template. Tokens are written as `{{propertyName}}` where `propertyName` is any public property on the class instance. The registry's `renderTerminalSummary(instance)` function resolves tokens at display time using a simple string replace.

```ts
@replType("Sample", {
  summary: "An audio sample",
  terminalSummary: "Sample | {{duration}}s | {{channels}}ch @ {{sampleRate}}Hz | {{hash}}"
})
class Sample { ... }
```

If `terminalSummary` is omitted, the registry falls back to rendering `<TypeName>: <summary>` (e.g. `Sample: An audio sample`). Omitting `terminalSummary` is not a build failure but is a spec violation for all types listed in Phase 5.2 — every migrated porcelain type must define one.

### `Completer` interface and `PredictionResult` type

Defined in `src/shared/completer.ts`:

```ts
interface PredictionResult {
  /** The text shown in ghost text / completion UI. */
  label: string;
  /** The text inserted on accept. Defaults to label if omitted. */
  insertText?: string;
  /** Category used for icon/styling in the completion UI. */
  kind: "namespace" | "method" | "type" | "variable" | "filePath" | "sampleHash" | "key";
  /** One-line description alongside the label (return type, summary, etc.). */
  detail?: string;
}

interface Completer {
  predict(context: CompletionContext): PredictionResult[];
}
```

### Usage example

```ts
@namespace("sn", { summary: "Sample management" })
class SampleNamespace {
  @describe({ summary: "Read an audio file from disk" })
  @param("path", { summary: "Path to audio file", kind: "filePath" })
  read(path: string): SamplePromise { /* ... */ }

  @describe({ summary: "Load a sample by hash from the database" })
  @param("hash", { summary: "Sample hash", kind: "sampleHash" })
  load(hash: string): SamplePromise { /* ... */ }

  @describe({ summary: "List all samples in the current project" })
  list(): SampleListResult { /* ... */ }

  @describe({ summary: "Dump internal buffer state", visibility: "plumbing" })
  dumpBuffers(): void { /* ... */ }
}

@replType("Sample", { summary: "An audio sample" })
class Sample {
  @describe({ summary: "Play the sample" })
  play(): void { /* ... */ }

  @describe({ summary: "Slice by onsets" })
  @param("opts", { summary: "Onset detection options", kind: "options" })
  onsetSlice(opts?: OnsetSliceOptions): SliceFeaturePromise { /* ... */ }

  @describe({ summary: "Cross-synthesize with another sample" })
  @param("other", { summary: "Source sample", kind: "typed", expectedType: "Sample" })
  @param("opts", { summary: "NMF options", kind: "options" })
  nx(other: Sample, opts?: NxOptions): NxFeaturePromise { /* ... */ }
}
```

### TypeScript configuration

Uses `experimentalDecorators: true` in tsconfig. The project is on TypeScript 5.9.3; `experimentalDecorators` is the battle-tested approach for metadata attachment. `emitDecoratorMetadata` is not needed — all metadata is carried explicitly in decorator arguments, with no reliance on `Reflect.getMetadata` or auto-inferred type metadata.

## Architecture Changes

This adds a fourth process to Bounce's model (alongside main, renderer, audio engine):

- **Language Service Utility Process** — new Electron utility process running `ts.createLanguageService()`
- **REPL Intelligence Layer** — new module in main process, handles completion dispatch and future intelligence features
- **ARCHITECTURE.md** must be updated with the new process model, data flow, and IPC channels

### Process Communication

```
Renderer  ──IPC──▶  Main (Intelligence Layer)  ──MessagePort──▶  Language Service Utility
                     │
                     ├── Filesystem (path completion)
                     ├── SQLite (hash completion)
                     └── MIDI subsystem (device completion)
```

### IPC Channels (new)

| Channel | Direction | Pattern | Purpose |
|---|---|---|---|
| `completion:request` | Renderer → Main | Handle | Buffer + cursor → candidates |
| `langservice:parse` | Main → Lang Service | MessagePort request | Buffer → CompletionContext |
| `langservice:session-append` | Main → Lang Service | MessagePort send | Append source to virtual session — triggered internally by the main-process `save-command` IPC handler (no new renderer→main channel needed) |
| `langservice:session-reset` | Main → Lang Service | MessagePort send | Clear virtual session |
| `langservice:session-restore` | Main → Lang Service | MessagePort send | Bulk replay on startup |
| `langservice:ready` | Lang Service → Main | MessagePort send | Initialization complete |
| `langservice:status` | Main → Lang Service | MessagePort request | Poll readiness state |
| `langservice:health` | Lang Service → Main | MessagePort push | Periodic health metrics |

## Changes Required

### Native C++ Changes

None

### TypeScript Changes

#### Phase 1: Decorator infrastructure and registration system

**New files:**
- `src/shared/repl-registry.ts` — `@describe`, `@param` decorators, `DescribedMethod` type, `Describable` interface, `MethodDescriptor` / `PropertyDescriptor` types, `Visibility` type (`"porcelain" | "plumbing"`)
- `src/shared/repl-registration.ts` — `registerNamespace()`, `registerType()` functions, registry storage, visibility-aware query methods
- `scripts/validate-repl-descriptors.ts` — Build-time validation script using TS compiler API; this is the **sole compile-time enforcement mechanism**. The script checks all public methods on `@namespace`/`@replType` decorated classes for `@describe` presence at the AST level. A `satisfies` + companion interface approach was ruled out because TypeScript's type system does not track decorator side effects — decorated methods retain their original type, so `satisfies DescribedMethod` checks would fail even on correctly-decorated classes.

**Modified files:**
- Every namespace builder (`src/renderer/namespaces/*.ts`) — convert from builder functions returning plain objects to decorator-annotated classes
- Every porcelain result type (`src/renderer/results/*.ts`) — add `@describe`/`@param` decorators to methods
- `src/renderer/bounce-api.ts` — replace manual API assembly with registry-driven construction
- `src/renderer/repl-evaluator.ts` — remove `BOUNCE_GLOBALS` entirely; globals now derived from registry; `COMPLETION_HIDDEN_GLOBALS` removed (replaced by visibility system)
- `package.json` — add validation script to build pipeline

#### Phase 2: Language Service utility process

**New files:**
- `src/utility/language-service-process.ts` — utility process entry point, MessagePort handler, virtual project management
- `src/shared/completion-context.ts` — `CompletionContext`, `TypeInfo`, `CalleeInfo`, `AstNodeInfo` types
- `src/electron/language-service-manager.ts` — main-process manager for utility process lifecycle, MessagePort, health monitoring, auto-restart

**Modified files:**
- `src/electron/main.ts` — spawn language service utility process at app launch

**Generated files (both emitted by the same build-time generator pass):**

The generator (`scripts/generate-repl-artifacts.ts`) is run as part of `build:electron`. It uses the TypeScript compiler API to scan all files matching `src/renderer/**/*.ts` for classes decorated with `@namespace` or `@replType`. Both output files are produced in a single pass.

- `src/shared/repl-environment.d.ts` — type declarations for the language service utility process. For each decorated class the generator emits the public API shape: method signatures (name, parameter names+types, return type) extracted from AST method declarations, not decorator arguments. It additionally emits all option types referenced **directly** in those method signatures (e.g. `OnsetSliceOptions`, `NmfOptions`) — one level deep only, no recursive resolution. Option types are required so the language service can populate `expectedType.properties` for OptionsCompleter. Implementation details and private members are excluded. Build fails if a referenced option type cannot be resolved.
- `src/shared/repl-registry.generated.ts` — runtime metadata for the REPL Intelligence Layer in the main process. Contains param kinds, summaries, and visibility flags extracted from `@describe`/`@param` decorator arguments (AST-level, not runtime reflection). Shape: a flat object keyed by `"NamespaceName.methodName"` → `{ summary, visibility, params: [{ name, kind, summary }], returns }`. The main process imports this file directly for completer dispatch — it does not import renderer namespace or result type files. Build fails if a decorated class has a public method missing `@describe`.

**User-defined function inference:**
The language service infers both parameter and return types for user-defined functions. For example:
```ts
const process = (s: Sample) => s.onsetSlice()
// Language service infers: process: (s: Sample) => SliceFeaturePromise
```
This enables type-aware completion for user code, not just built-in namespaces.

#### Phase 3: Completers and intelligence layer

> **Note on visibility state:** `env.dev()` is not added until Phase 5c. Until then, the intelligence layer defaults to `false` (porcelain-only filtering). Plumbing items are never surfaced in completions or help until the toggle is wired up.

**New files:**
- `src/electron/completers/identifier-completer.ts`
- `src/electron/completers/property-completer.ts`
- `src/electron/completers/file-path-completer.ts`
- `src/electron/completers/sample-hash-completer.ts`
- `src/electron/completers/options-completer.ts`
- `src/electron/completers/typed-value-completer.ts`
- `src/electron/repl-intelligence.ts` — orchestrator: receives CompletionContext, dispatches to completers, filters by visibility
- `src/shared/completer.ts` — `Completer` interface, `PredictionResult` type

**Modified files:**
- `src/shared/ipc-contract.ts` — add `completion:request` to the typed IPC contract (Handle pattern: renderer invokes, main handles; payload: `{ buffer: string; cursor: number; requestId: number }`, response: `PredictionResult[]`)
- `src/electron/ipc/` — new IPC handler for `completion:request`
- `src/electron/preload.ts` — expose `completion:request` channel

#### Phase 4: Renderer integration

**Modified files:**
- `src/renderer/tab-completion.ts` — rewrite to send debounced IPC instead of local completion logic
- `src/renderer/app.ts` — debounce logic, trigger character handling, request ID tracking, ghost text rendering from IPC results (ghost text only — no completion menu)

#### Phase 5.1: Migrate remaining namespaces

**Modified files:**
- `src/renderer/namespaces/*.ts` — convert remaining namespace builders to decorator-annotated classes (one at a time)
- `src/renderer/bounce-api.ts` — update as each namespace is migrated

#### Phase 5.2: Migrate porcelain types

**Modified files:**
- `src/renderer/results/*.ts` — add `@replType`, `@describe`, `@param` decorators to all porcelain result types

#### Phase 5.3: Help system and visibility

**Modified files:**
- `src/renderer/help.ts` — render help from `Describable` metadata instead of generated `porcelainTypeHelps`; visibility-aware (only show plumbing in dev mode)
- `src/renderer/namespaces/env-namespace.ts` — add `env.dev(toggle)` method for runtime porcelain/plumbing visibility toggle
- Remove `src/renderer/results/porcelain.ts` (replaced by decorators on result types)
- Remove `src/renderer/results/porcelain-types.generated.ts` (replaced by runtime descriptors)
- Remove `src/help-generator.ts` and `scripts/generate-help.ts` (codegen no longer needed)

#### Phase 5.4: Scope persistence and session restore

**Modified files:**
- `src/electron/database.ts` — add `session_start_timestamp` column (NOT NULL DEFAULT 0) to the settings table; add query for deriving language service session source from `command_history WHERE timestamp > session_start_timestamp`
- `src/electron/main.ts` — on startup, after `langservice:ready`, query command history WHERE timestamp > session_start_timestamp for the current project and send to language service via `langservice:session-restore` (main process to utility process via MessagePort — the renderer cannot initiate MessagePort messages to the language service)
- `src/electron/ipc/` — update `env.clear` and project-switch IPC handlers to set `session_start_timestamp` to the current Unix timestamp in SQLite and send `langservice:session-reset` to the language service
- `src/electron/repl-intelligence.ts` — implement crash loop prevention with incremental restore fallback

#### Phase 5.5: Documentation

**Modified files:**
- `ARCHITECTURE.md` — new process model, IPC channels, application state taxonomy

### Terminal UI Changes

- Tab completion now works for porcelain type names, option object keys, and type-aware variable suggestions
- Ghost text rendering unchanged in appearance but driven by IPC results
- Help system output unchanged in appearance but driven by decorator metadata
- `env.dev(true)` reveals plumbing items in help and completions; `env.dev(false)` hides them

### REPL Interface Contract

Every REPL-exposed object, namespace, method, and type must have `@describe` decorator. Enforced at build time via the validation script (`scripts/validate-repl-descriptors.ts`). Compile-time companion interfaces were ruled out — see RESEARCH.md § Decorator Enforcement Strategy. Both porcelain and plumbing items must be fully documented. Visibility is a runtime display filter, not a documentation gate.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point — injected onto the prototype by `@namespace`/`@replType` decorators; `Describable` interface documents the contract (see § `Describable` interface above)
- [x] Every returned custom REPL type defines a useful terminal summary — enforced by decorator metadata
- [x] The summary highlights workflow-relevant properties — controlled by `@describe` content
- [x] Unit tests for `help()` output — existing tests continue to work against new metadata source
- [x] Unit tests for returned-object display behavior — unchanged

### Configuration/Build Changes

- `package.json`: Add `validate:repl` script to build pipeline; move `typescript` from `devDependencies` to `dependencies` so it is available at runtime in the packaged Electron app (required by the language service utility process — `ts.createLanguageService()` needs the TypeScript compiler at runtime, not just at build time)
- `tsconfig.json`, `tsconfig.renderer.json`, `tsconfig.electron.json`: Enable `experimentalDecorators: true` in all three — namespace files live in `src/renderer/` (compiled by `tsconfig.renderer.json`) and main-process files in `src/electron/` (compiled by `tsconfig.electron.json`)
- `scripts/validate-repl-descriptors.ts`: New build-time check

## Porcelain/Plumbing Visibility

### Decorator usage

```ts
// Default: porcelain (omitting visibility = porcelain)
@describe({ summary: "Read an audio file" })
read(path: string): SamplePromise { /* ... */ }

// Explicit plumbing
@describe({ summary: "Dump internal buffer state", visibility: "plumbing" })
dumpBuffers(): void { /* ... */ }
```

### Runtime toggle

- `env.dev(true)` — show plumbing in help and completions
- `env.dev(false)` — hide plumbing (default)
- `BOUNCE_DEV=1` — launch in dev mode

### Build enforcement

Both porcelain and plumbing must have complete descriptors. The build-time validation script checks all public methods on registered classes regardless of visibility. Missing descriptor = build failure.

## Completer Taxonomy

### Completer types

| Completer | Context trigger | Data source |
|---|---|---|
| **IdentifierCompleter** | `position.kind === "identifier"` | Registered namespaces + porcelain type names (from registry, filtered by visibility) **plus** user-defined variable names inferred by the language service from the accumulated session source (e.g. `const samp = await sn.read(...)` makes `samp` a completion candidate at root level) |
| **PropertyCompleter** | `position.kind === "propertyAccess"` | Describable metadata for the resolved type (filtered by visibility) |
| **FilePathCompleter** | `position.kind === "stringLiteral"` + `@param` kind `"filePath"` | Filesystem via main process |
| **SampleHashCompleter** | `position.kind === "stringLiteral"` + `@param` kind `"sampleHash"` | SQLite database via main process |
| **OptionsCompleter** | `position.kind === "objectLiteralKey"` | Expected type's property descriptors, filtered by already-provided keys |
| **TypedValueCompleter** | `position.kind === "callArgument"` + `@param` kind `"typed"` | User variables whose inferred type matches the expected type |

### Dispatch logic for string literals

When `position.kind === "stringLiteral"`, the CompletionContext alone only indicates the cursor is inside a string — not what kind of value is expected. The intelligence layer resolves this by:

1. Reading `callee.name`, `callee.parentType`, and `paramIndex` from the CompletionContext
2. Looking up the `@param` decorator for that method + parameter index in the registry
3. Dispatching to the completer matching the `@param` `kind` field:
   - `"filePath"` → FilePathCompleter
   - `"sampleHash"` → SampleHashCompleter
   - `"plain"` or unspecified → no string-internal completion

### Dispatch logic for union-typed params

When `@param` has `kind: "typed"` and the `expectedType` resolved by the language service is a union (e.g. `SliceFeature | NmfFeature`), `TypedValueCompleter` dispatches once per member type and merges the candidate lists. Duplicates (same variable name appearing in multiple dispatches) are deduplicated by name.

### Namespace methods → completers

#### sn (Sample namespace)

| Method | Param | Completer |
|---|---|---|
| `read(path)` | `path` | FilePathCompleter |
| `load(hash)` | `hash` | SampleHashCompleter |
| `list()` | — | — |
| `current()` | — | — |
| `inputs()` | — | — |

#### fs (Filesystem namespace)

| Method | Param | Completer |
|---|---|---|
| `ls(path?)` | `path` | FilePathCompleter |
| `la(path?)` | `path` | FilePathCompleter |
| `cd(path)` | `path` | FilePathCompleter |
| `walk(path?)` | `path` | FilePathCompleter |
| `glob(pattern)` | — | — |

#### vis (Visualization namespace)

| Method | Param | Completer |
|---|---|---|
| `waveform(sample)` | `sample` | TypedValueCompleter (expects Sample) |
| `stack()` | — | — |

#### proj (Project namespace)

| Method | Param | Completer |
|---|---|---|
| `create(name)` | — | — |
| `load(name)` | `name` | Future: ProjectNameCompleter |
| `list()` | — | — |

#### inst (Instrument namespace)

| Method | Param | Completer |
|---|---|---|
| `list()` | — | — |
| `create(name, opts)` | `opts` | OptionsCompleter |

#### corpus (Corpus namespace)

| Method | Param | Completer |
|---|---|---|
| `build(source?, featureHashOverride?)` | `source` | TypedValueCompleter (expects SampleResult) |
| `query(segmentIndex, k?)` | — | — |
| `resynthesize(queryIndices)` | — | — |

#### midi (MIDI namespace)

| Method | Param | Completer |
|---|---|---|
| `devices()` | — | — |
| `open(index)` | — | — |
| `close()` | — | — |
| `record(inst, opts?)` | `inst` | TypedValueCompleter (expects InstrumentResult) |
| | `opts` | OptionsCompleter (`duration`, `name`) |
| `sequences()` | — | — |
| `load(filePath)` | `filePath` | FilePathCompleter |

#### mx (Mixer namespace)

| Method | Param | Completer |
|---|---|---|
| `ch(n)` | — | — |

Note: `mx.channels`, `mx.preview`, and `mx.master` are getter properties, not methods — no completion needed.

**ChannelControl** (returned by `mx.ch(n)`):

| Method | Param | Completer |
|---|---|---|
| `gain(db?)` | — | — |
| `pan(value?)` | — | — |
| `mute()` | — | — |
| `solo()` | — | — |
| `attach(instrument)` | `instrument` | TypedValueCompleter (expects InstrumentResult) |
| `detach()` | — | — |

#### transport (Transport namespace)

| Method | Param | Completer |
|---|---|---|
| `bpm(value?)` | — | — |
| `start()` | — | — |
| `stop()` | — | — |

#### pat (Pattern namespace)

| Method | Param | Completer |
|---|---|---|
| `xox(notation)` | — | — |

### Porcelain type methods → completers

#### Sample

| Method | Param | Completer |
|---|---|---|
| `play()` | — | — |
| `loop(opts?)` | `opts` | OptionsCompleter (`loopStart`, `loopEnd`) |
| `stop()` | — | — |
| `display()` | — | — |
| `onsetSlice(opts?)` | `opts` | OptionsCompleter (`threshold`, `minSliceLength`, `filterSize`, `frameDelta`, `metric`) |
| `ampSlice(opts?)` | `opts` | OptionsCompleter (`fastRampUp`, `fastRampDown`, `slowRampUp`, `slowRampDown`, `onThreshold`, `offThreshold`, `floor`, `minSliceLength`, `highPassFreq`) |
| `noveltySlice(opts?)` | `opts` | OptionsCompleter (`kernelSize`, `threshold`, `filterSize`, `minSliceLength`, `windowSize`, `fftSize`, `hopSize`) |
| `transientSlice(opts?)` | `opts` | OptionsCompleter (`order`, `blockSize`, `padSize`, `skew`, `threshFwd`, `threshBack`, `windowSize`, `clumpLength`, `minSliceLength`) |
| `nmf(opts?)` | `opts` | OptionsCompleter (`components`, `iterations`, `fftSize`, `hopSize`, `windowSize`, `seed`) |
| `mfcc(opts?)` | `opts` | OptionsCompleter (`numCoeffs`, `numBands`, `minFreq`, `maxFreq`, `windowSize`, `fftSize`, `hopSize`, `sampleRate`) |
| `nx(other, opts?)` | `other` | TypedValueCompleter (expects Sample) |
| | `opts` | OptionsCompleter (`components`) |
| `granularize(opts?)` | `opts` | OptionsCompleter (`grainSize`, `hopSize`, `jitter`, `startTime`, `endTime`, `normalize`, `silenceThreshold`) |

#### SliceFeature

| Method | Param | Completer |
|---|---|---|
| `playSlice(index?)` | — | — |
| `slice(opts?)` | `opts` | OptionsCompleter (`featureHash`) |
| `toSampler(opts)` | `opts` | OptionsCompleter (`name`, `startNote`, `polyphony`) |

#### NmfFeature

| Method | Param | Completer |
|---|---|---|
| `sep(opts?)` | `opts` | OptionsCompleter (`components`, `iterations`) |
| `playComponent(index?)` | — | — |

#### NxFeature

| Method | Param | Completer |
|---|---|---|
| `playComponent(index?)` | — | — |

#### VisScene

| Method | Param | Completer |
|---|---|---|
| `title(text)` | — | — |
| `overlay(feature)` | `feature` | TypedValueCompleter (expects SliceFeature \| NmfFeature — dispatches for each type in the union, merges results) |
| `panel(feature)` | `feature` | TypedValueCompleter (expects NmfFeature) |
| `show()` | — | — |

#### VisStack

| Method | Param | Completer |
|---|---|---|
| `waveform(sample)` | `sample` | TypedValueCompleter (expects Sample) |
| `addScene(scene)` | `scene` | TypedValueCompleter (expects VisScene) |
| `overlay(feature)` | `feature` | TypedValueCompleter (expects SliceFeature \| NmfFeature — dispatches for each type in the union, merges results) |
| `panel(feature)` | `feature` | TypedValueCompleter (expects NmfFeature) |
| `title(text)` | — | — |
| `show()` | — | — |

#### Pattern

| Method | Param | Completer |
|---|---|---|
| `play(channel)` | — | — |
| `stop()` | — | — |

#### AudioDevice

| Method | Param | Completer |
|---|---|---|
| `record(sampleId, opts?)` | `opts` | OptionsCompleter (`duration`, `overwrite`) |

#### RecordingHandle / MidiRecordingHandle

| Method | Param | Completer |
|---|---|---|
| `stop()` | — | — |

#### MidiSequence

| Method | Param | Completer |
|---|---|---|
| `play(instrument)` | `instrument` | TypedValueCompleter (expects InstrumentResult) |
| `stop()` | — | — |

#### InstrumentResult

`InstrumentResult` is a data object (returned by `inst.list()` and `inst.create()`). It has no REPL-callable methods — only read-only properties (`instrumentId`, `name`, `kind`, `polyphony`, `sampleCount`). No completers apply.

### Completer usage summary

| Completer | Call sites |
|---|---|
| IdentifierCompleter | Always active at root level |
| PropertyCompleter | Always active after `.` |
| FilePathCompleter | 5 (`sn.read`, `fs.ls`, `fs.la`, `fs.cd`, `fs.walk`) |
| SampleHashCompleter | 1 (`sn.load`) |
| OptionsCompleter | ~18 (every method taking an opts object) |
| TypedValueCompleter | ~11 (`nx`, `vis.waveform`, `VisScene.overlay`, `VisScene.panel`, `VisStack.waveform`, `VisStack.addScene`, `VisStack.overlay`, `VisStack.panel`, `MidiSequence.play`, `midi.record` inst, `ChannelControl.attach`) |

## Language Service Robustness

### Crash recovery
- Main process monitors utility process; auto-restarts on unexpected exit
- After restart, replays session source via `langservice:session-restore`
- During restart window, completion requests return empty candidates (graceful degradation)
- In dev mode, surface restart status in status bar

### State-induced crash loop prevention
- Track crashes within a window (3 crashes in 60s)
- Escalation: full restore → incremental restore (skip bad lines) → clean slate → run without language service
- Incremental restore feeds lines one at a time, skips any line that caused a crash
- Dev mode surfaces degraded state; porcelain mode silently degrades

### Performance monitoring
- Completion requests timestamped; main tracks roundtrip times
- Warn if roundtrip exceeds 500ms (tunable); surface in dev mode status bar
- Request cancellation via incrementing IDs; stale responses discarded

### Health reporting
- Language service reports memory usage, average parse time, error count via `langservice:health` (every 30s)
- Main process warns if memory exceeds threshold (e.g. 200MB)
- On `env.clear()` or project switch, reset virtual session file to reclaim memory

### Startup
- Two-level initialization: the utility **process** spawns eagerly at app launch; `ts.createLanguageService()` inside the process initializes **lazily** on the first `langservice:parse` request
- `langservice:ready` is sent once `ts.createLanguageService()` completes; main can poll `langservice:status` to check readiness
- Completion requests before `langservice:ready` are silently dropped (no error, no candidates)
- First completion request after launch may have higher latency (~200–500ms) due to TS language service cold start

## Testing Strategy

### Unit Tests

- Decorator metadata: verify `@describe`/`@param` attach correct metadata including visibility
- **Decorator ordering invariant**: verify that a method decorated with multiple `@param` decorators produces a parameter list in declaration order — tests the prepend-not-append requirement; a single failing case here silently corrupts all multi-param method metadata
- Registry: verify `registerNamespace`/`registerType` store and retrieve metadata; verify visibility filtering
- Each completer: verify `predict()` returns correct candidates for given contexts; per-completer representative cases:
  - `OptionsCompleter`: empty prefix returns all keys; prefix filters; already-provided keys excluded; plumbing keys excluded in porcelain mode
  - `TypedValueCompleter`: union type dispatches once per member and merges; duplicate variable names deduplicated
  - `IdentifierCompleter`: returns registered namespace names; returns `sessionVariables` from context; visibility filter applied
  - `FilePathCompleter`: returns matching filesystem entries for given prefix; handles empty prefix
  - `SampleHashCompleter`: returns matching hashes from SQLite for given prefix
  - `PropertyCompleter`: returns methods for resolved type; visibility filter applied
- CompletionContext parsing: verify language service returns correct context for various cursor positions
- Integration: verify end-to-end flow from buffer text to completion candidates
- Help rendering: verify `Describable` metadata produces correct help output; verify porcelain/plumbing filtering
- Session derivation: verify language service session is correctly derived from command history (filters by `session_start_timestamp`); scenarios: normal case, first-launch / empty history (`session_start_timestamp = 0` means `WHERE timestamp > 0` returns all history, but command_history is empty on first launch so restore is a no-op), project switch (session_start_timestamp updated to current time, subsequent restore returns only newer entries), multiple `env.clear()` calls
- Crash loop prevention: verify progressive fallback (incremental restore, skip bad lines, clean slate)
- **Generator script** (`scripts/generate-repl-artifacts.ts`):
  - Correctly emits method signatures into `.d.ts` for a minimally-decorated class
  - Emits option types referenced in method signatures (one level deep only; nested types not recursively resolved)
  - Build fails when a referenced option type cannot be resolved
  - Generated `repl-registry.generated.ts` contains correct param kinds, summaries, and visibility flags
  - Build fails when a public method on a `@namespace`/`@replType` class is missing `@describe`
  - Correctly handles a class with both porcelain and plumbing methods (both appear in registry; visibility flags differ)

### E2E Tests

#### Tab-key test infrastructure (required before writing completion E2E tests)

The existing `sendCommand` helper in `tests/helpers.ts` types full commands and presses Enter. Tab-completion tests require mid-input Tab: type a partial expression, wait for the debounce, press Tab, then inspect ghost text or accepted completion. A new helper must be added to `tests/helpers.ts` (or a new `tests/completion-helpers.ts`):

```ts
/**
 * Types a partial expression into the xterm terminal, waits for the
 * completion debounce, presses Tab, and returns the ghost text shown.
 * Throws if no ghost text appears within the timeout.
 */
async function typeAndTab(
  page: Page,
  partial: string,
  opts?: { timeout?: number }
): Promise<string>
```

Implementation notes:
- Use `page.keyboard.type(partial)` to type character-by-character into the focused xterm terminal
- Wait at least 200ms after the last character (covers the 150ms debounce + round-trip margin)
- Press `page.keyboard.press('Tab')`
- Read ghost text from the DOM element that xterm.js renders it into (identify the selector during Phase 4 implementation)
- Return the ghost text string; throw if it does not appear within `opts.timeout` (default: 3000ms)

This helper must be built and validated before writing any completion Playwright test.

#### Completion tests

- Playwright test: `sn.` + Tab → verify method list contains known methods (e.g. `read`, `load`, `list`)
- Playwright test: `Sample.` + Tab → verify Sample type methods appear (e.g. `play`, `onsetSlice`, `nmf`)
- Playwright test: `sn.read('/` + Tab → verify filesystem path completions appear
- Playwright test: `onsetSlice({` + Tab → verify option keys appear (e.g. `threshold`, `minSliceLength`)
- Playwright test: verify plumbing items hidden by default; after `env.dev(true)`, verify a known plumbing method (e.g. `dumpBuffers`) appears in completions

#### Type-aware variable completion (core value proposition)

- Playwright test: evaluate `const samp = await sn.read('/path/to/test.wav')`, then type `samp.` + Tab → verify Sample methods appear (confirms language service inferred the type from session source)

#### Regression baseline (establish before Phase 5.1 begins)

- Playwright test: verify basic namespace method completion still works end-to-end after each Phase 5.1 chunk (`sn.` → method list; `fs.ls(` → no crash); this test must be green before each migration chunk is merged

### Manual Testing

- Verify completion latency feels responsive (150ms debounce)
- Verify trigger characters fire immediately
- Verify ghost text rendering for all completion contexts
- Verify help() output unchanged in appearance after migration
- Verify language service crash recovery (kill process, verify auto-restart)
- Verify scope persistence across app restart includes language service type context

### Crash loop prevention

- Tested manually: kill utility process during completion, verify auto-restart and completion returns empty candidates during restart window
- **Unit tests** (automated):
  - Crash counting and threshold detection: verify 3 crashes within 60s triggers escalation; verify counter resets after 60s without a crash
  - Incremental restore: given session source where line N causes a crash, verify line N is skipped and the remaining lines are replayed correctly
  - Full escalation sequence: simulate crashes exceeding incremental-restore threshold, verify escalation to clean-slate mode
  - Clean-slate fallback: verify the language service process starts successfully with an empty virtual file when all restore strategies fail
  - Cascading error handling: verify that skipping a declaration line (e.g. `let x = ...`) does not itself trigger additional escalations when downstream `x` references produce TS errors (type errors are not crashes)

### Build-time Validation

- `scripts/validate-repl-descriptors.ts` runs as part of build
- Verify it catches missing decorators on both porcelain and plumbing methods
- Verify it passes on fully decorated namespaces

## Success Criteria

1. Every REPL-exposed namespace, type, and method has tab completion working automatically from its registration
2. Adding a new namespace or method requires only the class + decorators — no manual updates to global lists or separate metadata files
3. Compile-time error (via companion interface) or build-time error (via validation script) if any descriptor is missing (porcelain or plumbing)
4. Option object keys are completable inside `{}`
5. User-defined variables complete based on inferred types
6. Help system produces identical output from decorator metadata (no visible change to users)
7. Porcelain/plumbing toggle works via `env.dev()` and `BOUNCE_DEV=1`
8. Language service recovers gracefully from crashes
9. Language service session derived from command history (no new storage table); `session_start_timestamp` setting added
10. All existing tests continue to pass
11. ARCHITECTURE.md updated with new process model and IPC channels

## Risks & Mitigation

- **Risk:** Language Service utility process adds ~50-100MB memory overhead.
  **Mitigation:** Acceptable for desktop Electron app. Eager start at launch, health monitoring.

- **Risk:** Converting all namespaces from builder functions to classes is a large refactor.
  **Mitigation:** Single-pass migration — all namespaces and types migrated atomically in Phase 5. No old/new system coexistence. The phased work chunks (5.1.x, 5.2.x) are parallelizable but all must land together before the old `BOUNCE_GLOBALS`, `withHelp`, and codegen are removed.

- **Risk:** 150ms debounce may feel sluggish on fast machines.
  **Mitigation:** Tunable parameter. Can reduce to 50-100ms if language service performance allows.

- **Risk:** TypeScript Language Service startup time may delay first completion.
  **Mitigation:** Eager start at app launch; `langservice:ready` signal.

- **Risk:** Decorator semantics differ between TC39 and `experimentalDecorators`.
  **Mitigation:** Resolved — using `experimentalDecorators` (battle-tested) on TypeScript 5.9.x.

- **Risk:** Option types with properties that are themselves complex types will have incomplete `OptionsCompleter` candidates — the `.d.ts` generator resolves only one level deep.
  **Mitigation:** Acceptable for now. Nested option types are rare in the current API. Tracked as a known limitation for a future generator enhancement.

- **Risk:** Session source accumulation could grow unbounded in long sessions.
  **Mitigation:** Health monitoring; reset on `env.clear()` / project switch; restart utility process if memory exceeds threshold.

- **Risk:** Restored session source could crash the language service in a loop.
  **Mitigation:** Progressive fallback: full restore → incremental restore (skip bad lines) → clean slate. Crash counting with threshold (3 crashes in 60s).

## Implementation Order

### Phase 1: Decorator infrastructure and registration system
- Define `@describe`, `@param` decorators with `visibility` field
- Define `Describable` interface and `DescribedMethod` type
- Implement `registerNamespace()` / `registerType()` with visibility-aware queries
- Build-time validation script
- Migrate `sn` namespace as proof of concept; verify registry-driven globals construction works
- **Do not remove `BOUNCE_GLOBALS` in Phase 1** — the remaining 9 namespaces still depend on it. Removal is gated on all Phase 5.1 chunks completing (executed as part of Phase 5.3 cleanup)

### Phase 2: Language Service utility process
- Scaffold utility process with `ts.createLanguageService()`
- Implement lazy initialization with `langservice:status` polling
- Generate `.d.ts` environment file from decorator-marked classes
- Implement `CompletionContext` extraction from AST + type checker
- MessagePort communication with main process
- Health reporting (`langservice:health`)
- Ready signal (`langservice:ready`)
- Auto-restart on crash

### Phase 3: Completers and intelligence layer
- Implement all 6 completers
- Build intelligence layer orchestrator with visibility filtering
- IPC handler for `completion:request`
- Request ID tracking and cancellation

### Phase 4: Renderer integration
- Rewrite `tab-completion.ts` to use debounced IPC
- Trigger character optimization (immediate fire on `.`, `(`, `{`)
- Ghost text rendering from IPC results
- Request ID matching (discard stale responses)

### Phase 5: Migration and cleanup (parallelizable work chunks)

Phase 5 is large but consists of independent work chunks that can be done in parallel or by different contributors. Each chunk is a self-contained unit with its own verification.

#### Phase 5.1: Namespace migration (10 independent chunks)

Each namespace is migrated independently. After each migration, run tests to verify no regression.

| Chunk | Namespace | Estimated Size | Dependencies |
|-------|-----------|----------------|--------------|
| 5.1.1 | `fs` | Small (5 methods) | Phase 1 |
| 5.1.2 | `vis` | Medium (scene, stack) | Phase 1 |
| 5.1.3 | `proj` | Small (3 methods) | Phase 1 |
| 5.1.4 | `env` | Small + add `dev()` toggle | Phase 1 |
| 5.1.5 | `midi` | Medium (devices, recording) | Phase 1 |
| 5.1.6 | `mx` | Medium (mixer channels) | Phase 1 |
| 5.1.7 | `transport` | Small (play, stop, tempo) | Phase 1 |
| 5.1.8 | `pat` | Medium (pattern DSL) | Phase 1 |
| 5.1.9 | `inst` | Medium (instruments) | Phase 1 |
| 5.1.10 | `corpus` | Small (3 methods) | Phase 1 |

#### Phase 5.2: Porcelain type migration (12 independent chunks)

Each porcelain type is migrated independently. After each migration, run tests to verify no regression.

| Chunk | Type | Estimated Size | Dependencies |
|-------|------|----------------|--------------|
| 5.2.1 | `Sample` | Large (many analysis methods) | Phase 1 |
| 5.2.2 | `SliceFeature` | Medium | Phase 1 |
| 5.2.3 | `NmfFeature` | Small | Phase 1 |
| 5.2.4 | `NxFeature` | Small | Phase 1 |
| 5.2.5 | `VisScene` | Medium | Phase 1 |
| 5.2.6 | `VisStack` | Small | Phase 1 |
| 5.2.7 | `Pattern` | Medium | Phase 1 |
| 5.2.8 | `AudioDevice` | Small | Phase 1 |
| 5.2.9 | `RecordingHandle` | Small | Phase 1 |
| 5.2.10 | `MidiRecordingHandle` | Small | Phase 1 |
| 5.2.11 | `MidiSequence` | Small | Phase 1 |
| 5.2.12 | `InstrumentResult` | Small | Phase 1 |

#### Phase 5.3: Help system transition

- Add `env.dev()` toggle for porcelain/plumbing visibility
- Replace JSDoc-based help system with decorator-based rendering
- Remove old codegen files (`porcelain.ts`, `porcelain-types.generated.ts`, `help-generator.ts`, `generate-help.ts`)

**Dependencies:** All of Phase 5.1 and 5.2 must be complete (all types decorated)

#### Phase 5.4: Scope persistence and session restore

- Add `session_start_timestamp` to the existing database migration (modify in place — no new migration version needed; users should drop and recreate their database)
- Store `session_start_timestamp` (updated on `env.clear()` and project switch)
- On startup, derive language service session from `command_history WHERE timestamp > session_start_timestamp`
- Replay derived session source via `langservice:session-restore`
- Implement crash loop prevention with progressive fallback

**Dependencies:** Phase 2 (language service exists)

#### Phase 5.5: Documentation

- Update ARCHITECTURE.md with new process model and IPC channels
- Document application state taxonomy (what constitutes app state, how each piece is persisted/restored, where "session" fits)
- Add LSP consideration rationale to architecture docs

**Dependencies:** All other phases complete

### Work chunk summary

| Phase | Chunks | Can parallelize? | Blocking dependencies |
|-------|--------|------------------|----------------------|
| 1 | 1 | No | None |
| 2 | 1 | No | Phase 1 |
| 3 | 1 | No | Phase 2 |
| 4 | 1 | No | Phase 3 |
| 5.1 | 10 | Yes (all independent) | Phase 1 |
| 5.2 | 12 | Yes (all independent) | Phase 1 |
| 5.3 | 1 | No | 5.1, 5.2 |
| 5.4 | 1 | No | Phase 2 |
| 5.5 | 1 | No | All |

**Total: 28 discrete work chunks**, of which 22 (5.1.* and 5.2.*) can be done in parallel.

## Estimated Scope

Large — spans multiple phases across all three existing processes plus a new utility process.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (no transition period — single-pass atomic migration; both systems coexist internally during Phase 5 work on a feature branch, but BOUNCE_GLOBALS and old codegen are only removed in Phase 5.3 after all Phase 5.1 and 5.2 chunks are complete)
- [x] All sections agree on the data model / schema approach (decorators + build-time validation script + visibility; compile-time companion interfaces were ruled out — see RESEARCH.md § Decorator Enforcement Strategy)
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and Playwright coverage for REPL help/display behavior
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
- [x] IPC channels documented in both RESEARCH.md and PLAN.md
- [x] Language service robustness (crash recovery, health, startup) documented
- [x] Scope persistence impact documented
- [x] Porcelain/plumbing visibility documented with build enforcement rules
