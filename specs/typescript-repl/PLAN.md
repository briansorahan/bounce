# Plan: TypeScript REPL

**Spec:** specs/typescript-repl  
**Created:** 2026-03-07  
**Status:** In Progress

## Context

The current Bounce REPL in `src/renderer/app.ts` has two evaluation paths: 18 hard-coded built-in commands parsed by regex dispatch, and a JavaScript fallback via `audioManager.evaluate()` which wraps user input in an `AsyncFunction`. There is no TypeScript support, no multi-line input, and the API surface is implicit.

This plan replaces both paths with a single **TypeScript REPL**: the user types TypeScript (single or multi-line), it is transpiled via `typescript.transpileModule()` (exposed through the Electron preload bridge), and executed in the renderer using `new AsyncFunction` with a persistent scope object. The 18 built-in commands are retired and re-implemented as typed global functions available directly in the REPL.

## Approach Summary

1. **New `ReplEvaluator` class** (`src/renderer/repl-evaluator.ts`): holds a persistent `scopeVars` map, calls `window.electron.transpileTypeScript()` (exposed via the preload bridge) to transpile TS → JS, then executes with `new AsyncFunction` using a scope inject/extract pattern for cross-eval variable persistence.

2. **New `BounceApi` class** (`src/renderer/bounce-api.ts`): constructs all typed global functions by closing over the existing `audioManager`, `visualizationManager`, `terminal`, and `window.electronAPI`. Each function maps 1:1 to a retired built-in command.

3. **New type declaration file** (`src/renderer/bounce-globals.d.ts`): declares all globals for REPL users and for use in the `tsconfig` for REPL-evaluated code.

4. **Refactor `app.ts`**:
   - Remove `handleBuiltInCommand` and all 18 individual handler methods.
   - Remove `audioManager.evaluate()` call.
   - Replace `executeCommand` body with `replEvaluator.evaluate(input)`.
   - Add multi-line buffer state: `inputLines: string[]`, continuation prompt `... `.
   - Auto-detect completeness via `replEvaluator.isComplete()` on Enter.

5. **Update `preload.ts`**: expose `transpileTypeScript(source)` via `contextBridge` — the preload runs in a Node.js context and can call `typescript.transpileModule()` directly.

6. **Move `typescript` from devDependency to dependency** so it is available in the packaged Electron app (loaded by the preload script).

## Architecture Changes

### New files

| File | Purpose |
|------|---------|
| `src/renderer/repl-evaluator.ts` | Transpile (via preload) + execute TypeScript with persistent scope |
| `src/renderer/bounce-api.ts` | Factory that builds the typed global functions |
| `src/renderer/bounce-globals.d.ts` | Type declarations for REPL globals |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/app.ts` | Remove built-in dispatch; wire in `ReplEvaluator`; add multi-line state |
| `src/renderer/audio-context.ts` | Remove `evaluate()` method (replaced by `ReplEvaluator`) |
| `src/electron/preload.ts` | Add `transpileTypeScript(source)` to `contextBridge` |
| `package.json` | Move `typescript` to `dependencies` |

### Unchanged

- `src/electron/` — all IPC handlers remain unchanged
- `native/` — no C++ changes
- `src/renderer/terminal.ts` — no changes
- `src/renderer/visualization-manager.ts` — no changes

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/renderer/repl-evaluator.ts` (new)

```typescript
// Responsibilities:
// - Hold a persistent scopeVars: Map<string, unknown> for cross-eval variable persistence
// - Accept a sandbox object (Bounce API globals) at construction
// - checkReservedNames(js): throw if any top-level declaration shadows a Bounce global
// - promoteDeclarations(js): post-process transpiled JS to replace top-level const/let with var
// - evaluate(source): window.electron.transpileTypeScript(source) → checkReservedNames
//     → promoteDeclarations → build AsyncFunction with scope inject/extract → await result
// - isComplete(source): bracket/brace/paren balance check — returns true if safe to submit
// - Return the awaited result (undefined for side-effect-only calls)

export class ReplEvaluator {
  private scopeVars = new Map<string, unknown>();

  constructor(private bounceApi: Record<string, unknown>) {}

  async evaluate(source: string): Promise<unknown> {
    const js = await window.electron.transpileTypeScript(source);
    checkReservedNames(js);
    const promoted = promoteDeclarations(js);
    const declaredNames = getTopLevelVarNames(promoted);

    // Inject previously seen scope vars + all newly declared names
    const allNames = new Set([...this.scopeVars.keys(), ...declaredNames]);
    const bounceNames = Object.keys(this.bounceApi);

    const prelude = [...allNames]
      .map(n => `var ${n} = __scope__.has("${n}") ? __scope__.get("${n}") : undefined;`)
      .join('\n');
    const epilogue = [...allNames]
      .map(n => `try { __scope__.set("${n}", ${n}); } catch(e) {}`)
      .join('\n');

    const body = `${prelude}\n${promoted}\n${epilogue}`;
    const fn = new (Object.getPrototypeOf(async function(){}).constructor)(
      '__scope__', ...bounceNames, body
    );
    const result = await fn(this.scopeVars, ...Object.values(this.bounceApi));

    // Sync new names into scopeVars (epilogue already wrote to the Map)
    declaredNames.forEach(n => { /* already captured via epilogue */ });

    return result;
  }

  isComplete(source: string): boolean { ... }  // see completeness detection below
}
```

**Key decisions:**
- `window.electron.transpileTypeScript(source)` is called in the renderer; transpilation happens synchronously in the preload (Node.js context) and is returned to the renderer
- The persistent `scopeVars: Map<string, unknown>` replaces `vm.createContext`
- `clear()` only clears the terminal screen; `scopeVars` is NOT reset
- Uncaught errors bubble up from the `AsyncFunction` to `evaluate()` and are caught by `executeCommand`

#### Why `vm.createContext` is not used

The Electron BrowserWindow for Bounce has `contextIsolation: true` and `nodeIntegration: false`. The renderer is a sandboxed browser context — Node.js built-ins like `vm` and `require` are not available there. The existing `audioManager.evaluate()` already uses `new AsyncFunction` (a browser API) for the same reason.

Transpilation is handled by the preload script (`src/electron/preload.ts`), which runs in a privileged Node.js context and exposes `transpileTypeScript` via Electron's `contextBridge`.

#### `src/electron/preload.ts` addition

```typescript
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';

// Added to the existing contextBridge.exposeInMainWorld("electron", { ... }) object:
transpileTypeScript: (source: string): string => {
  return transpileModule(source, {
    compilerOptions: {
      target: ScriptTarget.ESNext,
      module: ModuleKind.CommonJS,
      esModuleInterop: true,
    }
  }).outputText;
},
```

`typescript` is loaded lazily on first call to avoid slowing app startup.

#### Reserved name collision detection

`checkReservedNames(js)` scans the transpiled output for top-level variable/function/class declarations and throws a descriptive error if any declared name matches a Bounce global.

```typescript
const BOUNCE_GLOBALS = new Set([
  'display', 'play', 'stop', 'analyze', 'analyzeNmf', 'slice', 'sep', 'nx',
  'list', 'playSlice', 'playComponent', 'visualizeNmf', 'visualizeNx',
  'onsetSlice', 'nmf', 'clearDebug', 'debug', 'help', 'clear',
]);

// Error message example:
// Error: 'display' is a Bounce built-in and cannot be redefined.
// Use a different variable name.
```

**What is checked:** top-level `var`/`const`/`let` declarations and `function`/`class` declarations at depth 0 — the same set of names that `promoteDeclarations` would promote. Destructuring patterns (e.g. `const { display } = obj`) are also checked.

**Scope:** only top-level declarations. Shadowing a global inside a function body is intentionally allowed (it's scoped and doesn't affect the REPL context).

**Ordering:** runs *after* transpilation (type annotations already stripped) and *before* `promoteDeclarations` and evaluation, so the user gets a clear error with zero side effects.

**Unit tests to add:**
```
const display = 1         → Error: 'display' is a Bounce built-in...  ✅
function play() {}        → Error: 'play' is a Bounce built-in...     ✅
class stop {}             → Error: 'stop' is a Bounce built-in...     ✅
const { list } = obj      → Error: 'list' is a Bounce built-in...     ✅
function inner() { const display = 1 }  → no error (not top-level)   ✅
const myDisplay = 1       → no error                                  ✅
```

#### Variable persistence across evaluations

`const` and `let` declarations in an `AsyncFunction` body are local to that invocation and are lost when it returns. To persist variables across evals, `ReplEvaluator` maintains `scopeVars: Map<string, unknown>` and uses an inject/extract pattern:

**Before eval** — re-declare all previously-seen vars:
```javascript
var x = __scope__.has("x") ? __scope__.get("x") : undefined;
var arr = __scope__.has("arr") ? __scope__.get("arr") : undefined;
// ...
```

**After user code** — write all vars back to the map:
```javascript
try { __scope__.set("x", x); } catch(e) {}
try { __scope__.set("arr", arr); } catch(e) {}
// ...
```

Because `var` is hoisted to the `AsyncFunction` scope, the epilogue can read values even if the user's code reassigned them (e.g. `x += 10`).

```
Eval 1:  const x = 42   → promoted: var x = 42
                         → epilogue writes scopeVars.set("x", 42)

Eval 2:  x + 1           → prelude: var x = scopeVars.get("x")  [= 42]
                         → result: 43  ✅
```

**Semantic change:** `var` hoisting and absence of TDZ are harmless in a REPL — hoisting only applies within a single eval. Redeclaration (`var x` again in a later eval) is silently allowed — desirable since users can re-type a declaration to update a variable.

**Unit tests to add:**
```
const x = 42 in eval 1 → x accessible in eval 2   ✅
let arr = [] in eval 1  → arr.push(1) works in eval 2  ✅
const inside a function body → NOT promoted, stays const  ✅
```

#### Multi-line completeness detection

`isComplete(source)` implements bracket/brace/paren balance counting with string and comment awareness. It is called on the accumulated buffer each time the user presses `Enter`:

```
isComplete(source):
  depth = 0           // net open brackets/braces/parens
  inString = null     // null | '"' | "'" | '`'
  inLineComment = false
  inBlockComment = false

  scan each character:
    - skip characters inside line comments (// ... \n)
    - skip characters inside block comments (/* ... */)
    - track string delimiters (", ', `), respecting escape sequences
    - inside strings: skip all bracket characters
    - outside strings/comments:
        {, (, [ → depth++
        }, ), ] → depth--

  return depth === 0
```

**Edge cases handled:**
- Escaped quotes inside strings (`\"`, `\'`)
- Template literals with nested `${}` expressions — the `{` inside `${}` increases depth; the matching `}` decreases it, keeping balance correct
- Line comments eat `//` to end of line, preventing `//` from being mistaken for division
- Block comments eat `/* ... */`, preventing interior brackets from affecting depth

**Behaviour in `handleInput()` on Enter:**
```
if isComplete(accumulated + currentLine):
  submit for evaluation
else:
  append currentLine to inputLines
  print "... " continuation prompt
  clear commandBuffer
```

The user can always submit an incomplete block (e.g. to get a syntax error from the transpiler) by pressing `Ctrl+D` or a similar "force submit" key — or simply close the brackets first. We do not need a force-submit escape hatch for v1; the standard workflow is to type balanced blocks.

#### `src/renderer/bounce-api.ts` (new)

Exports a `buildBounceApi(deps)` factory. `deps` carries:
- `terminal: BounceTerminal`
- `audioManager: AudioManager`
- `visualizationManager: VisualizationManager`
- `electronAPI: ElectronAPI` (from `window.electronAPI`)

Returns an object with all global functions:

| Global | Replaces built-in | IPC / side-effects |
|--------|-------------------|--------------------|
| `display(fileOrHash)` | `display` | `read-audio-file` IPC → `audioManager.setCurrentAudio()` |
| `play(options?)` | `play` | `audioManager.playAudio()` |
| `stop()` | `stop` | `audioManager.stopAudio()` |
| `analyze(options?)` | `analyze` | `analyze-onset-slice` IPC |
| `analyzeNmf(options?)` | `analyze-nmf` | `analyze-buf-nmf` IPC → `store-feature` IPC |
| `slice(options?)` | `slice` | `create-slice-samples` IPC |
| `sep(options?)` | `sep` | `sep` IPC |
| `nx(options?)` | `nx` | `nx` IPC |
| `list()` | `list` | `list-samples` IPC |
| `playSlice(index?)` | `play-slice` | `audioManager.playAudio()` with slice offset |
| `playComponent(index?)` | `play-component` | `audioManager.playAudio()` with component data |
| `visualizeNmf(options?)` | `visualize-nmf` | `visualize-nmf` IPC → `visualizationManager` |
| `visualizeNx(options?)` | `visualize-nx` | `visualize-nx` IPC → `visualizationManager` |
| `onsetSlice(options?)` | `onset-slice` (visual) | `visualizationManager.addVisualization()` |
| `nmf(options?)` | `nmf` (visual) | `visualizationManager.addVisualization()` |
| `clearDebug()` | `clear-debug` | `clear-debug-logs` IPC |
| `debug(enabled)` | `debug` | `debug-log` IPC |
| `help()` | `help` | Prints global function signatures to terminal |
| `clear()` | `clear` | `terminal.clear()` (context NOT reset) |

#### `src/renderer/bounce-globals.d.ts` (new)

Declares all global functions as module-level declarations so:
1. TypeScript-aware editors can provide hints when writing REPL scripts
2. The REPL `tsconfig` can reference this file

#### `src/renderer/app.ts` (modified)

**Removals:**
- `handleBuiltInCommand()` (lines ~419–502) and its entire switch statement
- All 18 individual `handle*Command()` methods
- The `audioManager.evaluate()` call in `executeCommand` (line ~399)
- Result printing logic tied to old evaluate signature

**Additions:**
- `inputLines: string[]` field — accumulates lines in a multi-line block
- `ReplEvaluator` instantiation (constructed with `buildBounceApi()` result injected as sandbox)
- Modified `handleInput()` Enter handling:
  ```
  accumulated = [...inputLines, commandBuffer].join('\n')
  if replEvaluator.isComplete(accumulated):
    executeCommand(accumulated)
    clear inputLines
  else:
    push commandBuffer to inputLines
    print "... " continuation prompt
    clear commandBuffer
  ```
- Modified `executeCommand()`:
  ```
  result = await replEvaluator.evaluate(input)
  if result !== undefined: terminal.writeln(util.inspect(result))
  ```
- `help()` global now prints generated function signature list

#### `src/renderer/audio-context.ts` (modified)

- Remove `evaluate()` method — fully replaced by `ReplEvaluator`
- Remove `AsyncFunction` wrapper logic

### Terminal UI Changes

| Change | Details |
|--------|---------|
| Multi-line input | Auto-detect: Enter submits if brackets/braces/parens are balanced; shows `... ` continuation prompt if not |
| Result display | Non-`undefined` results printed via `util.inspect()` |
| Error display | Runtime errors printed as `Error: <message>` (same style as today) |
| Transpile errors | Caught before eval; printed as `SyntaxError: <message>` |
| `help()` output | Prints list of global function names + one-line descriptions |

The multi-line buffer uses **bracket/brace/paren balance detection** (`isComplete()`) to decide whether `Enter` submits or continues. String and comment context is tracked to avoid false positives. Shift+Enter is not needed; the user just types naturally and presses Enter.

History (`Ctrl+P`/`Ctrl+N`, `Ctrl+R`) stores the full multi-line block as a single history entry.

### Configuration/Build Changes

**`package.json`:**
- Move `typescript` from `devDependencies` → `dependencies` (needed at runtime in preload)
- No other new packages required

**`src/electron/preload.ts`:**
- Add `transpileTypeScript(source: string): string` to the `contextBridge.exposeInMainWorld` object

**`tsconfig.renderer.json`:**
- Add `src/renderer/bounce-globals.d.ts` to `include` so globals are typed during app build

## Testing Strategy

### Unit Tests

Add to `src/` test suite:

| Test | File |
|------|------|
| `ReplEvaluator` — evaluates a simple TS expression | `src/repl-evaluator.test.ts` |
| `ReplEvaluator` — top-level await works | same |
| `ReplEvaluator` — transpile error is thrown not silenced | same |
| `ReplEvaluator` — variables persist across evaluations | same |
| `ReplEvaluator` — multi-line input (joined with `\n`) evaluates correctly | same |
| `buildBounceApi` — `help()` returns string with all function names | `src/bounce-api.test.ts` |

### E2E Tests

Update existing Playwright tests in `tests/`:

| Test file | Change needed |
|-----------|--------------|
| `commands.spec.ts` | Update command syntax from `display "file.wav"` to `await display("file.wav")` |
| `terminal-ui.spec.ts` | Add multi-line input test (type multi-line block with natural Enter auto-detect) |
| `onset-analysis.spec.ts` | Update to call `analyze()` function syntax |
| `nmf-analysis.spec.ts` | Update to call `analyzeNmf()` function syntax |
| `nmf-separation.spec.ts` | Update to call `sep()` function syntax |
| `nx-basic.spec.ts` / `nx-cross-synthesis.spec.ts` | Update to call `nx()` function syntax |
| `playback.spec.ts` | Update to call `play()` / `stop()` function syntax |
| `audio-formats.spec.ts` | Update to call `display()` function syntax |

### Manual Testing

- Verify `display("file.wav")` loads audio and visualizes waveform
- Verify `await analyze()` returns onset results and prints them
- Verify multi-line: type `if (true) {` + Enter (auto-continuation), then `}` + Enter — verifies auto-detect
- Verify multi-line: define a `const x = 42` then `x` evaluates to `42`
- Verify `clear()` clears screen but a variable defined before it is still accessible
- Verify `help()` prints all available functions
- Verify runtime error shows `Error: ...` in terminal
- Verify TypeScript-specific syntax (`const x: number = 1`) works
- Verify `async/await` at top level works

## Success Criteria

1. User can type TypeScript (including type annotations) at the REPL prompt and have it evaluated
2. Top-level `await` works without any special syntax
3. `Enter` on an incomplete block shows `... ` continuation; balanced block submits automatically
4. Variables defined in one evaluation are accessible in the next
5. `clear()` clears the terminal but does not reset the session context
6. All 18 built-in commands are available as typed globals and behave identically to the retired built-ins
7. All existing Playwright e2e tests pass (with syntax updated to function call style)
8. `help()` lists all available globals with descriptions

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `typescript.transpileModule` slow in preload on first call | Low | Lazy-load `typescript` module; typical transpile is ~5ms after load |
| `contextBridge` serialisation of transpiled JS string fails | Very Low | Strings are always serialisable; no concern |
| `AsyncFunction` scope inject/extract breaks on complex destructuring | Medium | Unit-test thoroughly; scope only tracks simple named vars, not destructured patterns |
| `typescript` as runtime dep increases bundle size | Medium | ~20MB; acceptable for a desktop Electron app |
| Multi-line history entry too verbose in `Ctrl+R` | Low | Store as-is; display truncated in search results |
| Behavior regression in one of the 18 migrated built-ins | Medium | Each built-in gets an e2e test; run full suite before merging |
| `app.ts` refactor introduces subtle input handling bugs | Medium | Keep multi-line change minimal; don't touch Emacs keybindings logic |

## Implementation Order

1. **`src/electron/preload.ts`**: Add `transpileTypeScript` to `contextBridge`; verify it works end-to-end before other work
2. **`src/renderer/repl-evaluator.ts`**: Implement `ReplEvaluator` with unit tests
3. **`src/renderer/bounce-globals.d.ts`**: Write type declarations for all globals
4. **`src/renderer/bounce-api.ts`**: Implement `buildBounceApi()`, migrating each built-in one at a time
5. **`src/renderer/audio-context.ts`**: Remove `evaluate()` method
6. **`src/renderer/app.ts`**: Wire in `ReplEvaluator` + `buildBounceApi`; remove old dispatch; add multi-line state
7. **Update Playwright e2e tests**: Update command syntax in all affected spec files
8. **`package.json`**: Promote `typescript` to `dependencies`; run `npm install`
9. **Full test pass**: `npm run lint && npm run test && npm run test:e2e`

## Estimated Scope

**Large** — touches ~2500 lines of `app.ts`, introduces 3 new files, migrates 18 commands, and updates 8+ e2e test files.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (no backwards compat — command syntax changes from `display "file"` to `await display("file")`)
- [x] All sections agree on the data model / schema approach (N/A — no schema changes)
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
