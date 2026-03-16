# Research: Project Contexts

**Spec:** specs/project-contexts  
**Created:** 2026-03-16  
**Status:** Complete

## Problem Statement

Bounce currently stores `samples`, `features`, and `command_history` in one global SQLite namespace. That makes every REPL session share the same persisted data, which is awkward once users want separate working sets. The new feature introduces explicit projects so every REPL session runs within a current project context, and persisted data is scoped to that project.

## Background

Current persistence lives in `src/electron/database.ts` behind `DatabaseManager`, with startup initialization in `src/electron/main.ts`. The renderer REPL talks to persistence through IPC exposed by `src/electron/preload.ts`, and user-facing globals are assembled in `src/renderer/bounce-api.ts`.

Today:

- `samples` stores audio rows keyed by hash
- `features` stores analysis results linked to samples
- `command_history` stores all REPL commands globally
- REPL globals are user-facing interfaces with `help()` affordances
- custom REPL result objects rely on `toString()` summaries for terminal display
- tab completion uses the global API object plus `BOUNCE_GLOBALS`

The requested change adds:

- a new `projects` table
- project-linked persisted rows for samples, features, and command history
- automatic creation of a `default` project on first launch
- persisted current-project selection across app restarts
- a new top-level `proj` REPL namespace with `current()`, `list()`, `load(name)`, and `rm(name)`

## Related Work / Prior Art

### Existing SQLite initialization

`src/electron/database.ts` already uses versioned SQLite migrations tracked by `schema_versions`. That is the right extension point for introducing projects and rebuilding tables because the app already owns schema evolution there.

### Existing persisted session context

`src/electron/settings-store.ts` persists the working directory in `settings.json`. That is the closest existing pattern for persisting the currently selected project across app restarts without inventing another persistence mechanism.

### Existing REPL API conventions

`src/renderer/bounce-api.ts`, `src/renderer/bounce-result.ts`, and `src/renderer/repl-evaluator.ts` establish the conventions this feature must follow:

- every top-level namespace should expose `help()`
- method-level help is attached where practical via `Object.assign(fn, { help })`
- custom REPL objects print useful summaries instead of raw objects
- tab completion requires the global to exist in both the returned API object and `BOUNCE_GLOBALS`

## FluCoMa Algorithm Details

Not directly applicable. This feature changes data organization and REPL ergonomics, not analysis algorithms.

## Technical Constraints

- SQLite is managed through `better-sqlite3` in the Electron main process.
- The app is experimental, so existing data may be discarded during the migration.
- Project scoping must not break derived-sample provenance tables or foreign-key integrity.
- Project selection must be available before history is loaded so the correct command history is shown at startup.
- REPL-facing changes must preserve the existing Bounce convention: `help()` on exposed surfaces, useful terminal summaries, and tab completion.

## Audio Processing Considerations

The project feature should not change audio processing behavior. Audio buffers, feature extraction, and playback remain unchanged, but persisted lookup/insertion paths must always include the active project context so samples and features do not leak across projects.

One coupled data-model constraint is important: if sample hashes and feature hashes should be reusable in more than one project, uniqueness and foreign keys must become project-scoped rather than globally scoped. Any provenance table that references samples or features will need the same project key to preserve integrity.

## Terminal UI Considerations

This feature adds a new top-level REPL namespace:

- `proj.help()`
- `proj.current()`
- `proj.list()`
- `proj.load(name)`
- `proj.rm(name)`

Because this is user-facing REPL surface area:

- `proj` must provide `help()`
- any custom return type used by `proj.current()`, `proj.list()`, or `proj.load()` must print a concise terminal summary
- `proj` methods must appear in tab completion
- tests should explicitly cover `help()` output and direct-display behavior for any new project result objects

`proj.list()` should render a table-like summary rather than raw JSON. Baseline columns should be:

- project name
- sample count
- feature count
- created timestamp
- current-project marker

## Cross-Platform Considerations

The change is platform-agnostic at the schema and REPL layers. The only persistence detail to watch is that current-project selection should be stored through the existing Electron user-data settings flow so macOS, Linux, and Windows all use the same app-managed path conventions.

## Open Questions

- None blocking for the spec draft. The user confirmed that the current project should persist across app restarts.

## Research Findings

1. **Schema work belongs in `src/electron/database.ts`.** Bounce already has migration helpers and table rebuild patterns there, including SQLite-safe repair/rebuild logic.

2. **Project selection should persist through `settings-store.ts`.** That matches the existing persisted `cwd` model and avoids mixing UI/session preferences into the relational schema.

3. **The startup path must bootstrap a project before loading history.** On first launch, Bounce should create `default`, persist it as current, and then all command-history reads/writes should be scoped to that project.

4. **Project scoping touches more than the three requested tables.** Adding `project_id` to `samples`, `features`, and `command_history` is necessary, but any table that references project-scoped sample or feature keys will also need a project discriminator or updated foreign keys.

5. **The REPL API can follow existing namespace conventions.** A `proj` namespace can be added alongside `sn` and `fs`, with method-level help and completion support by updating the returned API object, typings, and `BOUNCE_GLOBALS`.

6. **`proj.rm(name)` needs a fallback rule.** If the active project is removed, Bounce should immediately switch to a valid current project. The safest behavior is to ensure `default` exists and becomes current whenever removal would otherwise leave no active project.

## Next Steps

For the PLAN phase:

1. Define the `projects` table and project-scoped key strategy.
2. Decide which existing tables must gain `project_id` for integrity, not just for product scope.
3. Design the `proj` namespace return types and terminal summaries.
4. Define startup, load, and remove flows, including automatic `default` bootstrapping and persisted current-project selection.
5. Identify unit and REPL/e2e coverage for schema reset, project scoping, and new REPL affordances.
