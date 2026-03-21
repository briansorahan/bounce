# Research: Samples Data Model Refactor

**Spec:** specs/samples-data-model-refactor  
**Created:** 2026-03-21  
**Status:** Complete

## Problem Statement

The current `samples` table has several design issues that will compound as the application grows:

1. **`file_path` is overloaded** — it stores filesystem paths for imported audio (`sn.read()`), recording names for `mic.record()`, and is NULL for derived samples. There's no way to distinguish these cases without joining to `samples_features`.
2. **`audio_data` BLOB is NOT NULL for every sample** — including derived samples (slices, NMF components, grains) that could be recomputed from their source sample and feature data. This wastes disk space proportional to the number of derived samples.
3. **No type discriminator** — the only way to determine if a sample is derived is via a join to `samples_features`. Raw vs. recorded is ambiguous (both use `file_path`).
4. **No path for freesound integration** — the planned freesound feature will need a `url` column that doesn't fit cleanly into the current schema.
5. **Nameless recordings** — `mic.record()` without a name argument produces samples with NULL `file_path` and no row in `samples_features`, making them indistinguishable from a hypothetical sample that somehow lost its metadata.

## Background

The samples table was originally designed for a simple workflow: import audio files, run FluCoMa analysis, store derived samples. Recording support and the freesound integration were added to the roadmap later, and the schema wasn't designed to accommodate different sample origins.

### Current Schema

```sql
CREATE TABLE samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  file_path TEXT,             -- overloaded: filesystem path OR recording name OR NULL
  audio_data BLOB NOT NULL,   -- stored for ALL samples including derived
  sample_rate INTEGER NOT NULL,
  channels INTEGER NOT NULL,
  duration REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, hash),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### Current TypeScript Interface

```typescript
export interface SampleRecord {
  id: number;
  hash: string;
  file_path: string | null;
  audio_data: Buffer;
  sample_rate: number;
  channels: number;
  duration: number;
}
```

### How Samples Are Currently Classified

| Origin | `file_path` | `audio_data` | `samples_features` row |
|--------|-------------|-------------|----------------------|
| `sn.read("/path/to/file.wav")` | Absolute filesystem path | Full audio blob | No |
| `mic.record("take-1")` | Recording name string | Full audio blob | No |
| `mic.record()` (no name) | NULL | Full audio blob | No |
| Derived (slice, NMF, grain) | NULL | Full audio blob | Yes |

The ambiguity between nameless recordings and derived samples (both NULL `file_path`, but derived has a `samples_features` row) is the core issue.

## Related Work / Prior Art

- **SQLite type-per-table pattern**: Using a discriminator column with per-type metadata tables is a well-established pattern (similar to single-table inheritance with auxiliary tables in ORMs).
- **CHECK constraints in SQLite**: `CHECK(sample_type IN ('raw', 'derived', 'recorded', 'freesound'))` is fully supported and enforced on INSERT/UPDATE.
- **Existing patterns in the codebase**: The `instruments` table already uses a `kind TEXT NOT NULL` column, and `repl_env` uses `kind TEXT NOT NULL CHECK(kind IN ('json', 'function'))`.

## FluCoMa Algorithm Details

Not directly applicable — this is a data model refactor. However, the design must support recomputing derived sample audio on demand from source sample + feature data, which involves FluCoMa algorithm re-execution (onset slicing, NMF decomposition, etc.).

## Technical Constraints

- **SQLite limitations**: No support for cross-table CHECK constraints (can't enforce that a `recorded` sample has a row in `samples_recorded_metadata` at the DB level). Application code must enforce this invariant via atomic transactions.
- **Breaking change**: This is a non-backwards-compatible schema change. Existing databases will not be migrated — users start fresh.
- **Recomputation cost**: Derived samples will need their audio recomputed on demand. This is acceptable because:
  - The source sample + feature data provides enough information to reproduce the audio
  - Recomputation happens in the main process before IPC to the audio utility process
  - For instruments, audio will be cached in-memory in the utility process

## Audio Processing Considerations

- **Derived sample recomputation**: When a derived sample's audio is needed (e.g., for playback or instrument loading), the main process will:
  1. Look up the source sample via `samples_features`
  2. Read the source audio (from filesystem for raw, from DB for recordings)
  3. Apply the feature operation (e.g., slice at onset boundaries) to extract the derived audio
  4. Send the computed audio via IPC to wherever it's needed
- **Raw sample audio**: Read from filesystem on demand (no DB cache). Future work may add an optional caching mode.
- **Recording audio**: Stored in `samples_recorded_metadata.audio_data` since there's no filesystem backing.
- **Freesound audio**: Cached in `samples_freesound_metadata.audio_data` to avoid slow API round-trips.

## Terminal UI Considerations

No direct REPL surface area changes in this refactor. The `Sample` class and its methods remain the same from the user's perspective. The changes are purely in the storage layer.

However, the `sn.ls()` output may benefit from showing the sample type in future work.

## Cross-Platform Considerations

No platform-specific concerns — SQLite schema and TypeScript code are cross-platform.

## Open Questions

All resolved during research:

- ~~Should we migrate existing data?~~ → No, breaking change. Start fresh.
- ~~Where does `audio_data` live?~~ → Removed from `samples` table; stored only in metadata tables that need it (`samples_recorded_metadata`, `samples_freesound_metadata`).
- ~~Should `name` be on the samples table?~~ → No, names belong in per-type metadata tables only.
- ~~Should we cache raw sample audio in the DB?~~ → No, read from filesystem. Future work may add configurable caching.

## Research Findings

### Proposed Schema

**`samples` table (slimmed down):**
```sql
CREATE TABLE samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  sample_type TEXT NOT NULL CHECK(sample_type IN ('raw', 'derived', 'recorded', 'freesound')),
  sample_rate INTEGER NOT NULL,
  channels INTEGER NOT NULL,
  duration REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, hash),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

**Per-type metadata tables:**
```sql
CREATE TABLE samples_raw_metadata (
  project_id INTEGER NOT NULL,
  sample_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  PRIMARY KEY (project_id, sample_hash),
  FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
);

CREATE TABLE samples_recorded_metadata (
  project_id INTEGER NOT NULL,
  sample_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  audio_data BLOB NOT NULL,
  PRIMARY KEY (project_id, sample_hash),
  FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
);

CREATE TABLE samples_freesound_metadata (
  project_id INTEGER NOT NULL,
  sample_hash TEXT NOT NULL,
  url TEXT NOT NULL,
  audio_data BLOB NOT NULL,
  PRIMARY KEY (project_id, sample_hash),
  FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
);
```

**Derived samples** have no metadata table — their lineage is fully tracked by the existing `samples_features` table.

### Classification After Refactor

| Origin | `sample_type` | Metadata Table | Audio Source |
|--------|--------------|----------------|-------------|
| `sn.read()` | `'raw'` | `samples_raw_metadata` (file_path) | Filesystem |
| `mic.record("name")` | `'recorded'` | `samples_recorded_metadata` (name, audio_data) | DB blob |
| `mic.record()` | `'recorded'` | `samples_recorded_metadata` (name, audio_data) | DB blob (name auto-generated) |
| Derived (slice, NMF, grain) | `'derived'` | None (uses `samples_features`) | Recomputed on demand |
| Freesound download | `'freesound'` | `samples_freesound_metadata` (url, audio_data) | DB blob cache |

### Key Design Decisions

1. **Application-enforced invariants**: The DB cannot enforce that a given `sample_type` has a corresponding row in the appropriate metadata table. This invariant is upheld by application code using a single transaction to atomically insert to the `samples` table and the corresponding metadata table. Every non-`derived` sample type (`raw`, `recorded`, `freesound`) MUST have a linked row in its metadata table.
2. **`audio_data` removed from `samples`**: Only metadata tables that need it store audio blobs. This is the biggest disk space win.
3. **`file_path` removed from `samples`**: Moved to `samples_raw_metadata.file_path`. No more overloaded semantics.
4. **Nameless recordings**: Must still have a name in `samples_recorded_metadata`. Application code should auto-generate a name (e.g., `"recording-{timestamp}"` or `"recording-{hash-prefix}"`).

## Next Steps

In the PLAN phase:
- Define the full migration SQL (new migration function)
- Map out all TypeScript code that reads/writes the samples table and needs updating
- Design the derived sample audio recomputation flow
- Define the `SampleRecord` interface changes
- Plan the testing strategy (unit tests for DB operations, Playwright for end-to-end flows)
- Decide on auto-generated name format for nameless recordings
