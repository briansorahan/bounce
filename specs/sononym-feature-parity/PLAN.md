# Plan: Sononym Feature Parity

**Spec:** specs/sononym-feature-parity  
**Created:** 2026-03-13  
**Status:** In Progress

## Context

`RESEARCH.md` concluded that Bounce already has strong analysis and playback primitives, but lacks Sononym's product-facing discovery workflows. The biggest gaps are library management, indexed search, descriptor-driven filtering, and user-facing similarity workflows across a browsable corpus.

For this first planning phase, scope is intentionally narrowed to a **search/similarity MVP** rather than full Sononym parity. That means the initial plan optimizes for:

- first-class libraries
- indexed discovery over filenames/paths and available descriptors
- similarity search across indexed samples
- terminal-first browsing and preview workflows

The following Sononym areas are explicitly deferred from the MVP unless they become necessary enablers:

- projects / collections
- favorites
- advanced renaming / naming profiles
- embedded metadata support
- duplicate-detection workflows
- class/category ML taxonomy parity

## Approach Summary

Implement a new **library and search subsystem** on top of Bounce's existing sample/feature database, then expose it through terminal-native commands and result views.

The MVP should work like this:

1. A user adds one or more library roots.
2. Bounce scans supported audio files under those roots.
3. Bounce stores sample membership, text-search data, and per-sample summary descriptors.
4. The user searches indexed libraries by text and optional filters.
5. The user previews results directly in the current waveform/playback flow.
6. The user launches similarity search from an indexed sample and gets ranked matches across active libraries.

The design should **reuse existing analysis** wherever possible:

- keep current audio decoding and sample hashing
- reuse existing feature storage in `features`
- reuse corpus/similarity ideas from `CorpusManager`
- avoid native C++ changes for the MVP unless a hard blocker is found

## Architecture Changes

### 1. Introduce a first-class library model

Add a user-facing library abstraction above the current `samples` table.

Proposed persisted entities:

- `libraries`: id, name, root_path, status, created_at, updated_at, last_indexed_at
- `library_samples`: library_id, sample_hash, relative_path, file_mtime, file_size, discovered_at
- `sample_descriptors`: sample_hash, duration, sample_rate, channels, and summary analysis fields used for filtering/similarity

The current `samples` table remains the canonical storage for decoded sample data keyed by hash. Library membership becomes a separate mapping layer.

### 2. Add a search index layer

Add a queryable text index for filename/path discovery. SQLite FTS is the preferred MVP implementation because it keeps indexing local, lightweight, and aligned with the existing `better-sqlite3` architecture.

Proposed index inputs:

- basename / filename
- relative path within the library
- library name

Descriptor filtering should remain in ordinary relational tables, not FTS.

### 3. Add a library indexing service in the Electron main process

Create a new service that:

- recursively scans supported audio files under a library root
- hashes and stores decoded samples using the existing ingestion path
- computes or derives per-sample descriptor summaries
- updates library membership and search index records
- supports refresh/reindex without duplicating stored samples

This should live in main-process TypeScript and expose a clean API to IPC handlers.

### 4. Add a search/similarity application layer

Create a main-process search service that can:

- query indexed samples by text
- apply descriptor filters
- return paginated/sorted result sets
- launch similarity matching from a selected sample hash

For MVP similarity, the plan is to extend current descriptor-based matching to work at the **indexed sample level** rather than only inside an ad hoc corpus built from onset slices. If segment-level corpus workflows remain useful, they should stay available as a more advanced Bounce-native feature, but the Sononym-parity path needs whole-sample discovery first.

### 5. Add terminal-native browse state

The renderer should maintain a small amount of ephemeral result state so users can:

- inspect the current search result set
- preview by row index
- refine or rerun searches
- launch similarity from the currently selected or indexed result

This should feel native to Bounce's REPL, not like a hidden GUI panel bolted onto the app.

## Changes Required

### Native C++ Changes

None for the MVP.

The plan assumes existing native analysis bindings are sufficient for initial descriptor extraction and similarity scoring. If a blocker appears during implementation, revisit this assumption in `IMPL.md` before widening scope.

### TypeScript Changes

#### Database and indexing

- `src/electron/database.ts`
  - add versioned schema migration(s) for libraries, library-to-sample mappings, descriptor summaries, and text index support
  - add CRUD/query helpers for libraries, indexed samples, and search results
- New file(s), likely:
  - `src/electron/library-indexer.ts`
  - `src/electron/search-service.ts`
  - `src/electron/descriptor-summary.ts` or equivalent

#### Main-process IPC

- `src/electron/main.ts`
  - add IPC handlers for library add/list/refresh/remove
  - add IPC handlers for search query, search filters, result retrieval, and sample-level similarity
  - reuse existing sample decoding/storage flow where possible

#### Preload bridge

- `src/electron/preload.ts`
  - expose new library/search/similarity IPC calls into `window.electron`

#### Renderer API surface

- `src/renderer/bounce-api.ts`
  - add first-class namespaces for the MVP, likely along the lines of:
    - `library.add()`, `library.list()`, `library.refresh()`, `library.remove()`
    - `search.query()`, `search.results()`, `search.clear()`
    - `search.preview(index)` or equivalent
    - `search.similar(index | hash, options?)`
  - preserve existing `display()`, `play()`, `corpus.*`, and analysis commands
  - avoid breaking current REPL workflows

#### Renderer application state

- `src/renderer/app.ts`
  - maintain lightweight search-session state where needed
  - support any new command output mode or current-result shortcuts required by the MVP
- Potential new helper:
  - `src/renderer/search-session.ts`

#### Existing analysis helpers

- `src/electron/corpus-manager.ts`
  - either remain as-is for advanced workflows, or share reusable similarity-scoring code with the new indexed-similarity path
- `src/renderer/waveform-visualizer.ts`
  - likely unchanged for MVP beyond wiring preview flows through existing display/playback behavior

### Terminal UI Changes

The MVP should not try to recreate Sononym's full panel-based GUI. Instead, add a terminal-native workflow with:

- formatted library tables
- formatted search result tables with row indices
- compact display of active query / filters
- commands to preview and inspect current result rows
- commands to pivot from search results into similarity results

Terminal UX goals:

- easy to learn from `.help()`
- composable from scripts
- usable without mouse interaction
- consistent with existing Bounce API patterns

Out of scope for MVP terminal UI:

- persistent sidebars
- draggable filter panels
- waveform region drag-selection
- fully interactive table widgets

### Configuration/Build Changes

- Database migration version bump in `src/electron/database.ts`
- No expected `package.json`, `binding.gyp`, or TypeScript build changes for MVP
- If SQLite FTS requires any compatibility handling, document it in implementation notes, but prefer staying within existing dependencies

## Testing Strategy

### Unit Tests

Add unit coverage for:

- library creation/listing/removal database helpers
- indexing idempotency and refresh behavior
- text search result ranking / filtering behavior
- descriptor-summary extraction and persistence
- sample-level similarity scoring over indexed records
- any query parsing or result-state helpers

Likely test files:

- new tests under `src/` for database/search/index helpers
- extend `src/settings-store.test.ts` only if settings behavior changes
- add focused tests near any new service modules

### E2E Tests

Add Playwright coverage for:

- adding a library from a fixture directory
- searching by filename/path term
- previewing a search result
- running similarity search from a result and seeing ranked matches
- refreshing a library after fixture changes

Expected files:

- new `tests/library-search.spec.ts`
- new `tests/similarity-search.spec.ts`
- possibly extend `tests/terminal-ui.spec.ts`

### Manual Testing

Verify manually in Electron:

- first-run library add flow
- re-open app and confirm libraries persist
- search on large-ish sample directories remains responsive
- preview from results updates waveform and playback correctly
- similarity search returns plausible results
- existing commands (`display`, `play`, `analyze`, `slice`, `corpus.*`, `fs.*`) still behave correctly

## Success Criteria

The MVP is complete when all of the following are true:

1. Users can add and list one or more libraries from the REPL.
2. Bounce indexes supported audio files under those libraries without duplicating stored samples unnecessarily.
3. Users can search indexed content by text over filename/path.
4. Users can apply at least a minimal useful filter set based on currently available descriptors and file properties.
5. Users can preview any returned result through the existing waveform/playback path.
6. Users can launch similarity search from an indexed sample and get ranked matches across indexed content.
7. Existing Bounce analysis and corpus workflows continue to work.
8. The MVP does not introduce native-code changes or break cross-platform Electron builds.

## Risks & Mitigation

### Risk: indexing becomes too slow or too expensive

**Mitigation:** stage indexing work; store library membership separately from decoded sample storage; reuse hashes; support refresh based on file metadata before full re-decode.

### Risk: descriptor coverage is weaker than Sononym

**Mitigation:** explicitly scope MVP filters to descriptors Bounce can compute reliably now. Do not promise Sononym-complete descriptor parity in phase one.

### Risk: search UX feels clumsy in the terminal

**Mitigation:** design around concise commands, current-result state, and readable tabular output instead of forcing GUI metaphors into xterm.

### Risk: similarity workflows fragment between `corpus.*` and the new indexed path

**Mitigation:** document the distinction clearly. Keep `corpus.*` as advanced/creative tooling and make the new indexed similarity commands the Sononym-parity path.

### Risk: schema evolution becomes messy

**Mitigation:** implement the new storage using proper versioned migrations and keep the new tables orthogonal to existing sample/feature storage.

## Implementation Order

1. **Data model and migrations**
   - add `libraries`, `library_samples`, descriptor summary storage, and search index structures
   - add database helper methods

2. **Library indexing service**
   - recursive scan
   - supported-audio-file detection
   - sample ingestion / refresh rules
   - descriptor-summary generation

3. **Search service**
   - text query over indexed paths/names
   - descriptor-filter support
   - stable result ordering and pagination

4. **Sample-level similarity service**
   - define feature vector for whole-sample matching
   - add ranked similarity query over indexed content

5. **IPC and preload wiring**
   - add main/preload contracts for libraries, search, and similarity

6. **Renderer API and terminal workflow**
   - add `library.*` and `search.*` commands
   - add current-result session state and preview commands

7. **Automated tests**
   - unit tests for data/index/search logic
   - Playwright flows for library ingest, search, preview, similarity

8. **Documentation / help text**
   - help output for new commands
   - update any user-facing docs if needed once behavior is settled

## Estimated Scope

Large

This MVP is smaller than full Sononym parity, but it still spans storage, indexing, query, similarity, IPC, renderer API, terminal UX, and automated tests.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
