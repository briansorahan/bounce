# Implementation: Refactor Data Model

**Spec:** specs/refactor-data-model  
**Created:** 2025-01-01  
**Status:** Complete

## Context

Replaced the redundant `slices` and `components` tables with a unified `samples_features` linking table. All audio samples (source and derived) now live in the `samples` table. See PLAN.md for full design.

## Implementation Log

### Phase 1: Schema & Core DB (database.ts)

- Updated `SampleRecord.file_path` to `string | null`
- Removed `SliceRecord`, `ComponentRecord`, `SlicesSummaryRecord`, `ComponentsSummaryRecord`
- Added `SampleFeatureLink`, `DerivedSampleSummary`
- Replaced `initializeTables()` with migration-aware version (drops slices/components, migrates file_path to nullable, creates samples_features)
- Removed old methods: createSlices, getSlice, getSlicesByFeature, createComponents, getComponent, getComponentByIndex, getComponentsByFeature, listSlicesSummary, listComponentsSummary
- Added new methods: createDerivedSample, createSliceSamples, getDerivedSamples, getDerivedSampleByIndex, listDerivedSamplesSummary
- Updated listSamples() to only return source samples (WHERE file_path IS NOT NULL)

### Phase 2: IPC Layer (main.ts, preload.ts, types.d.ts)

- main.ts: Replaced 8 old handlers with 4 new ones (create-slice-samples, get-derived-samples, get-derived-sample-by-index, list-derived-samples-summary)
- preload.ts: Replaced old bindings with new derived sample bindings
- types.d.ts: Removed SliceData/ComponentData/SlicesSummary/ComponentsSummary; added SampleFeatureLinkData, DerivedSampleSummaryData; SampleData.file_path now `string | null`

### Phase 3: Renderer & Commands (app.ts, sep.ts)

- app.ts: Fixed filePath null → undefined coercions in handleVisualizeNxCommand, handleVisualizeNMFCommand
- app.ts: handleSliceCommand updated to use createSliceSamples
- app.ts: handlePlaySliceCommand updated — signature changed to `play-slice <sourceHash> <index>`, uses getDerivedSampleByIndex
- app.ts: handlePlayComponentCommand updated to use getDerivedSampleByIndex
- app.ts: listSamples display uses null-safe file_path access
- app.ts: listSlices/listComponents rewritten to use listDerivedSamplesSummary filtered by feature_type
- sep.ts: Replaced raw SQL INSERT INTO components with createDerivedSample() calls

### Phase 4: Testing

- tests/nmf-separation.spec.ts: Updated to use listDerivedSamplesSummary + filter by feature_type === "nmf", derived_count field
- tests/nx-cross-synthesis.spec.ts: Same updates, source_hash instead of sample_hash

## Decisions Made

- `listDerivedSamplesSummary()` returns all feature types; callers filter by `feature_type` to get slices vs components
- `play-slice` command signature changed from `<id>` to `<sourceHash> <index>` to match the new model (breaking UI change, documented in help text)
- Derived sample hash uses `sha256(sourceHash:featureHash:index + audioData)` for provenance-aware uniqueness

## Deviations from Plan

- None significant

## Issues & TODOs

### Bug: FOREIGN KEY constraint failed on startup (discovered 2026-02-27)

App crashes on startup with:
```
SqliteError: FOREIGN KEY constraint failed
  at Database.exec (...database.js:127:25)
  at DatabaseManager.initializeTables
```

**Root cause:** The `file_path` nullable migration at line 127 of the compiled JS does:
```sql
ALTER TABLE samples RENAME TO samples_old;
CREATE TABLE samples (...);
INSERT INTO samples SELECT ... FROM samples_old;
DROP TABLE samples_old;
```

In newer SQLite versions, `ALTER TABLE ... RENAME TO` also updates FK references in dependent tables. So after renaming `samples` → `samples_old`, the `features` table's `FOREIGN KEY (sample_hash) REFERENCES samples(hash)` is silently rewritten to reference `samples_old`. The subsequent `DROP TABLE samples_old` then fails because `features` rows still reference it.

**Fix: Versioned migration system**

Replace the ad-hoc inline migration in `initializeTables()` with a proper versioned migration system:

1. **`schema_versions` table** — created on first run, tracks applied migrations:
   ```sql
   CREATE TABLE IF NOT EXISTS schema_versions (
     version INTEGER PRIMARY KEY,
     applied_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Migration registry** — an ordered array of migration functions in `database.ts`. Each migration runs exactly once and is recorded in `schema_versions`.

3. **Startup flow:**
   - If DB is empty (fresh install): create all tables at the latest schema directly, record all versions as applied.
   - If DB has existing data: check `schema_versions`, run any pending migrations in order.

4. **Migration v1** — the `file_path` nullable migration, fixed by suspending FK enforcement:
   ```sql
   PRAGMA foreign_keys = OFF;
   ALTER TABLE samples RENAME TO samples_old;
   CREATE TABLE samples (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     hash TEXT NOT NULL UNIQUE,
     file_path TEXT,
     audio_data BLOB NOT NULL,
     sample_rate INTEGER NOT NULL,
     channels INTEGER NOT NULL,
     duration REAL NOT NULL,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   INSERT INTO samples
     SELECT id, hash, file_path, audio_data, sample_rate, channels, duration, created_at
     FROM samples_old;
   DROP TABLE samples_old;
   PRAGMA foreign_keys = ON;
   ```

**Why not ALTER in place?** SQLite's `ALTER TABLE` does not support modifying column constraints (e.g., dropping `NOT NULL`). The rename/recreate/drop pattern is the only standard approach. The fix is wrapping it in `PRAGMA foreign_keys = OFF/ON`.

**Database choice:** Evaluated DuckDB (richer DDL, VSS extension for nearest-neighbor search over MFCC vectors) but decided to stay with SQLite. The main workload is transactional (small writes: samples as BLOBs, command history, debug logs), not analytical. DuckDB's Node.js/Electron integration is less proven. Vector search over MFCC data is a future concern — `hnswlib-node` alongside SQLite is the preferred path when that need arises.

## Final Status

**Completion Date:** 2025-07-14 (original); reopened 2026-02-27 for migration bug

**Summary:** Successfully replaced slices/components dual-table design with unified samples_features linking table. All code paths updated from DB layer through IPC, renderer, commands, and tests. Versioned migration system needed to fix FK constraint crash on existing databases.

**Verification:**
- [x] Linting passed
- [x] TypeScript builds (both electron and renderer)
- [x] Tests updated
- [x] Manual testing complete (build passes)
- [ ] Cross-platform tested (if applicable)
- [ ] Versioned migration system implemented and tested

**Known Limitations:**

- play-slice command signature changed (breaking change for existing users)
- Existing databases with `file_path NOT NULL` crash on startup until versioned migration is implemented

**Future Improvements:**

- Could add `feature_type` filter parameter to listDerivedSamplesSummary IPC handler to avoid client-side filtering
- Nearest-neighbor search over MFCC vectors: add `hnswlib-node` alongside SQLite rather than switching databases
