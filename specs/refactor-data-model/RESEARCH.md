# Research: Data Model Refactoring

**Spec:** specs/refactor-data-model  
**Created:** 2026-02-26  
**Status:** Complete

## Problem Statement

The current data model has unnecessary complexity with separate `components` and `slices` tables. Both represent derived audio samples computed from source samples using features. This duplication creates:

- Redundant table structures and code
- Confusion about when to use components vs slices
- More complex queries and data management
- Harder to extend for new analysis types

## Background

The proposed simplification aligns with the core insight: **components and slices are just samples**. They happen to be computed/derived samples rather than loaded from files, but they're fundamentally the same entity.

Current schema has:
- **samples** table - stores original audio files
- **features** table - stores analysis results (onsets, NMF bases/activations, etc.)
- **slices** table - stores time-range metadata (start/end samples) derived from onset detection
- **components** table - stores audio buffers derived from NMF decomposition

The key insight: slices and components are both **derived samples** that link to:
1. One or more source samples
2. One or more features used to compute them

## Related Work / Prior Art

**Current Implementation:**

Located in `src/electron/database.ts`:

```typescript
// Current schema (lines 128-199)
CREATE TABLE samples (
  id INTEGER PRIMARY KEY,
  hash TEXT UNIQUE,
  file_path TEXT,
  audio_data BLOB,
  sample_rate INTEGER,
  channels INTEGER,
  duration REAL
);

CREATE TABLE features (
  id INTEGER PRIMARY KEY,
  sample_hash TEXT,
  feature_hash TEXT,
  feature_type TEXT,        -- 'onset', 'nmf', etc.
  feature_data TEXT,         -- JSON of analysis results
  options TEXT,
  FOREIGN KEY (sample_hash) REFERENCES samples(hash)
);

CREATE TABLE slices (
  id INTEGER PRIMARY KEY,
  sample_hash TEXT,
  feature_id INTEGER,
  slice_index INTEGER,
  start_sample INTEGER,      -- Only metadata, no audio
  end_sample INTEGER,
  FOREIGN KEY (sample_hash) REFERENCES samples(hash),
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE TABLE components (
  id INTEGER PRIMARY KEY,
  sample_hash TEXT,
  feature_id INTEGER,
  component_index INTEGER,
  audio_data BLOB,           -- Actual audio buffer
  FOREIGN KEY (sample_hash) REFERENCES samples(hash),
  FOREIGN KEY (feature_id) REFERENCES features(id)
);
```

**Key Observations:**
- Slices only store metadata (time ranges), not audio
- Components store actual audio buffers
- Both link to a source sample and a feature
- Both use an index field (slice_index, component_index)

## FluCoMa Algorithm Details

Not directly applicable - this is a data model refactoring. However, the model must support:

1. **Onset Detection** → produces time points → currently creates slices
2. **NMF** → produces component audio buffers → currently creates components
3. Future algorithms may produce either time-based or audio-based outputs

The unified model should handle both cases without special-casing.

## Technical Constraints

- **SQLite** database (better-sqlite3)
- Must maintain **backward compatibility** or provide migration path
- Existing commands depend on current API: `createSlices()`, `createComponents()`, `getSlicesByFeature()`, etc.
- Electron IPC layer exposes database methods to renderer
- Audio data stored as BLOB (Buffer in Node.js)

**Files to update:**
- `src/electron/database.ts` - Schema and DatabaseManager methods
- `src/electron/main.ts` - IPC handlers (lines 301-325+)
- `src/electron/preload.ts` - IPC bindings (line 69+)
- `src/renderer/types.d.ts` - TypeScript definitions
- `src/renderer/app.ts` - UI code using slices/components (lines 1236+)
- Test files that use the old API

## Audio Processing Considerations

**Slices vs Components - Key Difference:**

1. **Slices** (onset detection):
   - Only store time range metadata (start/end sample indices)
   - Audio extracted on-demand from source sample
   - Lightweight storage

2. **Components** (NMF):
   - Store actual audio buffers (pre-computed)
   - Cannot be derived from source sample alone
   - Requires both source sample AND feature data

**Unified Model Must Handle:**
- Some derived samples are just time-ranges (lazy audio extraction)
- Some derived samples are pre-computed audio (eager storage)
- Both cases need to track provenance (which source samples + which features)

## Terminal UI Considerations

The terminal UI currently distinguishes between slices and components in commands/display. After refactoring:
- Commands may need updating to use unified terminology
- List commands show both types (currently separate)
- User-facing language should be clear about derived samples

## Cross-Platform Considerations

SQLite schema changes are platform-agnostic. Main concern is database migration:
- Existing databases have slices/components tables
- Need migration strategy for existing user data
- Schema versioning may be helpful for future changes

## Open Questions

1. **Naming the linking table:**
   - `sample_features` - emphasizes the relationship
   - `sample_provenance` - emphasizes derivation tracking
   - `sample_derivations` - emphasizes computed nature
   - `analysis_links` - more generic
   
2. **Should source samples and derived samples live in same table?**
   - Option A: Single `samples` table with nullable `source_sample_id`
   - Option B: Keep separate tables but unify slices/components
   - Option C: Three tables: sources, derived, linking

3. **How to handle the audio data difference?**
   - Slices don't store audio (just time ranges)
   - Components store audio blobs
   - Should both be nullable `audio_data` with metadata fields?

4. **Migration strategy:**
   - Migrate existing databases automatically on upgrade?
   - Provide manual migration tool?
   - Accept breaking change (app is experimental)?

5. **Index/ordering:**
   - Current slice_index and component_index - keep generic index field?
   - Needed for ordered results (NMF component 0, 1, 2...)

## Research Findings

**Current Usage Patterns:**

1. **Slices** (onset detection workflow):
   - Created via `database.createSlices(sampleHash, featureId, positions[])`
   - Retrieved via `database.getSlicesByFeature(featureId)`
   - Used in renderer: `app.ts` line 1236 for playback
   - Store only metadata - audio extracted from source sample on playback

2. **Components** (NMF workflow):
   - Created via `database.createComponents(sampleHash, featureId, audioBuffers[])`
   - Retrieved via `database.getComponentsByFeature(featureId)`
   - Used in renderer: `app.ts` for direct playback
   - Store actual audio data - pre-computed from NMF algorithm

3. **Common Pattern:**
   - Both link to source sample hash + feature ID
   - Both have index field for ordering
   - Both used for audio playback (different extraction methods)
   - Both are conceptually "derived samples"

**Proposed Unification:**

All samples (original or derived) share common attributes:
- Hash (identifier)
- Audio data (nullable for time-range slices)
- Sample rate, channels, duration
- Metadata about how they were created

A linking table tracks relationships:
- Which sample(s) were used as input
- Which feature(s) were applied
- Index/ordering within a set of derived samples
- Additional metadata (e.g., time ranges for slices)

## Next Steps

**For PLAN phase:**

1. **Answer open questions** - decide on:
   - Linking table name
   - Whether to merge all samples into one table or keep separate
   - How to handle nullable audio_data
   - Migration strategy

2. **Design new schema** - define:
   - Exact table structures
   - Foreign key relationships
   - Indexes for performance
   - Default values and constraints

3. **Map API changes** - plan:
   - How old methods map to new methods
   - Backward compatibility layer (if needed)
   - Database migration code
   - Test data migration

4. **Identify refactoring scope** - determine:
   - Which files need changes
   - What tests need updating
   - Documentation updates needed

5. **Consider future extensibility:**
   - How would this support other FluCoMa algorithms?
   - Can we add new derivation types easily?
   - Does this support multi-sample inputs (e.g., concatenation)?
