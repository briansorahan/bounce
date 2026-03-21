# Plan: Samples Data Model Refactor

**Spec:** specs/samples-data-model-refactor  
**Created:** 2026-03-21  
**Status:** In Progress

## Context

The current `samples` table overloads `file_path` (filesystem paths, recording names, or NULL), stores `audio_data` BLOB for every sample (including derived samples that can be recomputed), and has no type discriminator. This refactor introduces a `sample_type` column, per-type metadata tables, and removes `audio_data` from the `samples` table entirely — storing it only in metadata tables that need it.

This is a **breaking change** — no migration of existing data.

## Approach Summary

1. Add new migration (`migrate008`) that drops and recreates `samples`, `features`, `samples_features` tables with the new schema
2. Add 3 new metadata tables: `samples_raw_metadata`, `samples_recorded_metadata`, `samples_freesound_metadata`
3. Add a `resolveAudioData()` method to `DatabaseManager` that knows how to load audio based on `sample_type`
4. Update all code that reads/writes the `samples` table to use the new schema
5. Update `createDerivedSample()` to not store audio — compute metadata (duration, hash) from provenance instead
6. Update all playback and analysis paths to use `resolveAudioData()`

## Architecture Changes

**New abstraction: `resolveAudioData(hash)`**

This method on `DatabaseManager` becomes the single point of truth for resolving a sample hash to PCM audio data. It dispatches based on `sample_type`:

- `'raw'` → read from filesystem using `samples_raw_metadata.file_path`
- `'recorded'` → read from `samples_recorded_metadata.audio_data`
- `'freesound'` → read from `samples_freesound_metadata.audio_data`
- `'derived'` → look up source + feature via `samples_features`, resolve source audio (recursive), apply transformation (slice/NMF/granularize)

Every call site that currently accesses `sample.audio_data` directly will be updated to call `resolveAudioData()` instead.

**New abstraction: type-specific store methods**

Replace the single `storeSample()` with:
- `storeRawSample(hash, filePath, sampleRate, channels, duration)` — inserts into `samples` + `samples_raw_metadata` atomically
- `storeRecordedSample(hash, name, audioData, sampleRate, channels, duration)` — inserts into `samples` + `samples_recorded_metadata` atomically
- `storeFreesoundSample(hash, url, audioData, sampleRate, channels, duration)` — inserts into `samples` + `samples_freesound_metadata` atomically
- `createDerivedSample(sourceHash, featureHash, index, sampleRate, channels, duration)` — inserts into `samples` + `samples_features` atomically, **no audio data**

All store methods use a transaction to atomically insert into the `samples` table and the corresponding metadata table.

**Derived sample hash computation**

Currently: `sha256(sourceHash:featureHash:index: + audioData)`
After: `sha256(sourceHash:featureHash:index)` — provenance-only, no audio data needed. This is a breaking change but since we're not migrating data, that's fine.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/electron/database.ts` — Schema & Data Layer

**Interfaces** (lines 15-32):
- Remove `audio_data` from `SampleRecord`
- Add `sample_type` to `SampleRecord`
- Add new interfaces: `RawSampleMetadata`, `RecordedSampleMetadata`, `FreesoundSampleMetadata`
- Update `SampleListRecord` — replace `data_size` with `sample_type`

**Migration** (new `migrate008_samplesDataModelRefactor`):
- Drop `samples`, `features`, `samples_features` tables (breaking)
- Recreate `samples` with new schema (no `file_path`, no `audio_data`, add `sample_type`)
- Recreate `features` and `samples_features` (unchanged schema, just need fresh tables since they FK to samples)
- Create `samples_raw_metadata`, `samples_recorded_metadata`, `samples_freesound_metadata`

**Methods to modify**:

| Method | Current | After |
|--------|---------|-------|
| `storeSample()` | Single method, stores audio_data | Split into `storeRawSample()`, `storeRecordedSample()`, `storeFreesoundSample()` |
| `createDerivedSample()` | Stores audio_data in samples | No audio_data; hash from provenance only; stores to `samples` + `samples_features` |
| `createSliceSamples()` | Reads source audio_data, stores slice audio | Still reads source audio (via `resolveAudioData`) for boundary validation, computes duration from onset positions, doesn't store slice audio |
| `granularize()` | Reads source audio_data, stores grain audio | Still reads source audio (for RMS threshold check), computes duration from grain params, doesn't store grain audio |
| `getSampleByHash()` | Returns audio_data | Returns metadata only (no audio_data); add `sample_type` to result |
| `getSampleByPath()` | Queries file_path on samples | Becomes `getSampleByFilePath()` — joins `samples` + `samples_raw_metadata` |
| `getDerivedSampleByIndex()` | Returns SampleRecord with audio_data | Returns metadata only (no audio_data) |
| `listSamples()` | Queries `WHERE file_path IS NOT NULL`, uses `length(audio_data)` | Queries all non-derived samples, includes `sample_type` |
| `listFeatures()` | Joins samples for file_path | Joins `samples_raw_metadata` or uses `sample_type` |

**New methods**:
- `resolveAudioData(hash: string): { audioData: Float32Array; sampleRate: number }` — type-aware audio resolution
- `getSampleByRecordingName(name: string): SampleRecord \| undefined` — queries via `samples_recorded_metadata`

#### `src/electron/ipc/audio-handlers.ts` — Audio IPC

**`read-audio-file` handler** (lines 24-123):
- When loading from filesystem: call `storeRawSample()` instead of `storeSample()` (no audio_data stored in DB)
- When loading by hash from DB: use `resolveAudioData()` to get audio (currently reads `sample.audio_data`)

**`store-recording` handler** (lines 125-160):
- Call `storeRecordedSample()` instead of `storeSample()`

**`play-sample` handler** (lines 162-201):
- Replace `deps.dbManager.getSampleByHash()` + `sample.audio_data` with `deps.dbManager.resolveAudioData()`

**`load-instrument-sample` handler** (lines 234-261):
- Replace `deps.dbManager.getSampleByHash()` + `sample.audio_data` with `deps.dbManager.resolveAudioData()`

#### `src/electron/ipc/nmf-handlers.ts` — NMF/Sep/NX IPC

**`analyze-nmf` handler** (line 60-94):
- Replace `sample.audio_data` access with `resolveAudioData()`

**`sep` handler** (lines 340-462):
- Replace `sample.audio_data` access with `resolveAudioData()`
- Update `createDerivedSample()` calls — no longer passing audio buffer

**`nx` handler** (lines 493-669):
- Replace `targetSample.audio_data` access with `resolveAudioData()`
- Update `createDerivedSample()` calls — no longer passing audio buffer

#### `src/electron/ipc/sample-handlers.ts` — Sample IPC

**`get-sample-by-name` handler** (lines 50-62):
- Currently calls `getSampleByPath(name)`. Needs to distinguish: is this a recording name or a file path?
- After refactor: call `getSampleByRecordingName(name)` for recordings

**`complete-sample-hash` handler** (lines 33-48):
- Uses `listSamples()` which changes shape — update to use new `sample_type` field instead of `file_path`

#### `src/electron/corpus-manager.ts` — Corpus Builder

**`build()` method** (lines 74-82):
- Iterates derived samples and reads `record.audio_data` for MFCC/SpectralShape analysis
- Must use `resolveAudioData()` instead

#### `src/renderer/namespaces/sample-namespace.ts` — Renderer

**`recordSample()` function** (lines 1085-1177):
- Currently sets `filePath: sampleId` on the returned Sample. After refactor, recordings don't have `filePath` — they have `name` in metadata.
- Needs a clear mapping: `Sample.filePath` continues to exist as a display concept, but the source differs by type.

**`playSlice()` and `playComponent()` functions**:
- Currently call `getDerivedSampleByIndex()` and access `derivedSample.audio_data`
- After refactor: the IPC response won't include `audio_data`
- Two options: (a) add a new IPC call `resolve-audio-data` that the renderer calls, or (b) modify `get-derived-sample-by-index` to include recomputed audio in its response
- **Decision: option (b)** — keep the existing IPC API shape, but have the main process handler resolve audio on the fly before returning

**`list()` function**:
- Currently uses `sample.file_path` for display. After refactor: need to look up display name from metadata (file_path for raw, name for recorded, url for freesound).
- Modify `listSamples()` return type to include the display identifier regardless of source.

**`bindSample()` function**:
- Currently passes `filePath`. After refactor, may also want to expose `sampleType` on the `Sample` class for display purposes.

#### `src/renderer/results/sample.ts` — Sample Class

- Consider adding `sampleType` property to the `Sample` class (optional, display-only)
- `filePath` semantics stay the same for the user (it's what they used to import/name the sample)

#### `src/electron/preload.ts` — Preload API

- No new IPC channels needed if we keep option (b) above (resolve audio server-side)
- Type changes for return values from `listSamples`, `getSampleByHash`, `getSampleByName`, `getDerivedSampleByIndex`

### Terminal UI Changes

- `sn.ls()` output may show `sample_type` as a column or visual indicator (future enhancement, not required for this refactor)
- No other terminal UI changes required

### REPL Interface Contract

None — this refactor is purely in the storage layer. The REPL-facing `Sample` class API does not change.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [x] Unit tests and/or Playwright tests are identified for `help()` output
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior

N/A — no REPL surface area changes.

### Configuration/Build Changes

None.

## Testing Strategy

### Unit Tests

- New unit tests for `resolveAudioData()` covering each sample type
- New unit tests for the type-specific store methods (`storeRawSample`, `storeRecordedSample`, `storeFreesoundSample`)
- New unit tests for `createDerivedSample()` verifying provenance-only hash and no audio storage
- New unit tests for `createSliceSamples()` verifying derived samples have no audio_data
- New unit tests for `granularize()` verifying derived samples have no audio_data

### E2E Tests

Existing Playwright tests should continue to pass after the refactor. These cover:
- `sn.read()` → load and display a sample
- `sample.onsets()` → onset analysis and slicing
- `sample.sep()` → NMF separation
- `sample.granularize()` → granularization
- Playback of samples, slices, and components
- `sn.ls()` → listing samples and features
- Recording via `mic.record()`

No new Playwright tests needed — the refactor should be invisible to the REPL user.

### Manual Testing

- Verify that `sn.read()` of a file, followed by analysis and playback of derived samples, works end-to-end
- Verify that recording with `mic.record()` stores correctly and plays back
- Verify that `sn.load(hash)` works for all sample types
- Verify that instrument sample loading works for derived samples
- Verify DB size is noticeably smaller after loading and slicing a large audio file

## Success Criteria

1. All existing Playwright tests pass
2. `audio_data` column is absent from the `samples` table
3. Each sample type (`raw`, `derived`, `recorded`, `freesound`) has appropriate metadata in its dedicated table
4. Derived samples do not store audio — it's recomputed on demand
5. Raw samples do not store audio in the DB — it's read from the filesystem
6. Recording samples store audio in `samples_recorded_metadata`
7. All playback paths (direct play, slice play, component play, instrument loading, corpus building) work correctly
8. `npm run lint` passes

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Derived audio recomputation is slow for deeply nested derivations | Playback latency | Derived samples are currently only 1 level deep (source → derived); no nesting exists. Add an in-memory cache in `resolveAudioData()` if needed. |
| NMF component recomputation is expensive (requires running BufNMF again) | Playback latency for NMF components | The `sep` and `nx` handlers already compute components and pass them to `createDerivedSample`. We can keep the audio in-memory during the session (cached in the main process) even if we don't persist it to the DB. |
| Corpus builder iterates many derived samples and resolves audio for each | Corpus build time regression | Batch the resolution — resolve source audio once, then slice in-memory for all segments. |
| File moved/deleted after `sn.read()` breaks raw sample playback | Playback fails | Show a clear error message. Future work: optional DB caching for raw samples. |
| Breaking change loses user data | User frustration | Document clearly in release notes. The app is experimental — early adopters expect this. |

## Implementation Order

### Phase 1: Schema & Types
1. Add `migrate008_samplesDataModelRefactor()` to `database.ts`
2. Update `SampleRecord` and related interfaces
3. Add new interfaces for metadata records

### Phase 2: Database Layer — Write Path
4. Implement `storeRawSample()`, `storeRecordedSample()`, `storeFreesoundSample()`
5. Update `createDerivedSample()` — provenance-only hash, no audio storage
6. Update `createSliceSamples()` — compute duration from positions, use `resolveAudioData()` for source, don't store slice audio
7. Update `granularize()` — same pattern as createSliceSamples

### Phase 3: Database Layer — Read Path
8. Implement `resolveAudioData()`
9. Update `getSampleByHash()` — no audio_data in result, add sample_type
10. Replace `getSampleByPath()` with `getSampleByFilePath()` and `getSampleByRecordingName()`
11. Update `getDerivedSampleByIndex()` — return metadata only (audio resolved separately)
12. Update `listSamples()` and `listFeatures()` for new schema

### Phase 4: IPC Handler Updates
13. Update `read-audio-file` handler — use `storeRawSample()`, use `resolveAudioData()` for hash lookups
14. Update `store-recording` handler — use `storeRecordedSample()`
15. Update `play-sample` handler — use `resolveAudioData()`
16. Update `load-instrument-sample` handler — use `resolveAudioData()`
17. Update `get-derived-sample-by-index` handler — resolve audio on the fly before returning
18. Update NMF handlers (`analyze-nmf`, `sep`, `nx`) — use `resolveAudioData()` for source audio, update `createDerivedSample()` calls
19. Update `get-sample-by-name` handler — use `getSampleByRecordingName()`
20. Update `complete-sample-hash` handler — adapt to new `listSamples()` shape
21. Update `corpus-manager.ts` — use `resolveAudioData()` for derived sample audio

### Phase 5: Renderer Updates
22. Update `playSlice()` and `playComponent()` — handle updated IPC response shape
23. Update `recordSample()` — adapt to new recording storage flow
24. Update `list()` — handle new `listSamples()` response shape
25. Update `bindSample()` — include `sampleType` if exposed

### Phase 6: Verify & Clean Up
26. Run `npm run lint` and fix any issues
27. Run existing Playwright tests via `./build.sh`
28. Manual testing of all playback paths
29. Review DB size reduction with a test corpus

## Estimated Scope

Large — this touches the core data model with cascading changes across ~10 files.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
