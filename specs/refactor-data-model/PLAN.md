# Plan: Data Model Refactoring

**Spec:** specs/refactor-data-model  
**Created:** 2026-02-26  
**Status:** In Progress

## Context

From RESEARCH phase: Current schema has redundant `slices` and `components` tables. Both represent derived samples computed from source samples using features. Key differences:
- **Slices** store only time-range metadata (onset detection)
- **Components** store pre-computed audio buffers (NMF)

**Core insight:** They're both samples. The distinction is implementation detail, not conceptual.

**Decision:** Use `samples_features` as the linking table name (combines the two table names we're linking).

## Approach Summary

**Three-table design:**

1. **`samples`** - All audio samples (source and derived)
   - Keep existing fields: hash, file_path, audio_data, sample_rate, channels, duration
   - `audio_data` stores the actual audio for all samples (not nullable)
   - `file_path` is nullable (NULL for derived samples, path for user-loaded samples)

2. **`features`** - Analysis results (unchanged)
   - Keep as-is: id, sample_hash, feature_hash, feature_type, feature_data, options

3. **`samples_features`** - Links samples to their derivation provenance
   - Replaces both `slices` and `components` tables
   - Tracks: source sample + feature → derived sample
   - Stores ordering metadata (index)

**Key design principle:** All samples are in one table. The `samples_features` table tells you *how* a derived sample was created.

## Architecture Changes

**Database Schema:**

```sql
-- KEEP (with nullable file_path)
CREATE TABLE samples (
  hash TEXT PRIMARY KEY,
  file_path TEXT,                    -- NULL for derived samples
  audio_data BLOB NOT NULL,          -- Audio data for all samples
  sample_rate INTEGER NOT NULL,
  channels INTEGER NOT NULL,
  duration REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- KEEP (with composite primary key)
CREATE TABLE features (
  sample_hash TEXT NOT NULL,
  feature_hash TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  feature_data TEXT NOT NULL,
  options TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sample_hash, feature_hash),
  FOREIGN KEY (sample_hash) REFERENCES samples(hash)
);

-- NEW (replaces slices + components)
CREATE TABLE samples_features (
  sample_hash TEXT NOT NULL,         -- The derived sample
  source_hash TEXT NOT NULL,         -- The source sample used
  feature_hash TEXT NOT NULL,        -- The feature that created this
  index_order INTEGER NOT NULL,      -- Ordering (component_index, slice_index)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sample_hash),
  FOREIGN KEY (sample_hash) REFERENCES samples(hash),
  FOREIGN KEY (source_hash) REFERENCES samples(hash),
  FOREIGN KEY (source_hash, feature_hash) REFERENCES features(sample_hash, feature_hash)
);

-- DROP
-- DROP TABLE slices;
-- DROP TABLE components;
```

**Conceptual mapping:**
- Old slice → sample (with audio_data BLOB) + samples_features entry
- Old component → sample (with audio_data BLOB) + samples_features entry

## Changes Required

### Native C++ Changes

None - this is purely a database schema and TypeScript refactor.

### TypeScript Changes

**1. `src/electron/database.ts`** - Major refactor

**Schema changes:**
- Update `initializeTables()` to use new schema
- Make `samples.file_path` nullable (NULL for derived samples)
- Keep `samples.audio_data` NOT NULL (all samples have audio data)
- Create `samples_features` table
- Drop `slices` and `components` tables (no migration needed — existing data is dropped)

**New/updated interfaces:**
```typescript
export interface SampleRecord {
  hash: string;
  file_path: string | null;      // NULL for derived samples
  audio_data: Buffer;            // Audio data for all samples
  sample_rate: number;
  channels: number;
  duration: number;
}

export interface FeatureRecord {
  sample_hash: string;
  feature_hash: string;
  feature_type: string;
  feature_data: string;
  options: string | null;
}

export interface SampleFeatureLink {
  sample_hash: string;
  source_hash: string;
  feature_hash: string;
  index_order: number;
}

// Remove: SliceRecord, ComponentRecord
```

**New methods:**
```typescript
createDerivedSample(
  sourceHash: string,
  featureHash: string,
  index: number,
  audioData: Buffer,
  sampleRate: number,
  channels: number,
  duration: number
): string  // Returns derived sample hash

getDerivedSamples(
  sourceHash: string,
  featureHash: string
): SampleFeatureLink[]

getDerivedSample(sampleHash: string): SampleRecord | undefined
```

**Remove old methods entirely (no backward compat layer):**
- `createSlices()`
- `createComponents()`
- `getSlicesByFeature()`
- `getComponentsByFeature()`
- `getSlice()`
- `getComponent()`

**2. `src/electron/main.ts`** - Update IPC handlers

Replace old handlers with new ones:
- `create-derived-sample` (new)
- `get-derived-samples` (new)
- Remove old slice/component handlers

**3. `src/electron/preload.ts`** - Update IPC bindings

Replace old bindings with new ones. Remove slice/component bindings.

**4. `src/renderer/types.d.ts`** - Update TypeScript definitions

Replace old types with new ones. Remove `SliceRecord`, `ComponentRecord`.

**5. `src/renderer/app.ts`** - Update UI code

- Line 1236: Update slice playback logic
- Update anywhere using `getSlice`, `getComponent`, etc.
- All samples now have audio_data (no null handling needed)

**6. `src/electron/commands/analyze-nmf.ts`** and **`analyze-onsets.ts`**

Update to use new `createDerivedSample()` API directly.

### Terminal UI Changes

**Commands affected:**
- Any list commands showing slices/components may need updating
- Terminology may shift from "slices" and "components" to "derived samples"
- Help text updates

**Display changes:**
- May want to show derivation chain (sample A → feature X → derived sample B)
- List commands should clearly indicate source vs. derived samples

**User-facing impact:**
- Minimal if backward compat API maintained
- Documentation should explain the unified model

### Configuration/Build Changes

None - no package.json, tsconfig, or binding.gyp changes needed.

## Testing Strategy

### Unit Tests

**Database migration:**
- Test migrating existing database with slices/components data
- Verify data integrity after migration
- Test empty database initialization

**New database methods:**
- `createDerivedSample()` with and without audio_data
- `getDerivedSamples()` returns correct samples
- Nullable fields handled correctly
- Foreign key constraints enforced

**Backward compatibility:**
- Old `createSlices()` still works
- Old `createComponents()` still works
- Old getter methods return expected data

### E2E Tests

**Onset detection workflow:**
- Load sample → analyze onsets → list slices → play slice
- Verify slices have audio_data stored

**NMF workflow:**
- Load sample → analyze NMF → list components → play component
- Verify components have audio_data

**Cross-workflow:**
- Derive sample from NMF component
- Verify derivation chain tracking

### Manual Testing

- Load existing database (if any test data exists)
- Run onset detection on sample
- Run NMF on sample
- List all samples (should show both source and derived)
- Play derived samples (both slices and components)
- Verify terminal UI displays correctly

## Success Criteria

- [ ] New schema created with `samples`, `features`, `samples_features` tables
- [ ] `slices` and `components` tables removed
- [ ] Migration code handles existing databases (if applicable)
- [ ] All existing tests pass
- [ ] New tests for unified model pass
- [ ] Backward compatibility layer works (old API methods still function)
- [ ] Onset detection workflow works end-to-end
- [ ] NMF workflow works end-to-end
- [ ] No TypeScript errors
- [ ] Linter passes
- [ ] Terminal UI displays derived samples correctly
- [ ] Audio playback works for both slice-type and component-type derived samples

## Risks & Mitigation

**Risk 1: Data loss from dropping old tables**
- Accepted: app is experimental, user will rebuild samples/features manually

**Risk 2: Increased storage from storing all slice audio**
- Mitigation: Acceptable for now; future optimization can add time-range references
- Mitigation: Document this trade-off in comments

**Risk 3: Breaking existing user databases**
- Accepted: app is experimental
- Mitigation: Add schema version tracking for future migrations

## Implementation Order

**Phase 1: Schema & Core Database Methods**
1. Update `database.ts` schema in `initializeTables()`
   - Drop `slices` and `components` tables
   - Modify `samples` table (nullable `file_path`)
   - Create `samples_features` table
2. Remove old interfaces: `SliceRecord`, `ComponentRecord`
3. Update interface: `SampleRecord`, add `SampleFeatureLink`
4. Remove old methods: `createSlices()`, `createComponents()`, `getSlicesByFeature()`, `getComponentsByFeature()`, `getSlice()`, `getComponent()`
5. Implement `createDerivedSample()`
6. Implement `getDerivedSamples()`

**Phase 2: IPC Layer**
7. Update `main.ts` IPC handlers (remove old, add new)
8. Update `preload.ts` bindings
9. Update `renderer/types.d.ts` definitions

**Phase 3: Renderer & Commands**
10. Update `renderer/app.ts` (playback logic)
11. Update `commands/analyze-nmf.ts` and `commands/analyze-onsets.ts`

**Phase 4: Testing**
12. Run existing tests, fix any failures
13. Add new unit tests for unified model
14. Manual testing in Electron app

**Phase 5: Documentation & Cleanup**
15. Run linter and fix issues
16. Commit with detailed message

## Estimated Scope

**Medium** - This is primarily a database refactor with broad but shallow impact.

**Effort breakdown:**
- Schema changes: Small (straightforward SQL)
- Core methods: Small-Medium (new methods, backward compat wrappers)
- IPC layer updates: Small (mechanical changes)
- Testing: Medium (need comprehensive coverage)
- Documentation: Small

**Time estimate:** 4-6 hours of focused work

**Complexity:** Medium - not algorithmically complex, but touches many files and requires careful attention to data integrity and backward compatibility.
