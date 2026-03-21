# Implementation: Samples Data Model Refactor

**Spec:** specs/samples-data-model-refactor  
**Created:** 2026-03-21  
**Status:** In Progress

## Context

Breaking refactor of the samples data model: replace overloaded `samples` table with `sample_type` discriminator column, per-type metadata tables (`samples_raw_metadata`, `samples_recorded_metadata`, `samples_freesound_metadata`), and on-demand audio resolution instead of storing audio blobs. See PLAN.md for full details.

## Implementation Log

### 2026-03-21 - Full Implementation

**Phase 1: Schema & Types (database.ts)**
- Added `SampleType = "raw" | "derived" | "recorded" | "freesound"`
- Updated `SampleRecord` (removed `audio_data`, `file_path`; added `sample_type`)
- Updated `SampleListRecord` (removed `data_size`, `file_path`; added `sample_type`, `display_name`)
- Updated `FeatureListRecord` (`file_path` → `display_name`)
- Updated `DerivedSampleSummary` (`source_file_path` → `source_display_name`)
- Added `RawSampleMetadata`, `RecordedSampleMetadata`, `FreesoundSampleMetadata` interfaces
- Created `migrate009_samplesDataModelRefactor()` — drops/recreates samples, features, samples_features; creates 3 metadata tables; clears instrument_samples

**Phase 2: Write Path**
- Replaced `storeSample()` with `storeRawSample()`, `storeRecordedSample()`, `storeFreesoundSample()` — all use single transactions for atomicity
- Updated `createDerivedSample()` — provenance-only hash (`sha256(sourceHash:featureHash:index)`), no audio storage
- Updated `createSliceSamples()` — accepts `sourceAudio` param (for future use), computes duration from positions
- Updated `granularize()` — accepts `sourceAudio` param, no grain audio storage

**Phase 3: Read Path**
- Created `src/electron/audio-resolver.ts` with `resolveAudioData()` function
  - Raw: reads from filesystem via `getRawMetadata().file_path`
  - Recorded: returns `audio_data` from `getRecordedMetadata()`
  - Freesound: returns `audio_data` from `getFreesoundMetadata()`
  - Derived (onset/granularize): recursively resolves source audio, slices by positions
  - Derived (nmf-sep/nmf-cross): throws error (requires native recomputation)
- Added `getRawMetadata()`, `getRecordedMetadata()`, `getFreesoundMetadata()`, `getDerivedSampleLink()`
- Updated `getSampleByHash()`, `listSamples()`, `listFeatures()`, `listDerivedSamplesSummary()` — join metadata tables for `display_name`
- Replaced `getSampleByPath()` with `getSampleByFilePath()` and `getSampleByRecordingName()`

**Phase 4: IPC Handlers**
- `audio-handlers.ts`: `read-audio-file` uses `storeRawSample()`, `store-recording` uses `storeRecordedSample()`, `play-sample` and `load-instrument-sample` use `resolveAudioData()`
- `sample-handlers.ts`: `get-sample-by-hash` enriches response with `display_name`, `get-sample-by-name` tries recording then file path, `create-slice-samples` resolves audio first, `get-derived-sample-by-index` resolves audio server-side
- `nmf-handlers.ts`: `executeAnalyzeNmf`, `executeSep`, `executeNx` all use `resolveAudioData()` instead of `sample.audio_data`
- `corpus-handlers.ts`: `corpus-build` awaits now-async `build()`

**Phase 5: Renderer & Shared Types**
- Updated `src/renderer/types.d.ts`: `SampleData`, `SampleListData`, `FeatureListData`, `DerivedSampleSummaryData` all match new schema
- Updated `src/shared/ipc-contract.ts`: `SampleRecord`, `SampleListRecord`, `FeatureListRecord`, `DerivedSampleSummary`, `SampleByNameResult` all match new schema
- Updated `src/renderer/namespaces/sample-namespace.ts`: `list()` uses `display_name`, `current()` uses `display_name`
- `playSlice()`/`playComponent()` unchanged — `get-derived-sample-by-index` handler resolves audio server-side

**Phase 6: Verification**
- Updated `src/database-projects.test.ts` to use `storeRawSample()` instead of removed `storeSample()`
- All lint passes (0 errors)
- Both TypeScript builds pass (electron + renderer)
- All unit tests pass (`npm test`, `database-projects.test.ts`)
- Pre-existing test failures in `ipc-contract.test.ts` and `repl-evaluator.test.ts` (from other concurrent feature work, not this refactor)

## Decisions Made

1. **`resolveAudioData()` is standalone, not a DatabaseManager method** — keeps DB layer synchronous and pure data access
2. **`get-derived-sample-by-index` resolves audio server-side** — renderer code sees same Buffer shape, avoiding cascading renderer changes
3. **`get-sample-by-hash` enriches response with `display_name`** — joins raw/recorded metadata on the fly so renderer has a name to display
4. **`createSliceSamples()` keeps `sourceAudio` param** — even though unused in current implementation, maintains the interface for future use
5. **NMF component audio resolution throws error** — too expensive for on-demand recomputation without native addon; users must re-run `sep()`/`nx()`

## Deviations from Plan

1. **Migration number**: Plan said `migrate009` which was correct after discovering the other agent added `migrate008`
2. **`createSliceSamples` sourceAudio param**: Kept as `_sourceAudio` (unused) rather than removing it, to maintain API surface for potential future use
3. **`SampleByNameResult` in ipc-contract.ts**: Added `display_name` field not originally planned

## Flaws Discovered in Previous Phases

None — RESEARCH.md and PLAN.md were comprehensive and accurate.

## Issues & TODOs

- NMF component audio requires full native recomputation — current implementation throws. Future: add session-level in-memory cache of NMF outputs.
- Granularize grain duration estimation uses position gaps as approximation, which may not match the original `grainSize` parameter exactly.
- Freesound integration not yet implemented (no `storeFreesoundSample()` call sites yet — this is expected, it's future work).

## Testing Results

| Test | Status |
|------|--------|
| `npm run lint` | ✅ 0 errors |
| `npx tsc -p tsconfig.electron.json --noEmit` | ✅ Clean |
| `npx tsc -p tsconfig.renderer.json --noEmit` | ✅ Clean |
| `npm test` | ✅ All pass |
| `database-projects.test.ts` | ✅ Pass |
| `ipc-contract.test.ts` | ⚠️ Pre-existing count mismatch (not our changes) |
| `repl-evaluator.test.ts` | ⚠️ Pre-existing `nx` reserved name failure (not our changes) |
| `./build.sh` (Playwright) | 🔲 Not yet run |

## Status Updates

### Last Status: 2026-03-21

**What's Done:**
- All 6 phases complete: schema, write path, read path, IPC handlers, renderer/shared types, verification
- All lint and TypeScript builds pass
- All non-pre-broken unit tests pass

**What's Left:**
- Run `./build.sh` for Playwright e2e tests
- Update `ARCHITECTURE.md` if schema documentation needs refreshing

**Next Steps:**
- Run Dockerized Playwright tests to verify end-to-end functionality
- Review ARCHITECTURE.md for accuracy

**Blockers/Notes:**
- Two pre-existing test failures from concurrent feature work (not blockers for this refactor)

---

## Final Status

<!-- When work is complete, summarize outcome -->

**Completion Date:** TBD

**Summary:**

**Verification:**
- [ ] Linting passed
- [ ] TypeScript builds
- [ ] Tests pass
- [ ] Manual testing complete
- [ ] Cross-platform tested (if applicable)

**Known Limitations:**

**Future Improvements:**
