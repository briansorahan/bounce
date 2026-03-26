# Research: Slice Algorithms + Auto-Map to Sampler

**Spec:** specs/slice-to-sampler  
**Created:** 2026-03-26  
**Status:** Complete

## Problem Statement

Two related gaps in Bounce's audio slicing workflow:

1. **Missing slice algorithms.** Only `OnsetSlice` (spectral onset detection) is wrapped. FluCoMa provides three additional slicing algorithms — `AmpSlice` (amplitude envelope), `NoveltySlice` (spectral novelty), and `TransientSlice` (transient detection) — that are useful for different audio material. Their headers exist in `third_party/flucoma-core/` but have no native bindings, IPC channels, or REPL methods.

2. **No auto-map to sampler.** After slicing, the user must manually create a sampler and call `loadSample(note, slice)` for each slice. There is no convenience path from "I have slices" to "I have a playable sampler instrument".

## Background

Bounce already has:
- **Onset analysis:** `sample.onsetSlice()` returns a `SliceFeature` with a `slices: number[]` array of frame-index positions and a `featureHash` identifying the analysis in the DB.
- **Slice creation:** `onsets.slice()` calls `createSliceSamples(sourceHash, featureHash, audioData)` in the DB layer, which creates a derived `samples` record for every adjacent pair of onset positions and links them in `samples_features` with an `index_order`.
- **Sampler instrument:** `inst.sampler({ name, polyphony? })` returns an `InstrumentResult` with `loadSample(note, sample, opts?)`, `noteOn`, `noteOff`, `stop`, `free`.
- **DB tables:** `instruments`, `instrument_samples` (with `note_number` 0–127).
- **Native binding pattern:** `OnsetSlice` in `native/src/onset_slice.cpp` wraps `fluid::algorithm::OnsetSegmentation`, registered in `addon.cpp`, JS wrapper in `src/index.ts`.

What is **missing** is (a) native bindings + full integration for the three additional slice algorithms, (b) a rename of `OnsetFeature` → `SliceFeature` to generalize it, and (c) a `toSampler()` convenience method on `SliceFeature`.

## Related Work / Prior Art

- Standard samplers (e.g., Kontakt, EXS24, Ableton Sampler) all support "auto-map" — slicing a sample and distributing the results across a keyboard range starting from a root note.
- FluCoMa's own examples demonstrate onset slicing followed by manual playback loops; they do not have an auto-map primitive.
- FluCoMa documentation describes the four slicer algorithms as complementary tools for different types of audio material.

## FluCoMa Algorithm Details

### AmpSlice (`EnvelopeSegmentation`)
- **Header:** `third_party/flucoma-core/include/flucoma/algorithms/public/EnvelopeSegmentation.hpp`
- **Client:** `third_party/flucoma-core/include/flucoma/clients/rt/AmpSliceClient.hpp`
- **Class:** `fluid::algorithm::EnvelopeSegmentation`
- **Processing:** Sample-by-sample (`processSample`), amplitude-envelope following with dual attack/release ramps.
- **Use case:** Audio with clearly separated amplitude peaks (e.g., speech, staccato notes).
- **Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fastRampUp` | int | 1 | Fast envelope attack (samples) |
| `fastRampDown` | int | 1 | Fast envelope release (samples) |
| `slowRampUp` | int | 100 | Slow envelope attack (samples) |
| `slowRampDown` | int | 100 | Slow envelope release (samples) |
| `onThreshold` | float | 144 | Onset threshold (dB, range -144..144) |
| `offThreshold` | float | -144 | Offset threshold (dB, range -144..144) |
| `floor` | float | -144 | Noise floor (dB) |
| `minSliceLength` | int | 2 | Minimum samples between slices |
| `highPassFreq` | float | 85 | High-pass filter cutoff (Hz) |

### NoveltySlice (`NoveltySegmentation`)
- **Header:** `third_party/flucoma-core/include/flucoma/algorithms/public/NoveltySegmentation.hpp`
- **Client:** `third_party/flucoma-core/include/flucoma/clients/rt/NoveltySliceClient.hpp`
- **Class:** `fluid::algorithm::NoveltySegmentation`
- **Processing:** Frame-based (`processFrame`) on a feature vector (from STFT or other analysis).
- **Use case:** Detecting timbral or spectral change points (e.g., transitions in texture, mixed material).
- **Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `algorithm` | enum | 0 | Feature type: 0=Spectrum, 1=MFCC, 2=Chroma, 3=Pitch, 4=Loudness |
| `kernelSize` | int | 3 | Novelty kernel size (odd values only) |
| `threshold` | float | 0.5 | Detection threshold |
| `filterSize` | int | 1 | Smoothing filter size |
| `minSliceLength` | int | 2 | Minimum frames between slices |
| `windowSize` | int | 1024 | FFT window size |
| `fftSize` | int | 1024 | FFT size |
| `hopSize` | int | 512 | Hop size |

### TransientSlice (`TransientSegmentation`)
- **Header:** `third_party/flucoma-core/include/flucoma/algorithms/public/TransientSegmentation.hpp`
- **Client:** `third_party/flucoma-core/include/flucoma/clients/rt/TransientSliceClient.hpp`
- **Class:** `fluid::algorithm::TransientSegmentation` (inherits `TransientExtraction`)
- **Processing:** Block-based with configurable AR model order.
- **Use case:** Percussive material, drum loops, sharp transients.
- **Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `order` | int | 20 | AR model order (10–200) |
| `blockSize` | int | 256 | Processing block size (100–4096) |
| `padSize` | int | 128 | Padding size (0–1024) |
| `skew` | float | 0 | Detection skew (-10..10) |
| `threshFwd` | float | 2 | Forward threshold |
| `threshBack` | float | 1.1 | Backward threshold |
| `windowSize` | int | 14 | Detection window |
| `clumpLength` | int | 25 | Minimum clump length |
| `minSliceLength` | int | 1000 | Minimum slice length (samples) |

### Common Output

All four algorithms produce the same output format: **an array of sample-index positions** marking slice boundaries. This means:
- They can all share the same result type (`SliceFeature`, renamed from `OnsetFeature`).
- The `.slice()`, `.playSlice()`, `.toSampler()` methods work identically regardless of which algorithm produced the slice positions.

## Technical Constraints

- Slice positions (`slices: number[]`) are **frame indices** (not seconds). Converting to slice samples requires the source sample's sample rate.
- The `samples_features` table links source sample → slice samples via `index_order`. Slice sample hashes can be recovered from the DB given `featureHash`.
- MIDI note range is 0–127. Default `startNote` = 36 (C2, drum convention). Configurable.
- If `slice()` has not been called yet the DB will have no slice sample records. The `toSampler()` method must call `slice()` internally (transparent to user).
- Maximum 128 slices can be mapped (notes 0–127). Excess beyond `startNote + (127 - startNote)` is dropped with a warning.
- Each new algorithm needs its own C++ binding file, following the pattern of `native/src/onset_slice.cpp`.
- NoveltySlice requires STFT processing internally (it works on feature vectors, not raw audio directly). The client wrapper handles this, but our binding will need to replicate the STFT step or use the client-level API.

## Audio Processing Considerations

- AmpSlice processes sample-by-sample (very fast, minimal memory).
- NoveltySlice processes frame-by-frame with STFT (moderate CPU, needs FFT buffers).
- TransientSlice processes in blocks with AR modeling (moderate CPU, memory scales with `order` and `blockSize`).
- The auto-map (`toSampler`) operation is DB-and-IPC work, not audio DSP. It should be fast.
- Each slice loaded into the native audio engine is a PCM buffer. Memory scales linearly with total slice duration.

## Terminal UI Considerations

**REPL interface (expanded):**
```
// Existing (renamed method + result type)
samp.onsetSlice()          // → SliceFeature

// New slice methods
samp.ampSlice()            // → SliceFeature
samp.noveltySlice()        // → SliceFeature
samp.transientSlice()      // → SliceFeature

// Auto-map to sampler (works on any SliceFeature)
slices.toSampler({ name: "drums" })
slices.toSampler({ name: "keys", startNote: 60, polyphony: 8 })
```

Each method should have a `help` property with description and usage examples.

The `SliceFeature` terminal summary should show:
```
SliceFeature: 7 slices (onset-slice, threshold=0.5)
SliceFeature: 12 slices (amp-slice, onThreshold=10)
```

## Cross-Platform Considerations

- C++ code must compile on macOS, Linux, and Windows.
- FluCoMa algorithm headers are cross-platform.
- The existing `onset_slice.cpp` pattern uses portable N-API and FluCoMa APIs.

## Open Questions

All resolved during planning:

1. **`toSampler` calls `slice()` internally** — transparent, one-step. ✅
2. **Default `startNote` = 36** (C2, drum convention). ✅
3. **Overflow: warn and load what fits.** ✅
4. **REPL naming:** `sample.onsetSlice()`, `sample.ampSlice()`, `sample.noveltySlice()`, `sample.transientSlice()`. ✅
5. **Shared result type:** Rename `OnsetFeature` → `SliceFeature`. ✅
6. **Rename `sample.onsets()` → `sample.onsetSlice()`** for consistency. Clean break, no alias. ✅
7. **All methods have `help()` and tab-completion.** ✅

## Research Findings

- **`OnsetFeature.slices`** holds frame-index onset positions. The number of slices is `slices.length - 1` (N onset positions → N-1 slices between adjacent pairs).
- **`onsets.slice()`** internally calls `window.electron.sliceSamples(audio.hash, featureHash)`, which maps to `ipcMain.handle("slice-samples", ...)` → `dbManager.createSliceSamples(...)`. It returns a `BounceResult` (not the slice hashes directly).
- **Slice hashes** can be retrieved post-creation via a DB query: `getSliceSamples(featureHash)` does not currently exist, but `getSliceSamplesByFeature(featureHash)` or similar can be added.
- **`inst.sampler()` is synchronous** today; `loadSample` sends an async IPC message but returns a `BounceResult` synchronously.
- **No `toSampler`, `mapToNotes`, or `fromSlices`** method exists anywhere in the codebase.
- **FluCoMa headers for all three algorithms** exist in `third_party/flucoma-core/include/flucoma/algorithms/public/` and their client wrappers in `clients/rt/`.
- **No native bindings** exist for AmpSlice, NoveltySlice, or TransientSlice — only `OnsetSlice` is wrapped.
- **All four algorithms output the same data type** (array of sample indices), making a shared `SliceFeature` result type natural.

## Next Steps

In PLAN phase:
1. Design the C++ binding structure for each new algorithm.
2. Plan the `OnsetFeature` → `SliceFeature` rename (clean break, no aliases — unreleased project).
3. Design `toSampler()` API and wiring.
4. Identify all files needing changes across native, main process, renderer, and tests.
5. Define testing strategy (unit tests per algorithm, Playwright for end-to-end flow).
