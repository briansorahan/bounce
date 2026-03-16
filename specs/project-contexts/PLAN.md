# Plan: Project Contexts

**Spec:** specs/project-contexts  
**Created:** 2026-03-16  
**Status:** In Progress

## Context

Bounce currently persists all samples, features, and command history globally. The new goal is to scope each REPL session to a current project, persist that project selection across app restarts, auto-create `default` when no projects exist, and add a user-facing `proj` namespace for switching and managing projects.

The user explicitly allowed destructive schema reset because this data model is not yet in production. That means the migration can rebuild affected tables instead of preserving existing rows.

## Approach Summary

Introduce a first-class `projects` table plus project-scoped foreign keys for persisted audio data and command history. Update startup so Bounce guarantees a valid current project before renderer history loads, and expose project management through a new `proj` REPL namespace.

The implementation should prefer explicit project-scoped uniqueness over global uniqueness so the same sample or feature hashes can exist in more than one project without collision.

## Architecture Changes

### Database schema

Add a new `projects` table:

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Rebuild project-owned tables so they include `project_id`:

```sql
CREATE TABLE samples (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  file_path TEXT,
  audio_data BLOB NOT NULL,
  sample_rate INTEGER NOT NULL,
  channels INTEGER NOT NULL,
  duration REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, hash),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE features (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  sample_hash TEXT NOT NULL,
  feature_hash TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  feature_data TEXT NOT NULL,
  options TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, sample_hash, feature_hash),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
);

CREATE TABLE command_history (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  command TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

Coupled integrity update:

- `samples_features` should also gain `project_id` and project-scoped foreign keys if it continues to reference `samples` and `features`
- `debug_logs` remains global unless a later requirement asks for project-specific logging

### Startup behavior

Main-process startup should:

1. open the SQLite database
2. run migrations
3. ensure at least one project exists; if not, create `default`
4. resolve the current project from persisted settings
5. if the saved project is missing, fall back to `default`
6. expose the current project to renderer IPC before project-scoped history is loaded

### Project lifecycle behavior

- `proj.load(name)` loads the named project if it exists; otherwise it creates it, makes it current, and returns the new current-project summary
- `proj.rm(name)` deletes the named project and cascades samples, features, command history, and any project-scoped provenance rows
- if removal deletes the active project or leaves zero projects, Bounce must ensure `default` exists and becomes current
- current working directory and current sample remain out of scope for this feature; project switching changes persistence context, not unrelated REPL state

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/electron/database.ts`

- add a migration that creates `projects`
- rebuild `samples`, `features`, `command_history`, and any coupled provenance table(s) with `project_id`
- seed `default` during bootstrap when no rows exist
- add project CRUD/query helpers such as:
  - `ensureDefaultProject()`
  - `getProjectByName(name)`
  - `getProjectById(id)`
  - `listProjectsWithCounts()`
  - `loadOrCreateProject(name)`
  - `removeProject(name)`
- update all sample/feature/history read-write methods to require the current project or project id

#### `src/electron/settings-store.ts`

- persist `currentProjectName` alongside existing settings
- add getters/setters for the current project name
- handle fallback to `default` when the saved project no longer exists

#### `src/electron/main.ts`

- ensure project bootstrap runs during app startup
- thread current-project resolution into history loading and command persistence IPC
- add IPC handlers for:
  - `get-current-project`
  - `list-projects`
  - `load-project`
  - `remove-project`
- make existing sample/feature/history IPC handlers operate within the current project context

#### `src/electron/preload.ts`

- expose typed project IPC methods on `window.electron`
- update renderer-visible types for project-aware command history and project metadata

#### `src/renderer/bounce-api.ts`

- add a new top-level `proj` namespace
- wire `proj` methods to the project IPC layer
- update root `help()` output to include `proj`
- keep method-level `help()` entries consistent with other namespaces

#### `src/renderer/bounce-result.ts`

- add project-facing result wrappers as needed:
  - `ProjectResult` for `proj.current()` / `proj.load()`
  - `ProjectListResult` for `proj.list()`
- ensure direct REPL display produces concise summaries and table output instead of raw object dumps

#### `src/renderer/bounce-globals.d.ts`

- declare the `proj` namespace and any new project result types
- include `help()` on all exposed surfaces

#### `src/renderer/repl-evaluator.ts`

- add `proj` to `BOUNCE_GLOBALS`

#### `src/renderer/tab-completion.ts`

- verify `proj` is discoverable at the top level and that `proj.current`, `proj.list`, `proj.load`, and `proj.rm` complete like existing namespace methods

#### `src/renderer/app.ts`

- ensure command-history loading and persistence use the active project context
- on `proj.load(name)`, refresh in-memory command history so reverse-search/navigation reflect the newly selected project

### Terminal UI Changes

Add the `proj` namespace with the following behavior:

- `proj.current()` returns a `ProjectResult` summary for the active project
- `proj.list()` returns a table of all projects with:
  - current-project marker
  - name
  - sample count
  - feature count
  - command count
  - created timestamp
- `proj.load(name)` loads or creates the named project and returns the resulting `ProjectResult`
- `proj.rm(name)` removes the project and returns a confirmation `BounceResult`

`proj.list()` should favor readable fixed-width table formatting instead of JSON serialization.

### REPL Interface Contract

This feature adds a new REPL-facing namespace and new returned-object display behavior.

- `proj.help()` must explain the namespace and show usage examples
- `proj.current.help()`, `proj.list.help()`, `proj.load.help()`, and `proj.rm.help()` should exist if method-level help remains the established pattern
- `ProjectResult` should print a compact summary emphasizing:
  - project name
  - whether it is current
  - sample count
  - feature count
  - command count
  - created timestamp
- `ProjectListResult` should print a tabular summary with one row per project

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [x] Unit tests and/or Playwright tests are identified for `help()` output
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

None expected.

## Testing Strategy

### Unit Tests

- database migration/bootstrap test:
  - empty database creates `projects`
  - `default` is auto-created
  - project-owned tables include `project_id`
- database behavior test:
  - same sample hash can be stored in different projects without collision
  - project removal cascades sample, feature, history, and provenance rows
  - deleting the active or last project falls back to `default`
- renderer API test:
  - `proj.help()` and method-level help render expected text
  - `proj.current()` and `proj.list()` direct-display summaries are useful
- tab-completion test:
  - top-level completion includes `proj`
  - member completion includes `current`, `list`, `load`, and `rm`

### E2E Tests

- startup with empty user data creates `default` and shows `proj.current()` correctly
- create/load a named project, add command history and sample data, switch projects, and verify command history is scoped
- remove a project and verify scoped data disappears while fallback/current-project behavior remains valid

When REPL interaction coverage is needed, use `./build.sh` rather than direct Playwright host execution.

### Manual Testing

- launch Bounce with a fresh user-data directory
- run `proj.current()` and confirm `default`
- run `proj.list()` and verify table formatting
- run `proj.load("drums")`, load/analyze samples, and confirm counts update
- switch back to `default` and verify project-scoped history/search behavior
- remove a non-current project and then remove the current project to verify fallback behavior

## Success Criteria

- Bounce always has a valid current project
- fresh startup auto-creates and loads `default`
- current-project selection persists across app restarts
- samples, features, command history, and coupled provenance rows are project-scoped
- the same sample/feature hashes can exist in more than one project without schema conflicts
- `proj` appears in root help and tab completion
- `proj.current()`, `proj.list()`, `proj.load(name)`, and `proj.rm(name)` behave as specified
- project deletion removes associated persisted data
- automated coverage verifies REPL help text and returned-object display behavior for the new project API

## Risks & Mitigation

- **Risk:** Hidden global assumptions in sample/feature queries could leak data across projects.  
  **Mitigation:** audit every database method and IPC surface that reads or writes samples, features, or command history; require an explicit project context at the database boundary.

- **Risk:** Project-scoped uniqueness may break existing foreign keys.  
  **Mitigation:** update coupled provenance tables and foreign keys in the same migration rather than patching them later.

- **Risk:** Command history may stay bound to the previous project after `proj.load(name)`.  
  **Mitigation:** define an explicit renderer refresh step for in-memory history buffers when the active project changes.

- **Risk:** Deleting the active project could leave Bounce without a valid context.  
  **Mitigation:** centralize fallback logic so `default` is guaranteed before any remove operation completes.

## Implementation Order

1. Rebuild the database schema around `projects` and project-scoped keys.
2. Add startup bootstrap and persisted current-project selection.
3. Make all sample/feature/history IPC and database operations project-aware.
4. Add renderer-facing `proj` API, typings, and REPL result objects.
5. Refresh completion/help surfaces and command-history switching behavior.
6. Add/adjust unit and workflow tests.
7. Validate with lint, build, unit tests, and Dockerized workflow coverage if REPL/e2e behavior changes.

## Estimated Scope

Medium to large.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
