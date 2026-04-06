# Research: REPL Intelligence — Unified Registration, Completion, and Help

**Spec:** specs/repl-intelligence
**Created:** 2026-04-04
**Status:** In Progress

## Problem Statement

Bounce's REPL has grown to include many namespaces, porcelain types, methods, and option objects, but the systems that make them discoverable (tab completion, help) are manually maintained and disconnected. Adding a new namespace or type requires updating multiple separate lists (`BOUNCE_GLOBALS`, JSDoc codegen, etc.), and things get missed — porcelain types have no tab completion, some namespaces (`mx`, `transport`, `pat`) are missing from the completion candidates, and there's no completion inside option objects.

We need a unified architecture where registering something in the REPL automatically wires up tab completion, help, and future intelligence features — from a single source of truth.

## Background

### Current state

- **Tab completion** (`src/renderer/tab-completion.ts`): Four hardcoded contexts (global, method, path, hash). Global candidates come from a manually maintained `BOUNCE_GLOBALS` set. Method completion uses runtime reflection. Path/hash completions are special-cased via regex. No completion inside option objects `{}`.
- **Help system**: Driven by `@porcelain` JSDoc tags in `porcelain.ts`, parsed by a custom generator (`help-generator.ts`), producing `porcelain-types.generated.ts`. Separate from tab completion metadata.
- **Registration**: No unified registration. Namespaces are built by individual builder functions, spread into the API object in `bounce-api.ts`, and separately listed in `BOUNCE_GLOBALS` in `repl-evaluator.ts`. This spec removes `BOUNCE_GLOBALS` entirely — all namespaces will be migrated to the decorator-based registration system.
- **Scope persistence**: On shutdown, `serializeScope()` saves JSON values and function source strings via `saveReplEnv`. On startup, `restoreScope()` re-evaluates functions and parses JSON values. This does NOT preserve original TypeScript source for variable declarations.

### Gaps

1. Porcelain types (Sample, SliceFeature, etc.) are not tab-completable
2. `mx`, `transport`, `pat` namespaces missing from `BOUNCE_GLOBALS`
3. No completion inside option objects (e.g. `onsetSlice({ th` → `threshold`)
4. No type-aware completion for user-defined variables (e.g. `samp.` doesn't know `samp` is a `Sample` unless it runtime-reflects the live object)
5. Help metadata and completion metadata are maintained in separate systems
6. Adding anything new to the REPL requires touching multiple disconnected files
7. No porcelain/plumbing distinction — developer internals and user-facing APIs are mixed

## Design Decisions

### TypeScript Language Service as a utility process

Use the official TypeScript Language Service (`ts.createLanguageService()`) running in an Electron utility process. It provides:
- AST parsing of REPL input
- Full type inference (tracks user variable types through assignment chains)
- Type resolution at any cursor position

The language service is a **thin parsing/type-resolution backend**. It does NOT generate completion candidates. It returns a structured `CompletionContext` describing the cursor position, resolved types, and AST structure. Bounce's own intelligence layer consumes this context and dispatches to registered completers.

### REPL Intelligence Layer in the main process

The main process hosts the intelligence layer because it has access to:
- SQLite database (sample hashes)
- Filesystem (path completion)
- MIDI devices
- All registered namespace/type metadata

Flow: Renderer → (debounced IPC) → Main (intelligence layer) → Language Service (AST + types) → Main (dispatches to completers) → Renderer (candidates).

### Decorator-based registration with compile-time enforcement

All REPL-exposed namespaces and types use decorator-annotated class methods. A companion interface pattern plus a build-time validation script ensure nothing is exposed without descriptors. The decorator pattern provides:
- Help text (`.help()` on every method and namespace)
- Completion metadata (parameter kinds, return types)
- Visibility control (porcelain vs plumbing)
- Build-time error if any descriptor is missing (porcelain or plumbing)

### Porcelain/plumbing visibility

Every REPL-exposed item is categorized as either `"porcelain"` (user-facing, shown by default) or `"plumbing"` (developer-facing, hidden by default). Both must be fully documented — the build fails if either is missing descriptors. The distinction is purely a runtime display filter:

- **Default mode**: `help()` and completions show only porcelain items
- **Dev mode** (`env.dev(true)` or `BOUNCE_DEV=1`): `help()` and completions include plumbing items too
- **Build enforcement**: Identical for both — all public methods on registered classes must have `@describe`, regardless of visibility

This replaces the current `COMPLETION_HIDDEN_GLOBALS` pattern (which hides `clearDebug`) with a systematic approach.

### Completers as reusable types

Each completer implements `predict(context: CompletionContext): Iterator<PredictionResult>`. Completer types handle all completion scenarios. Methods declare which completer handles each parameter via the `@param` decorator's `kind` field.

The intelligence layer dispatches to completers based on a combination of `CompletionContext.position.kind` and `@param` metadata. For example, when `position.kind === "stringLiteral"`, the context alone only tells us the cursor is inside a string — not what kind of string. The intelligence layer cross-references the `callee` and `paramIndex` from the context against the `@param` decorator's `kind` field on the target method to determine which specialized completer to invoke (FilePathCompleter for `kind: "filePath"`, SampleHashCompleter for `kind: "sampleHash"`, etc.). If no `kind` is specified, no string-internal completion is offered.

### Debounced IPC for completion

150ms debounce on keystrokes from the renderer to main. Immediate fire (no debounce) on trigger characters: `.`, `(`, `{`. Quote characters (`'`, `"`) are debounced normally — immediate fire on quote open provides no useful candidates since the prefix is empty.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Renderer                                        │
│  - Captures keystrokes                          │
│  - Debounces, sends buffer via IPC              │
│  - Renders ghost text / completion menu         │
└──────────────────┬──────────────────────────────┘
                   │ IPC (buffer + cursor)
                   ▼
┌─────────────────────────────────────────────────┐
│ Main Process — REPL Intelligence Layer          │
│  - Sends buffer to Language Service for parsing │
│  - Receives CompletionContext (AST + types)     │
│  - Walks context, dispatches to completers      │
│  - Filters by visibility (porcelain/plumbing)   │
│  - Has access to DB, filesystem, MIDI devices   │
│  - Returns candidates to renderer               │
└──────────┬──────────────────────────────────────┘
           │ MessagePort
           ▼
┌─────────────────────────────────────────────────┐
│ Language Service Utility Process                │
│  - Runs ts.createLanguageService()              │
│  - Maintains virtual project:                   │
│    • Environment .d.ts (namespaces, types)      │
│    • Session file (accumulated REPL lines)      │
│  - Returns CompletionContext (not candidates)    │
│  - Reports health metrics                       │
│  - Thin — no business logic                     │
└─────────────────────────────────────────────────┘
```

## CompletionContext Shape

```ts
interface CompletionContext {
  position:
    | { kind: "identifier"; prefix: string;
        /**
         * User-defined variables currently in scope, resolved by the language
         * service from the accumulated session source. Populated only when
         * kind === "identifier". Used by IdentifierCompleter to offer type-aware
         * variable name candidates (e.g. `samp` after `const samp = await sn.read(...)`).
         */
        sessionVariables: Array<{ name: string; typeName: string }> }
    | { kind: "propertyAccess"; expressionType: TypeInfo; prefix: string }
    | { kind: "callArgument"; callee: CalleeInfo; paramIndex: number;
        expectedType: TypeInfo; prefix: string }
    | { kind: "objectLiteralKey"; expectedType: TypeInfo;
        existingKeys: string[]; prefix: string }
    | { kind: "stringLiteral"; callee: CalleeInfo; paramIndex: number;
        prefix: string }
    | { kind: "none" };

  ancestors: AstNodeInfo[];
  buffer: string;
  cursor: number;
}

interface TypeInfo {
  name: string;
  kind: "object" | "function" | "union" | "primitive" | "unknown";
  properties?: string[];
}

interface CalleeInfo {
  name: string;
  parentType: string;
  parameterTypes: TypeInfo[];
}

interface AstNodeInfo {
  kind: string;
  type?: TypeInfo;
  text?: string;
}
```

## Session File Accumulation and Scope Persistence

### Existing storage

Bounce already persists two things per project in SQLite:

- **`command_history`** — every command the user typed, timestamped, per project. Used for up/down arrow navigation. Survives `env.clear()`.
- **`repl_env`** — named scope entries (variable name → JSON value or function source). Used to restore runtime variable values on startup. Reset on `env.clear()` and project switch.

### During a session

After each REPL evaluation, the raw TypeScript source is appended to the language service's virtual session file. The language service infers variable types from the accumulated code. On scope clear (`env.clear()`) or project switch, the virtual session file is reset.

### Across sessions (deriving session source from command history)

The language service's session source can be **derived from existing data** rather than stored separately. The command history already contains every command the user typed. One small addition makes it usable for the language service:

- **Store a `session_start_timestamp`** (NOT NULL DEFAULT 0) — when `env.clear()` or a project switch occurs, record the current Unix timestamp. On restore, use `command_history WHERE timestamp > session_start_timestamp`. The default value 0 (Unix epoch) means the first restore returns all history — which is empty on first launch, so the restore is a no-op.

All commands are replayed regardless of runtime success/failure. The language service only parses TypeScript — it doesn't execute code. A command like `let x = sn.read("nonexistent.wav")` is perfectly valid TypeScript for type inference even if the file doesn't exist at runtime. The TS language service is also tolerant of minor errors in accumulated source.

**Raw source is stored.** `command_history` stores the raw user input exactly as typed, without any auto-await transformation applied by the REPL evaluator. This means the language service sees expressions like `sn.read("kick.wav")` (not `await sn.read("kick.wav")`), and will therefore infer the type of a variable assigned from such an expression as `Promise<Sample>` rather than `Sample`. This is a known, accepted limitation: users who explicitly type `await` will get correct `Sample` inference. The session replay path does not rewrite expressions to add `await` — doing so would be fragile and is not worth the complexity.

On startup:
1. `restoreScope()` restores runtime values into the evaluator — done by the renderer (unchanged)
2. Main process queries `command_history WHERE timestamp > session_start_timestamp` for the current project — done by the main process after `langservice:ready` is received
3. Main process sends those commands to the language service via `langservice:session-restore` (MessagePort — renderer cannot initiate MessagePort messages to the language service)
4. The language service infers types for all user variables from the replayed source

This avoids a third storage mechanism. The `repl_env` table still handles fast runtime value restoration (re-evaluating every command on startup would be slow and could have side effects). The command history provides the type-inference source as a read-only derivation.

**Note:** The broader question of application state backup/restore — precisely defining what constitutes "application state" and how each piece is persisted and restored — deserves its own section in ARCHITECTURE.md. The language service session is one component of this; `repl_env`, `command_history`, project settings, and audio engine state are others. A unified state taxonomy would clarify where "session" fits and prevent ad-hoc storage proliferation.

### Why not unify repl_env and command_history entirely?

They serve different purposes with different lifecycles:

| | command_history | repl_env |
|---|---|---|
| **Survives `env.clear()`** | Yes (it's a log) | No (scope is cleared) |
| **Content** | Raw user input (including failed commands) | Serialized values |
| **Used for** | Arrow-key history + lang service session | Runtime value restoration |
| **Keyed by** | Timestamp | Variable name |

Merging them would conflate a permanent log with ephemeral state. Keeping them separate with the language service session derived from command history is the cleanest approach.

## Decorator Enforcement Strategy

Compile-time enforcement via one mechanism:

**Build-time validation script**: Uses the TS compiler API to scan all registered classes and verify every public method has a `@describe` decorator. Runs as part of `npm run build:electron`. Catches structural issues across the entire project (e.g. a new namespace added without full decoration).

A `satisfies` + companion interface approach was considered but does not work with `experimentalDecorators`. TypeScript's type system does not modify a method's type after a decorator runs — even a correctly-decorated `read(path: string): SamplePromise` stays typed as exactly that, not as `DescribedMethod`. A `satisfies { read: DescribedMethod }` check would fail even on a correctly-decorated class, because TypeScript cannot see through decorator side effects. The build-time validation script (AST-level check for `@describe` presence) is the only reliable compile-time enforcement mechanism.

### `@param` decorator ordering

`@param` decorators are applied bottom-up (closest to the method runs first). To preserve correct parameter order in the registry, each `@param` decorator must **prepend** its entry to the parameter list rather than append. Given:

```ts
@param("other", { summary: "Source sample", kind: "typed", expectedType: "Sample" })
@param("opts",  { summary: "NMF options", kind: "options" })
nx(other: Sample, opts?: NxOptions): NxFeaturePromise { ... }
```

The `@param("opts")` decorator runs first, then `@param("other")`. If each prepends, the final list is `[other, opts]` — matching parameter declaration order. The registration implementation must explicitly prepend, not append.

## Language Service Robustness

### Crash recovery

The language service is a utility process. If it crashes, the REPL continues working (evaluation is independent). Strategy:
- Main process monitors the utility process; auto-restarts on unexpected exit
- After restart, replays session source via `langservice:session-restore`
- During restart window, completion requests return empty candidates (graceful degradation)
- In dev mode (`env.dev(true)`), surface restart status in the status bar

### State-induced crash loop prevention

If the restored session source itself triggers a crash in the TypeScript compiler, auto-restart would crash again on the same source. Progressive fallback:

1. **Crash counting**: Track crashes within a window (e.g., 3 crashes in 60 seconds).
2. **Incremental restore**: Instead of bulk replay, feed session source lines one at a time. Wait for acknowledgment after each line. If the process crashes after line N, skip line N on the next attempt. Log the problematic line for diagnostics.
3. **Clean slate**: If crashes exceed the threshold even with incremental restore (e.g., the environment `.d.ts` itself is the problem), restart with an empty virtual file. Completions degrade (no type inference for user variables) but don't crash loop.
4. **Dev mode visibility**: In plumbing mode, show a status message: "Language service restarted without session state — completions may be limited." In porcelain mode, silently degrade.

### Performance monitoring

- Every completion request is timestamped; main process tracks roundtrip times
- If roundtrip exceeds 500ms (tunable), log a warning; in dev mode, surface in status bar
- Request cancellation: each request gets an incrementing ID; stale requests are discarded on arrival
- Language service periodically reports health metrics (memory usage, average parse time)

### Memory management

- Monitor memory via `langservice:health` reports; warn if exceeding threshold (e.g. 200MB)
- On `env.clear()` or project switch, reset virtual session file to reclaim memory
- As last resort, restart utility process to reclaim memory

### Startup behavior

There are two levels of initialization, which must be kept distinct:

- **Process-level (eager)**: The language service utility process spawns at app launch, alongside the audio engine process.
- **TS language service (lazy)**: `ts.createLanguageService()` inside the utility process initializes on the first `langservice:parse` request, not at process spawn. This avoids blocking app startup.
- `langservice:ready` is sent by the utility process to main once `ts.createLanguageService()` has completed initialization.
- Main can poll `langservice:status` to check readiness before sending requests.
- Completion requests that arrive before `langservice:ready` are silently dropped (no error, no candidates).
- The first completion request after launch may have higher latency (~200–500ms) due to TS language service cold start; subsequent requests benefit from warm cache.

### Request ordering

- Incrementing request IDs prevent stale responses from being used
- Debouncing naturally limits concurrent requests
- Trigger-character immediate-fire can overlap with debounced requests; ID check handles this

## IPC Channel Inventory

| Channel | Direction | Pattern | Purpose |
|---|---|---|---|
| `completion:request` | Renderer → Main | Handle (request-response) | Send buffer + cursor, receive candidates |
| `langservice:parse` | Main → Lang Service | MessagePort request | Send buffer, receive CompletionContext |
| `langservice:session-append` | Main → Lang Service | MessagePort send | Append evaluated source line to virtual session file — triggered internally from the `save-command` IPC handler; no new renderer→main channel needed |
| `langservice:session-reset` | Main → Lang Service | MessagePort send | Clear virtual session file |
| `langservice:session-restore` | Main → Lang Service | MessagePort send | Bulk replay saved session source on startup |
| `langservice:ready` | Lang Service → Main | MessagePort send | Initialization complete signal |
| `langservice:status` | Main → Lang Service | MessagePort request | Poll readiness state (for lazy init check) |
| `langservice:health` | Lang Service → Main | MessagePort push | Periodic health metrics (memory, parse time, error count) |

## Future Features (beyond completion)

The REPL Intelligence Layer and CompletionContext architecture enable:
- **Parameter hints** — show expected parameter signatures while typing inside `()`
- **Pre-execution diagnostics** — type-aware error detection before Enter
- **Smart suggestions** — after a result, suggest relevant follow-up commands
- **Context-aware error messages** — better diagnostics using AST context
- **Pipeline visualization** — understand and render chains of type transformations

These are NOT in scope for this spec but motivate the architecture choices. To be tracked in ROADMAP.md.

## Technical Constraints

- The language service utility process adds memory overhead (~50-100MB for TS Language Service). Acceptable for a desktop Electron app.
- The build-time generator (`scripts/generate-repl-artifacts.ts`) produces **two artifacts** from the same pass over the decorated source:
  1. `src/shared/repl-environment.d.ts` — type declarations consumed by the language service utility process. Scans `src/renderer/**/*.ts` for `@namespace`/`@replType` decorated classes. Emits public method signatures (extracted from AST, not decorator args) plus all option types referenced directly in those signatures — one level deep, no recursive resolution. Build fails if a referenced type cannot be resolved.
  2. `src/shared/repl-registry.generated.ts` — runtime metadata (param kinds, summaries, visibility flags) consumed by the REPL Intelligence Layer in the main process for completer dispatch. Shape: flat object keyed by `"TypeName.methodName"` → `{ summary, visibility, params, returns }`. Extracted from `@describe`/`@param` decorator arguments at the AST level (not runtime reflection). The main process imports this generated file directly — it does not need to import renderer namespace or result type files. Build fails if any public method on a decorated class is missing `@describe`.
- Cross-platform: all new code is TypeScript (renderer + main + utility process). No native changes.
- User-defined functions: The language service infers both parameter and return types for user-defined functions, enabling type-aware completion for user code like `const foo = (x: Sample) => x.play()`.

## LSP Considered

We considered implementing the Language Server Protocol (LSP) instead of a custom MessagePort protocol:

**What LSP offers:**
- Standard protocol with well-defined types (`vscode-languageserver-protocol`)
- Existing TypeScript bindings via `typescript-language-server`
- Future extensibility for VS Code integration or external tooling

**Why we chose MessagePort:**
- LSP is designed for inter-process stdio/socket communication with external tools; Bounce's REPL is tightly integrated with its own renderer
- LSP adds protocol ceremony (lifecycle, capability negotiation, document sync) that doesn't benefit our use case
- Our custom `CompletionContext` maps directly to Bounce's completion dispatch; LSP's `CompletionItem[]` would require post-processing
- If VS Code integration is needed later, we can wrap the utility process with an LSP adapter as a separate concern without changing the internal protocol

## Resolved Questions

1. **`.d.ts` environment file generation**: Use the TypeScript compiler API to extract type information from the actual source. This ensures the `.d.ts` stays in sync with the real types. Generated as part of the build step. Emits method signatures from AST, not decorator args; option types resolved one level deep only.
2. **Decorator API shape**: See PLAN.md § Decorator API for concrete signatures. `@describe` goes on the method (summary, visibility, return description). `@param` is stacked per-parameter (name, summary, completer kind hint). `@namespace` and `@replType` are class-level decorators.
3. **TypeScript version**: Project is on TypeScript 5.9.3. Use `experimentalDecorators` — battle-tested, well-understood semantics for metadata attachment. TC39 decorators not needed. `emitDecoratorMetadata` is not needed; all metadata is stored explicitly in decorator arguments, not via runtime type reflection.
4. **TypedValueCompleter union dispatch**: When `@param` `kind: "typed"` has a union `expectedType` (e.g. `SliceFeature | NmfFeature`), dispatch once per union member and merge + deduplicate results by variable name.
5. **Ghost text only**: Phase 4 renderer integration uses ghost text rendering only. No completion menu.
6. **`session_start_timestamp` DB migration**: Add to the existing migration in place as NOT NULL DEFAULT 0 (Unix epoch). No new migration version. Users are expected to drop and recreate their database. DEFAULT 0 means the first restore after launch returns all history (empty on a fresh DB) — no special-case NULL handling needed.
7. **vis namespace API**: `vis.waveform(sample)` (not `vis.scene()`). `VisStackResult` is built via `vis.stack().waveform(a)...` chaining; it also has `addScene(scene)`. See PLAN.md completer tables.
8. **Porcelain result types**: All are real TypeScript classes extending `HelpableResult` or `FeatureResult`. Compatible with decorator-based migration. Bindings-injection pattern is unaffected by adding `@describe`/`@param` to class methods.
9. **`ancestors` field in CompletionContext**: Reserved for future features (parameter hints, diagnostics). Not used by any Phase 1–5 completer.
10. **No transition period**: This is a single-pass massive refactor. All namespaces and result types are migrated together. The old `BOUNCE_GLOBALS`, `withHelp`, JSDoc codegen, and `tab-completion.ts` are removed entirely when the new system lands.

## Next Steps

- Begin Phase 1: decorator infrastructure proof of concept with `sn` namespace
- Define application state taxonomy in ARCHITECTURE.md (backup/restore model)
