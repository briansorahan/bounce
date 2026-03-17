# Research: Persist REPL Runtime Environment

**Spec:** specs/runtime-persistence  
**Created:** 2026-03-17  
**Status:** Complete

## Problem Statement

When a user closes Bounce and reopens it (or switches projects and returns), all variables and
functions they defined in the REPL are gone. Only the command history survives. This means users
must re-run their setup — potentially slow or stateful operations — every time they return to a
project.

The goal is: when a user loads a project, any variables and functions they previously defined in
that project's REPL session are automatically restored and ready to use.

## Background

The Bounce REPL is a TypeScript evaluator (`ReplEvaluator` in `src/renderer/repl-evaluator.ts`)
backed by a `Map<string, unknown>` called `scopeVars`. Every `const`/`let`/`var` declaration and
`function` declaration the user types is captured into this map. The map is in-memory only and is
reset when the app restarts or when a project is switched.

Projects already scope samples, features, and command history to SQLite. There is no corresponding
persistence for `scopeVars`.

## Related Work / Prior Art

- **Jupyter notebooks** persist kernel state by checkpointing cell outputs to `.ipynb` JSON files.
  Cells are re-executed on restart when the kernel is fresh, but outputs (which may be expensive)
  are cached in the notebook file itself.
- **IPython `%store` magic** lets users selectively persist specific variables across sessions to
  a pickle file. Restore requires `%store -r`.
- **Node.js REPL `.save`/`.load`** saves/loads REPL session history (commands only, not values).
- **SuperCollider interpreter** does not persist variables; users save `.scd` scripts and re-run them.

None of these are a perfect model. The Bounce approach should be automatic (no manual `%store`
command needed) and project-scoped.

## FluCoMa Algorithm Details

Not applicable to this feature.

## Technical Constraints

### The ReplEvaluator today

- `src/renderer/repl-evaluator.ts` — `ReplEvaluator` class (line 518)
- `scopeVars: Map<string, unknown>` — in-memory variable store (line 519)
- Variables captured via an **epilogue** appended to every evaluated snippet (lines 570–575)
- Function declarations captured separately via `getTopLevelFunctionDeclNames()` (line 255)
- Reserved names (`sn`, `env`, `vis`, etc.) cannot be assigned by users (line 431)

### What can live in scopeVars

| Category | Examples | Serializable? |
|---|---|---|
| JSON primitives | `42`, `"hello"`, `true`, `null` | ✅ trivially |
| Arrays / plain objects | `[1,2,3]`, `{rate: 44100}` | ✅ via JSON |
| User functions | `function f() {...}`, `async function g() {...}` | ⚠️ source code only |
| Arrow functions (via var) | `const double = x => x*2` | ⚠️ source code only |
| `Sample` objects | returned by `sn.read()` | ⚠️ reconstructible from DB hash |
| Feature analysis results | returned by `sample.onsets()`, `sample.nmf()` | ⚠️ reconstructible from DB hash |
| `VisScene`, `VisStack` | returned by `vis.*` | ❌ ephemeral UI state |
| Thenable wrappers | `SamplePromise`, `OnsetFeaturePromise` | ❌ ephemeral |

### Project storage today

- SQLite at `<userData>/bounce.db` (overridable via `BOUNCE_USER_DATA_PATH`)
- Schema: `projects`, `samples`, `features`, `command_history`, `samples_features`
- All tables are project-scoped with `project_id FK → projects.id ON DELETE CASCADE`
- Current migration count: 005 (`migrate005_projects`)
- New data requires a **migration 006**

### IPC today (main ↔ renderer)

- `save-command` / `get-command-history` — save and restore command history
- `load-project` — switches active project, clears renderer state
- `get-current-project`, `list-projects`, `remove-project` — project metadata
- Bridge exposed via `window.electron` (preload.ts)

There are **no existing IPC channels** for reading or writing REPL scope data.

## Audio Processing Considerations

Not applicable. Serialized scope values are lightweight metadata; audio blobs remain in the
`samples` table and are never duplicated.

## Terminal UI Considerations

On project load, the terminal should print a brief notice:

```
Restored 4 variables: config, normalize, samp (Sample), features (OnsetFeature)
```

or, if nothing was restored:

```
(no saved scope)
```

The `env.vars()` command already lists live scope entries and should continue to work unchanged
after restore. No new REPL commands are strictly required; this feature is transparent/automatic.

`proj.load(name)` already dispatches a `bounce:project-changed` event. The renderer's project-load
handler is the correct hook to trigger scope restoration.

## Cross-Platform Considerations

SQLite is cross-platform. No platform-specific code is needed. The migration runner pattern used
in `DatabaseManager` handles schema upgrades on all platforms.

## Open Questions

1. **What to do with un-serializable values (Sample, VisScene, etc.)?**
   Options:
   - (a) Silently skip them and warn the user at restore time
   - (b) Store a "reconstruction stub" and lazily rebuild on first access
   - (c) Store the source command that created them and replay on load

   Option (a) is simplest and safest for the MVP. Options (b) and (c) can be future work.

2. **When should scope be saved?**
   Options:
   - (a) After every successful command evaluation (incremental, but chatty)
   - (b) On project switch / `proj.load()` (batch, but misses app-crash recovery)
   - (c) Periodically (polling, complex)
   - (d) On app `before-quit` + project switch (covers both normal exits and switches)

   Option (d) is the most pragmatic for MVP.

3. **Function source: TypeScript or transpiled JS?**
   The renderer transpiles TypeScript before evaluation (`window.electron.transpileTypeScript`).
   Storing the original TypeScript source is more readable and round-trips cleanly through the
   existing evaluator pipeline.

4. **Scope isolation across project switches**
   When `proj.load("drums")` is called, the old project's scope should be saved first. The new
   project's scope should then be loaded before the `bounce:project-changed` event fires.

5. **Conflict: restored variable vs Bounce global**
   The `checkReservedNames()` guard prevents users from declaring Bounce globals. Restored
   variables must also be validated against the reserved-names list before injection to prevent
   stale data from overwriting built-ins.

## Research Findings

- **No existing serialization** of scopeVars exists. Command history is persisted but values are
  not.
- **Functions ARE recoverable**: TypeScript source → transpile → `new AsyncFunction(...)` is the
  existing execution path. Storing source and re-evaluating is exactly how the evaluator works.
- **Sample and Feature objects ARE reconstructible** from the DB: both have a `hash` field and a
  static factory pattern (`sn.read()`, `sample.onsets()`). However, reconstruction requires
  async Bounce API calls and is out of scope for MVP.
- **`command_history` already exists** and contains a full audit trail per project. It could serve
  as a future "replay" restore path for Bounce objects.
- **Migration 006** is the correct mechanism for adding a new `repl_env` table. The pattern is
  well-established in `src/electron/database.ts`.
- **`proj.load()` handler** in `src/renderer/bounce-api.ts` is the natural trigger for save-before-
  switch and load-after-switch.
- **`app.ts`** already calls `loadHistoryFromStorage()` on startup and on `bounce:project-changed`.
  A parallel `loadScopeFromStorage()` call fits the same pattern.

## Next Steps

1. Plan a `repl_env` database table (migration 006)
2. Plan IPC channels: `save-repl-env` and `get-repl-env`
3. Plan serialization strategy: JSON for primitives/objects, TypeScript source for functions,
   skip or stub for complex objects (Sample, Feature, Vis)
4. Plan restore flow: deserialize → validate names → inject into `ReplEvaluator.scopeVars`
5. Plan terminal notice printed after restore
6. Define testing strategy: unit tests for serialize/deserialize round-trip; Playwright test for
   project-switch scope persistence
