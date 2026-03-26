# Plan: Slice Algorithms + Auto-Map to Sampler

**Spec:** specs/slice-to-sampler  
**Created:** 2026-03-26  
**Status:** In Progress

## Context

Only `OnsetSlice` is wrapped as a native binding. Three additional FluCoMa slicing algorithms — `AmpSlice`, `NoveltySlice`, and `TransientSlice` — exist in `third_party/flucoma-core/` but have no native bindings. All four produce the same output (array of sample-index positions), so they share a common result type. Additionally, there is no convenience method to auto-map slices to a sampler instrument.

Decisions:
- `toSampler()` lives on the slice feature result; calls `slice()` internally.
- Default `startNote` = 36 (C2). Overflow: warn and load what fits.
- REPL naming: `sample.ampSlice()`, `sample.noveltySlice()`, `sample.transientSlice()`.
- Rename `OnsetFeature` → `SliceFeature` to generalize across all algorithms.

## Approach Summary

Three workstreams:

**A. New native bindings** — Wrap `EnvelopeSegmentation` (AmpSlice), `NoveltySegmentation` (NoveltySlice), and `TransientSegmentation` (TransientSlice) as N-API classes following the `onset_slice.cpp` pattern.

**B. Rename `OnsetFeature` → `SliceFeature`** — Rename the class and all references. Keep `"onset-slice"` as the `featureType` string for the existing algorithm; add `"amp-slice"`, `"novelty-slice"`, `"transient-slice"` as new feature types.

**C. Add `toSampler()`** — Add a method on `SliceFeature` that calls `slice()`, retrieves slice sample hashes via a new IPC channel, creates a sampler, and loads all slices at consecutive MIDI notes.

## Architecture Changes

- **3 new C++ files** in `native/src/`: `amp_slice.cpp`, `novelty_slice.cpp`, `transient_slice.cpp`.
- **`native/src/addon.cpp`**: Register three new init functions.
- **`binding.gyp`**: Add three new source files.
- **`src/index.ts`**: Add JS wrapper classes `AmpSlice`, `NoveltySlice`, `TransientSlice`.
- **IPC layer**: 3 new `analyze-*` channels + 1 new `get-slice-samples` channel.
- **Renderer**: `SliceFeature` (renamed), 3 new methods on `Sample`, `toSampler()` on `SliceFeature`.

No changes to the native audio engine (playback/sampler).

## Changes Required

### Native C++ Changes

**`native/src/amp_slice.cpp`** (new)
- Wrap `fluid::algorithm::EnvelopeSegmentation` from `EnvelopeSegmentation.hpp`.
- Class `AmpSlice` with `Init`, constructor, `Process`, `Reset`.
- Constructor takes options: `fastRampUp`, `fastRampDown`, `slowRampUp`, `slowRampDown`, `onThreshold`, `offThreshold`, `floor`, `minSliceLength`, `highPassFreq`.
- `Process(Float32Array)` → sample-by-sample processing → returns `number[]` of onset positions.

**`native/src/novelty_slice.cpp`** (new)
- Wrap `fluid::algorithm::NoveltySegmentation` from `NoveltySegmentation.hpp`.
- Must also perform STFT internally (NoveltySegmentation operates on feature vectors, not raw audio). Use `fluid::algorithm::STFT` to compute magnitude spectrum, then feed to `NoveltySegmentation.processFrame()`.
- Constructor takes options: `algorithm`, `kernelSize`, `threshold`, `filterSize`, `minSliceLength`, `windowSize`, `fftSize`, `hopSize`.
- `Process(Float32Array)` → frame-by-frame processing → returns `number[]` of onset positions.

**`native/src/transient_slice.cpp`** (new)
- Wrap `fluid::algorithm::TransientSegmentation` from `TransientSegmentation.hpp`.
- Constructor takes options: `order`, `blockSize`, `padSize`, `skew`, `threshFwd`, `threshBack`, `windowSize`, `clumpLength`, `minSliceLength`.
- `Process(Float32Array)` → block-based processing → returns `number[]` of onset positions.

**`native/src/addon.cpp`** (modify)
- Add `InitAmpSlice`, `InitNoveltySlice`, `InitTransientSlice` declarations and calls.

**`binding.gyp`** (modify)
- Add 3 new source files to the `flucoma_native` target.

### TypeScript Changes

**`src/index.ts`** (modify)
- Add `AmpSlice`, `NoveltySlice`, `TransientSlice` JS wrapper classes matching the `OnsetSlice` pattern.
- Each has a constructor taking algorithm-specific options and a `process(audioBuffer)` method returning `number[]`.

**`src/electron/ipc/analysis-handlers.ts`** (modify)
- Add `ipcMain.handle("analyze-amp-slice", ...)` — instantiates `AmpSlice`, calls `.process()`, returns `number[]`.
- Add `ipcMain.handle("analyze-novelty-slice", ...)` — same for `NoveltySlice`.
- Add `ipcMain.handle("analyze-transient-slice", ...)` — same for `TransientSlice`.
- Add `ipcMain.handle("get-slice-samples", ...)` — queries DB for slice sample hashes by `featureHash`.
- Use string literals for channel names (NOT IpcChannel enum — project convention for main process).

**`src/electron/database.ts`** (modify)
- Add `getSliceSamplesByFeatureHash(featureHash: string): { hash: string; index: number }[]`.
- Queries `samples_features JOIN samples` filtering by `feature_hash`, ordered by `index_order`.

**`src/electron/preload.ts`** (modify)
- Add `analyzeAmpSlice`, `analyzeNoveltySlice`, `analyzeTransientSlice` IPC invocations.
- Add `getSliceSamples(featureHash)` IPC invocation.

**`src/shared/ipc-contract.ts`** (modify)
- Add `AmpSliceOptions`, `NoveltySliceOptions`, `TransientSliceOptions` interfaces.
- Add channel definitions for 4 new IPC channels.

**`src/renderer/results/features.ts`** (modify)
- Rename `OnsetFeature` → `SliceFeature`.
- Add `export { SliceFeature as OnsetFeature }` alias for backwards compat.
- Add `toSampler(opts: ToSamplerOptions): Promise<InstrumentResult>` method.
- Add `ToSamplerOptions` interface: `{ name: string; startNote?: number; polyphony?: number }`.
- Update `OnsetFeaturePromise` → `SliceFeaturePromise` (with alias).

**`src/renderer/namespaces/sample-namespace.ts`** (modify)
- Add `ampSlice(options?)`, `noveltySlice(options?)`, `transientSlice(options?)` methods on the Sample binding.
- Each calls the corresponding `window.electron.analyze*` IPC, stores feature, returns `SliceFeature`.
- Wire `toSampler` binding into `bindSliceFeature` (renamed from `bindOnsetFeature`).

**`src/renderer/bounce-globals.d.ts`** (modify)
- Add `AmpSliceOptions`, `NoveltySliceOptions`, `TransientSliceOptions` interfaces.

**`src/renderer/bounce-result.ts`** (modify, if thenable wrappers exist here)
- Rename `OnsetFeaturePromise` → `SliceFeaturePromise` (with alias).

### Terminal UI Changes

`SliceFeature` terminal summary shows the algorithm name:
```
SliceFeature: 7 slices (onset-slice, threshold=0.5)
SliceFeature: 12 slices (amp-slice, onThreshold=10)
SliceFeature: 5 slices (novelty-slice, algorithm=Spectrum)
SliceFeature: 9 slices (transient-slice, threshFwd=2)
```

`toSampler` returns an existing `InstrumentResult`:
```
drums (sampler, 7 notes loaded, polyphony 16)
```
With overflow warning prepended if slices are dropped:
```
Warning: 4 slices beyond note 127 were dropped.
drums (sampler, 88 notes loaded, polyphony 16)
```

### REPL Interface Contract

**New API surface on `Sample`:**
```typescript
samp.ampSlice()                // → SliceFeature
samp.ampSlice({ onThreshold: 10, fastRampUp: 5 })
samp.noveltySlice()            // → SliceFeature
samp.noveltySlice({ algorithm: 0, kernelSize: 5 })
samp.transientSlice()          // → SliceFeature
samp.transientSlice({ order: 40, threshFwd: 3 })
```

**New method on `SliceFeature` (all algorithms):**
```typescript
slices.toSampler({ name: "drums" })
slices.toSampler({ name: "keys", startNote: 60, polyphony: 8 })
```

**Renamed type:**
```typescript
// Old: OnsetFeature  → New: SliceFeature (OnsetFeature kept as alias)
samp.onsets()  // → SliceFeature (was OnsetFeature)
```

**help() methods:**
- `samp.ampSlice.help()` — describes parameters and usage
- `samp.noveltySlice.help()` — describes parameters and usage
- `samp.transientSlice.help()` — describes parameters and usage
- `slices.toSampler.help()` — describes startNote, polyphony, usage examples

#### REPL Contract Checklist

- [x] Every exposed method has a `help()` entry point
- [x] Every returned SliceFeature displays algorithm type and slice count
- [x] InstrumentResult (from toSampler) already displays name, kind, notes-loaded
- [x] Unit tests identified for each algorithm integration and toSampler arithmetic
- [x] Playwright tests identified for REPL flow

### Configuration/Build Changes

**`binding.gyp`**: Add `native/src/amp_slice.cpp`, `native/src/novelty_slice.cpp`, `native/src/transient_slice.cpp` to sources.

No new npm dependencies. `npm run rebuild` required after C++ changes.

## Testing Strategy

### Unit Tests

**`src/amp-slice.test.ts`** (new)
- Construct `AmpSlice` with default options, process a synthetic signal with clear amplitude peaks, verify returned positions are sensible.

**`src/novelty-slice.test.ts`** (new)
- Construct `NoveltySlice` with default options, process a synthetic signal, verify returned positions.

**`src/transient-slice.test.ts`** (new)
- Construct `TransientSlice` with default options, process a synthetic signal with transients, verify returned positions.

**`src/slice-to-sampler.test.ts`** (new)
- Test note-mapping arithmetic: N slices + startNote → correct MIDI note assignments.
- Test overflow: startNote=100, 40 slices → only 28 loaded, warning in display.
- Test zero-slice edge case: ≤1 onset position → error result.

**Existing onset tests** — verify they still pass after `OnsetFeature` → `SliceFeature` rename.

### E2E Tests

**`tests/slice-to-sampler.spec.ts`** (new)
- Load a sample, call `samp.onsets().toSampler({ name: "test" })`, verify REPL output has instrument name + note count > 0.
- Call `toSampler.help()`, verify help output.

**`tests/amp-slice.spec.ts`** (new)
- Load a sample, call `samp.ampSlice()`, verify SliceFeature output with slice count.
- Call `ampSlice.help()`, verify help output.

**`tests/novelty-slice.spec.ts`** (new)
- Same pattern as amp-slice.

**`tests/transient-slice.spec.ts`** (new)
- Same pattern as amp-slice.

**Existing onset-analysis.spec.ts** — verify still passes after rename.

### Manual Testing

- `npm run dev:electron`, load a drum loop, run all 4 slice methods, verify results.
- Run `slices.toSampler({ name: "kit" })` and play notes 36–43.

## Success Criteria

1. `samp.ampSlice()`, `samp.noveltySlice()`, `samp.transientSlice()` work end-to-end, returning `SliceFeature`.
2. `samp.onsets()` still works, returning `SliceFeature` (backwards-compatible).
3. `slices.toSampler({ name })` works on any `SliceFeature`, regardless of which algorithm produced it.
4. Each new method has `help()` with description and usage examples.
5. MIDI note mapping starts at `startNote` (default 36), correctly assigns consecutive notes.
6. Overflow warns and loads what fits.
7. All unit tests pass; all Playwright e2e tests pass via `./build.sh`.
8. Existing tests (especially `onset-analysis.spec.ts`) are unbroken.

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| NoveltySlice needs STFT pre-processing not obvious from algorithm header | Study `NoveltySliceClient.hpp` for the full processing chain; replicate STFT step in the C++ binding |
| TransientSegmentation inherits from TransientExtraction — complex init | Study the class hierarchy carefully; test with simple signals first |
| `OnsetFeature` → `SliceFeature` rename breaks existing user scripts | Export alias `OnsetFeature = SliceFeature`; update existing tests gradually |
| C++ compilation issues on Linux (CI) | Test via `./build.sh` (Docker) early; don't defer to the end |
| Main-process handler uses IpcChannel enum (breaks CJS build) | Use string literals per project convention |

## Implementation Order

1. **C++ bindings**: `amp_slice.cpp`, `novelty_slice.cpp`, `transient_slice.cpp` + `addon.cpp` + `binding.gyp`. Run `npm run rebuild` to verify compilation.
2. **JS wrappers**: `AmpSlice`, `NoveltySlice`, `TransientSlice` classes in `src/index.ts`.
3. **Unit tests** for native bindings: `amp-slice.test.ts`, `novelty-slice.test.ts`, `transient-slice.test.ts`.
4. **IPC channels**: analysis handlers + `get-slice-samples` handler.
5. **Preload**: expose new IPC methods.
6. **Rename `OnsetFeature` → `SliceFeature`** across renderer code + maintain alias.
7. **`toSampler()`**: add to `SliceFeature`, wire bindings in sample namespace.
8. **New Sample methods**: `ampSlice()`, `noveltySlice()`, `transientSlice()` on Sample binding.
9. **Help text**: for all new methods.
10. **Unit test**: `slice-to-sampler.test.ts`.
11. **E2E tests**: Playwright specs for each new method + toSampler.
12. **`./build.sh`**: Full suite verification.

## Estimated Scope

Large (~15–20 files across C++, TypeScript main/renderer/shared, and tests).

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility (alias `OnsetFeature = SliceFeature`, no existing API removed)
- [x] All sections agree on the data model (reuses existing DB tables, adds `getSliceSamplesByFeatureHash` query, new feature types `"amp-slice"`, `"novelty-slice"`, `"transient-slice"`)
- [x] REPL-facing changes define help() surface and SliceFeature/InstrumentResult terminal summaries
- [x] Testing strategy names unit and Playwright coverage for each algorithm, toSampler, and rename compatibility
- [x] No contradictory constraints between sections
- [x] `startNote` default (36) is consistent throughout
