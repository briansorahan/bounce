# Research: TypeScript REPL

**Spec:** specs/typescript-repl  
**Created:** 2026-03-07  
**Status:** In Progress

## Problem Statement

Bounce currently evaluates arbitrary JavaScript expressions via `audioManager.evaluate()` as a fallback when a typed command doesn't match a built-in. This is functional but limiting:

- Users must write raw JavaScript — no type safety, no IDE-like hints
- The 18 built-in commands are implemented as ad-hoc string-parsed special cases rather than first-class callable functions
- There is no multi-line input support — complex operations require one-liners
- The user-facing API surface is implicit and undocumented at the REPL level

The goal is to replace the current JS evaluator and built-in command dispatch with a **TypeScript REPL**: users type TypeScript expressions/statements (including multi-line blocks), the input is transpiled via `ts-node` in transpile-only mode, and executed with the full Bounce API exposed as typed globals.

## Background

The REPL is the primary interface to Bounce. All audio loading, analysis, visualization, and playback flows through it. Making this interface TypeScript-native would:

- Give users a typed, self-documenting API (globals with known types)
- Enable complex multi-line scripting (loops, conditionals, async/await)
- Eliminate the two-tier dispatch system (built-ins vs. JS eval)
- Make the API surface explicit and testable

## Related Work / Prior Art

- **Node.js REPL (`node:repl`)** — Built-in multi-line REPL with `.editor` mode. Does not natively support TypeScript.
- **ts-node REPL** — `ts-node` provides a TypeScript REPL via `createREPL()`. Uses `transpile-only` mode for speed; no runtime type errors.
- **Deno REPL** — Supports TypeScript natively, but Deno is a separate runtime.
- **IPython / Jupyter** — Rich multi-line REPL model; Shift+Enter for newlines, Enter to run. Good UX model for multi-line input.
- **GitHub Copilot CLI** — Example of a REPL-like interface where structured commands and free-form evaluation coexist.

The most relevant prior art is `ts-node`'s `createContext` + `transpileModule` APIs, which allow transpile-only TypeScript evaluation inside an existing Node.js process without spawning a subprocess.

## FluCoMa Algorithm Details

Not directly applicable to the REPL infrastructure itself. The built-in commands being rewritten as TypeScript functions will continue to call the existing native FluCoMa bindings. The native bindings (`src/index.ts` / `native/`) are not changing.

## Technical Constraints

- Must run inside the **Electron renderer process** (browser-like context with Node.js integration enabled)
- `ts-node` in transpile-only mode should be compatible with Electron's Node.js runtime
- Multi-line input must integrate with the existing xterm.js input handling in `app.ts` (currently readline-like, single-line)
- The built-in commands being retired include audio I/O, FluCoMa analysis, and visualization — their implementations move to TypeScript functions exposed as globals, so all existing IPC calls and side effects must be preserved
- The `vm` module (Node.js) will likely be needed to execute transpiled JS in a sandboxed context with injected globals

## Audio Processing Considerations

No changes to audio processing. The TypeScript globals will wrap the same underlying audio pipeline:
- Web Audio API for playback (`AudioContext`)
- FluCoMa native bindings for analysis (via Electron IPC)
- `audio-decode` / `wav-decoder` for file I/O
- SQLite sample database via IPC for `list`, `display`-by-hash, etc.

## Terminal UI Considerations

**Multi-line input** is the primary UI change:
- **Shift+Enter** inserts a newline (visual `↵` or indented continuation line)
- **Enter** on a complete block submits for evaluation
- The current readline buffer (`inputBuffer`, cursor tracking, Ctrl+A/E/K etc.) will need to be extended to handle multi-line buffers
- Output of evaluated expressions should be pretty-printed (e.g. `util.inspect`) and written to the terminal
- Error output (transpilation errors or runtime exceptions) should be clearly distinguished (e.g. printed in a different style or prefixed with `Error:`)

### Removed: Built-in Command Prompts
The current command-specific output format (e.g. `[analyze] found N onsets`) will be replaced by the return values / side effects of the TypeScript functions.

## Cross-Platform Considerations

- `ts-node` works on macOS, Linux, and Windows
- `vm.Script` / `vm.runInContext` are part of Node.js core — cross-platform
- Multi-line xterm input uses only xterm.js APIs — cross-platform
- No platform-specific code expected in this feature

## Open Questions

1. **`ts-node` in Electron renderer**: Can `ts-node`'s `transpileModule` be called directly in the renderer process, or must transpilation happen in the main process (via IPC)?  
   → Likely renderer-side is fine since Electron renderer has full Node.js access when `nodeIntegration: true`. Needs verification.

2. **`vm` sandbox scope**: Should evaluated code run in a fresh `vm.Context` per session (isolated), or a persistent context that accumulates variable definitions across evaluations (like a real REPL)?  
   → A persistent context is essential for a useful REPL (define a variable, use it in the next expression).

3. **Async support**: Many Bounce operations are async (IPC calls return Promises). How does the REPL handle top-level `await`? Node.js v24 supports top-level await in ESM; `vm` module with `--experimental-vm-modules` can too.  
   → Need to confirm whether top-level `await` works in `vm` context within Electron renderer.

4. **`tsconfig` for REPL**: What `tsconfig` options should apply to REPL code? Likely a relaxed config (no strict null checks forced, `esModuleInterop: true`, `target: ESNext`).

5. **Built-in function signatures**: Need to design the TypeScript API for the globals. Key functions needed (mapping from current built-ins):
   - `display(fileOrHash: string): Promise<void>`
   - `play(options?: PlayOptions): void`
   - `stop(): void`
   - `analyze(options?: AnalyzeOptions): Promise<OnsetResult>`
   - `analyzeNmf(options?: NmfOptions): Promise<NmfResult>`
   - `slice(options?: SliceOptions): Promise<void>`
   - `sep(options?: SepOptions): Promise<void>`
   - `nx(options?: NxOptions): Promise<void>`
   - `visualizeNmf(options?: VisualizeNmfOptions): void`
   - `visualizeNx(options?: VisualizeNxOptions): void`
   - `onsetSlice(options?: OnsetSliceOptions): void`
   - `nmf(options?: NmfVisOptions): void`
   - `list(): Promise<Sample[]>`
   - `help(): void`
   - `clear(): void`
   - `debug(enabled: boolean): void`

6. **Removal of `handleBuiltInCommand`**: The entire dispatch path in `app.ts` (~500 lines) will be removed. We need to ensure no behavior is lost.

## Research Findings

- The existing REPL core (`app.ts`) is large (~2533 lines) and tightly couples input handling, command dispatch, and output rendering. Refactoring multi-line support into it is feasible but will require care.
- `ts-node` provides `transpileModule(source, options)` from `@ts-node/core` or `ts-node` directly — this is a pure transpilation function, no subprocess, usable in-process.
- Node.js `vm.createContext(sandbox)` + `vm.Script` gives a persistent evaluation context where globals can be injected once and persist across evaluations.
- Top-level `await` in `vm` requires wrapping expressions in an async IIFE or using `vm.Module` (experimental). A pragmatic approach: auto-wrap all input in `(async () => { ... })()` and `await` the result before printing.

## Next Steps

- Design the TypeScript global API surface (function names, signatures, return types)
- Design the multi-line input state machine (how to detect "incomplete" vs "complete" input)
- Plan the refactor of `app.ts` command dispatch
- Decide on `vm` context lifecycle (one context per session, never reset, or resettable via `clear()`)
- Plan migration of each of the 18 built-in commands to TypeScript functions
