# Plan: Persist REPL Runtime Environment

**Spec:** specs/runtime-persistence  
**Created:** 2026-03-17  
**Status:** In Progress

## Context

The REPL evaluator holds user variables and functions in an in-memory `Map<string, unknown>`
(`scopeVars`). These are lost on restart or project switch. Projects already scope samples,
features, and command history to SQLite; this plan extends that to REPL scope.

Key constraints from research:
- JSON-serializable values (primitives, plain objects, arrays) are trivially storable.
- User-defined functions can be stored as TypeScript source and re-evaluated on load.
- Bounce API objects (`Sample`, `OnsetFeature`, etc.) are **out of scope for MVP** — they will
  be silently skipped with a terminal notice, not an error.
- A new SQLite migration (006) is required.
- Save happens on project switch and on app quit; load happens on project load.

## Approach Summary

Add a per-project `repl_env` table in SQLite. After every successful command evaluation, upsert
the current scope snapshot. On project load, read the snapshot and inject it into the
`ReplEvaluator` before the terminal announces the project is ready.

Serialization rules:
- **`'json'` kind**: `number | string | boolean | null | Array | plain object` → `JSON.stringify`
- **`'function'` kind**: user-defined `function` or `async function` → store TypeScript source,
  re-evaluated at restore time via the normal evaluator pipeline
- **Unsupported**: `Sample`, `VisScene`, feature objects, thenables → skip silently, log in the
  restore notice

## Architecture Changes

No new top-level components. Changes span:
- Database layer (migration + new CRUD methods on `DatabaseManager`)
- IPC layer (two new channels + preload bridge entries)
- Renderer API (`ReplEvaluator`: new serialize/restore methods; `bounce-api.ts`: hook into
  `proj.load`; `app.ts`: save on quit, load on startup)

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/electron/database.ts`

1. Add `ReplEnvRecord` interface:
   ```ts
   export interface ReplEnvRecord {
     project_id: number;
     name: string;
     kind: 'json' | 'function';
     value: string;  // JSON string or TS source
     created_at: string;
   }
   ```
2. Add migration `migrate006_repl_env()`:
   ```sql
   CREATE TABLE repl_env (
     project_id INTEGER NOT NULL,
     name       TEXT NOT NULL,
     kind       TEXT NOT NULL CHECK(kind IN ('json','function')),
     value      TEXT NOT NULL,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (project_id, name),
     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
   );
   CREATE INDEX idx_repl_env_project ON repl_env(project_id);
   ```
3. Add methods:
   - `saveReplEnv(entries: Array<{name, kind, value}>): void`
     — Wraps upsert in a single transaction (DELETE existing + INSERT all).
   - `getReplEnv(): Array<ReplEnvRecord>`
     — Returns all entries for the current project.

#### `src/electron/main.ts`

Add two IPC handlers:
- `save-repl-env`: accepts `Array<{name, kind, value}>`, calls `dbManager.saveReplEnv(...)`
- `get-repl-env`: returns `dbManager.getReplEnv()`

#### `src/electron/preload.ts`

Add to the `window.electron` bridge:
- `saveReplEnv(entries): Promise<void>`
- `getReplEnv(): Promise<ReplEnvRecord[]>`

#### `src/electron/types.d.ts`

Add `ReplEnvRecord` to the shared type exports and extend the `window.electron` interface.

#### `src/renderer/repl-evaluator.ts`

Add two new methods to `ReplEvaluator`:

1. **`serializeScope(): Array<{name, kind, value}>`**
   - Iterates `scopeVars`
   - For each entry:
     - If `typeof value === 'function'`: skip (functions are captured via function-declaration
       source, handled separately — see below)
     - If value is JSON-serializable (try/catch `JSON.stringify`): kind=`'json'`, value=JSON
     - Otherwise: skip
   - For function declarations: stored source comes from a new `functionSources` map (see below)

2. **`async restoreScope(entries: Array<{name, kind, value}>): Promise<string[]>`**
   - Returns list of restored variable names
   - For `kind='json'`: `this.scopeVars.set(name, JSON.parse(value))`
   - For `kind='function'`: call `this.evaluate(value)` — re-executes the function declaration
     source through the normal pipeline so it is hoisted into scope correctly
   - Skips entries whose name is in `BOUNCE_GLOBALS` (safety guard)

3. **`functionSources` map (new private field)**:
   A `Map<string, string>` that records the original TypeScript source for each function
   declaration the user typed. Populated in `evaluate()` alongside the normal epilogue.
   Used by `serializeScope()` to emit `kind='function'` entries.

4. **`clearScope(): void`** (new method):
   - Clears both `scopeVars` and `functionSources`
   - Called during project switch, before the new project's scope is loaded

#### `src/renderer/bounce-api.ts`

In `proj.load(name)` (currently around line 1875–1930), the project switch sequence must be:

1. Serialize and save current scope to DB for the **outgoing** project
2. Call the existing IPC to switch the active project (`window.electron.loadProject(name)`)
3. Clear `scopeVars` and `functionSources` via `evaluator.clearScope()`
4. Load and restore the **incoming** project's scope

```ts
// 1. Save outgoing scope
const scopeEntries = evaluator.serializeScope();
await window.electron.saveReplEnv(scopeEntries);  // no-op if empty

// 2. Switch project (existing)
const project = await window.electron.loadProject(name);

// 3. Clear current scope
evaluator.clearScope();

// 4. Restore incoming scope (handled by bounce:project-changed handler in app.ts)
document.dispatchEvent(new CustomEvent("bounce:project-changed", { detail: project }));
```

Step 4 is handled by the `bounce:project-changed` listener described below rather than inline,
to keep the same code path for startup and project switch.

#### `src/renderer/app.ts`

1. **On startup / `bounce:project-changed`**: after `loadHistoryFromStorage()`, call
   `loadScopeFromStorage()` which:
   - Calls `window.electron.getReplEnv()`
   - Calls `evaluator.restoreScope(entries)`
   - Prints restore notice to terminal (see UI section below)

2. **On `before-quit`** (Electron app quit): call `window.electron.saveReplEnv(evaluator.serializeScope())`.
   Use the existing `window.addEventListener('beforeunload', ...)` or add an
   `ipcRenderer.on('app-will-quit', ...)` handler — whichever pattern is already used.

### Terminal UI Changes

After `loadScopeFromStorage()` completes, print a summary line (only if ≥1 entry restored):

```
Restored 3 variables: config (object), normalize (function), x (number)
```

If some entries were in the DB but skipped (e.g., future migration of old incompatible records),
that is silently dropped (not surfaced to the user).

The `env.vars()` output is unchanged; restored variables appear in it naturally.

### REPL Interface Contract

This feature is transparent — it does not add new REPL-facing commands. However:

- **`env.vars()`** must continue listing all restored variables correctly after restore. ✅ No
  change needed (restored values live in `scopeVars`, which `env.vars()` already reads).
- **`env.inspect(name)`** must work on restored values. ✅ Same — no change.
- **`proj.load(name)`** now saves scope before switching. The returned object display is
  unchanged.

No new `help()` surface is needed. No new returned REPL types are introduced.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why
  not — no new public API surface added
- [x] Every returned custom REPL type defines a useful terminal summary — no new return types
- [x] The summary highlights workflow-relevant properties — N/A
- [x] Unit tests identified for `help()` output — N/A (no new help surface)
- [x] Unit tests identified for returned-object display behavior — N/A (no new return types)

### Configuration/Build Changes

None — no new packages, no C++ rebuild required, no tsconfig changes.

## Testing Strategy

### Unit Tests

**File: `src/repl-evaluator.test.ts`** (or a new `src/repl-env.test.ts`)

1. `serializeScope` emits `kind='json'` for primitives, arrays, plain objects
2. `serializeScope` emits `kind='function'` for function declarations
3. `serializeScope` skips Bounce global names
4. `serializeScope` skips un-JSON-serializable values (e.g., `Symbol`, circular refs)
5. `restoreScope` re-populates `scopeVars` for `kind='json'` entries
6. `restoreScope` re-evaluates source for `kind='function'` entries and function is callable
7. Round-trip: define vars/functions → serialize → create fresh evaluator → restore → values accessible
8. `clearScope` empties both `scopeVars` and `functionSources`

Run with: `npx tsx src/repl-evaluator.test.ts` (or `src/repl-env.test.ts`)

### E2E Tests

**File: `tests/runtime-persistence.spec.ts`** (new Playwright test)

1. **Scope survives project switch**:
   - Load project A, define `var x = 42` and `function double(n) { return n*2; }`
   - `proj.load("projectB")` then `proj.load("projectA")`
   - Assert `x` equals `42` and `double(3)` equals `6`

2. **Restore notice appears**:
   - Repeat above, assert terminal output contains `"Restored 2 variables"`

3. **Stale scope is cleared on switch**:
   - Define `var x = 42` in project A
   - Switch to project B (which has no saved scope)
   - Assert `x` is not defined in project B's REPL

4. **Skipped values not errored**:
   - Define a Sample variable, switch projects and back
   - Assert no error is thrown; assert the Sample variable is NOT in scope (with graceful notice)

5. **Scope is project-isolated**:
   - Define `var x = 1` in project A, `var x = 2` in project B
   - Switch to B then back to A, assert `x === 1`

Run via: `./build.sh` (Dockerized Playwright)

### Manual Testing

- Restart the Electron app (full quit) and verify variables are restored on relaunch
- Verify `env.vars()` lists restored variables
- Verify function calls work after restore
- Verify Bounce API objects (Sample) are gracefully absent after restore with an informative notice

## Success Criteria

1. After `proj.load(name)`, all JSON-serializable variables and user-defined functions from the
   previous session of that project are available in the REPL.
2. Un-serializable values (Bounce API objects) are silently skipped without error.
3. A one-line terminal restore notice is printed listing what was restored.
4. `env.vars()` correctly reflects the restored scope.
5. Variables from the previous project are **not present** after switching to a new project.
6. Project A's scope does not bleed into Project B's scope.
6. All unit and E2E tests pass.

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Function source re-evaluation has side effects | Functions are pure declarations — no side effects at definition time |
| Circular references in user objects crash `JSON.stringify` | Wrap in try/catch; skip values that throw |
| Restored variable name conflicts with future Bounce globals | Guard with `BOUNCE_GLOBALS` check before injecting |
| Large scope snapshot slows project switch | DELETE + INSERT in one transaction is fast; cap at e.g. 500 entries if needed |
| User stores sensitive data in variables | Scope data lives in the same local SQLite DB as samples — same security boundary |

## Implementation Order

1. Migration 006 + `DatabaseManager` methods (`saveReplEnv`, `getReplEnv`) + `ReplEnvRecord` type
2. IPC handlers (`save-repl-env`, `get-repl-env`) in `main.ts` + preload bridge entries
3. `ReplEvaluator`: add `functionSources` map + `serializeScope()` + `restoreScope()`
4. Unit tests for serialize/restore round-trip
5. `app.ts`: `loadScopeFromStorage()` called on startup + `bounce:project-changed`
6. `bounce-api.ts`: save scope in `proj.load()` before switching; save on app quit
7. Terminal restore notice
8. Playwright E2E test (`tests/runtime-persistence.spec.ts`)
9. Lint + build + test pass

## Estimated Scope

Medium (6–8 files touched, new DB migration, new IPC channels, new serialization logic)

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements — no breaking changes
- [x] All sections agree on the data model / schema approach — single `repl_env` table, migration 006
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries — N/A (no new API surface)
- [x] Testing strategy names unit and Playwright coverage for REPL help/display behavior — N/A
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
