# Research: Granularize

**Spec:** specs/granularize  
**Created:** 2026-03-08  
**Status:** Complete

## Problem Statement

Users need a way to break a sample into a series of fixed-size (or near-fixed-size) grains and store each grain as an independent sample in the database. The result should be accessible via a first-class iterator object that supports `forEach`, `map`, `filter`, and `length`, enabling composable grain manipulation in the REPL.

## Background

The existing `slice()` command already creates derived samples at onset boundaries (event-driven segmentation). `granularize` fills a different use-case: **regular, time-based segmentation**. This is the foundation for granular synthesis workflows — users can granularize a source sample, inspect/filter individual grains in the REPL, and feed them into playback or analysis pipelines.

## Related Work / Prior Art

- **FluCoMa BufCompose** — copies/slices regions of a buffer; would be useful for extracting individual grains.
- **Max/MSP `groove~` / `munger~`** — classic granular synthesis objects; grain size, overlap, and envelope are the standard parameters.
- **SuperCollider `GrainBuf`** — grain duration, trigger rate, and window type are the key controls.
- **Existing `slice()` in Bounce** — uses `createSliceSamples` / `createDerivedSample` database path; `granularize` should follow the same storage pattern.

## FluCoMa Algorithm Details

No new FluCoMa algorithms are required. Grain extraction is straightforward audio buffer slicing:

1. Compute grain start positions from `grainSize`, `hopSize`, `startTime`, `endTime`, and `jitter`.
2. Store each **raw** grain (no windowing) via the existing `createDerivedSample` database API.
3. Window functions are applied at **playback time**, not at storage time.

Rationale: storing raw PCM preserves the canonical audio data. The `windowType` option is a rendering concern — applying it at playback time allows users to change the envelope without re-granularizing, and makes grains reusable for analysis or other purposes beyond granular synthesis.

## Technical Constraints

- All grain storage must use the existing `createDerivedSample` IPC path so grains appear alongside other derived samples.
- The `granularize` function lives in the renderer process (`bounce-api.ts`) and communicates with main via IPC.
- Grain windowing happens before storage; stored audio is the windowed PCM.
- The `GrainCollection` return type must be serializable enough to reconstruct from database results (hashes).

## Audio Processing Considerations

- **Input limit:** source samples longer than 20 seconds are rejected with an error. At 20ms grains with no overlap this caps the collection at 1,000 grains.
- **Silence threshold:** grains whose RMS falls below `silenceThreshold` (dBFS, default -60) are not stored. Their `index_order` slot is still reserved so positional structure is preserved. Set to `-Infinity` to disable. RMS in dBFS: `20 * log10(rms)` where `rms = sqrt(mean(samples²))`.
- **Grain size units:** milliseconds. Conversion to samples: `Math.round(ms * sampleRate / 1000)`.
- **Hop size:** defaults to `grainSize` (non-overlapping). Values < `grainSize` produce overlapping grains; this is fine for storage purposes.
- **Last grain:** if the final grain would extend beyond the sample end, it is either padded with silence or dropped. Dropping is simpler and preferred.
- **Windowing:** applied at playback time, not at storage time. Raw PCM is stored. Any playback helper that renders grains is responsible for applying an envelope.
- **Normalize:** per-grain RMS normalization applied at playback time alongside windowing; optional, defaults `false`.
- **Memory:** for a 30-second sample at 44100 Hz stereo with 50 ms grains and no overlap, ~600 grains × 4410 samples × 2 channels × 4 bytes ≈ ~21 MB total. Acceptable.

## Terminal UI Considerations

- `granularize(...)` should print a summary line on completion: e.g. `Granularized <hash> → 600 grains`.
- The returned `GrainCollection` should have a useful `.toString()` (inherited from `BounceResult` pattern) for incidental display.
- No waveform visualization is needed for MVP; grains can be played individually with `play()`.

## Cross-Platform Considerations

- Pure TypeScript implementation; no platform-specific concerns.
- Window math and buffer slicing are platform-agnostic.

## Open Questions

_All resolved during design discussion:_

- ✅ **Units for grainSize/hopSize:** milliseconds.
- ✅ **Source argument:** optional `source` (string hash or `AudioResult`); falls back to current sample if omitted.
- ✅ **Iterator interface:** `forEach` (sequential, async), `map`, `filter`, `length`.
- ✅ **forEach semantics:** sequential — awaits each callback before calling the next.

## Research Findings

1. Grain storage can reuse `createDerivedSample` (IPC channel `create-derived-sample`) unchanged.
2. No C++ changes are required; windowing and slicing are trivial in TypeScript.
3. The `GrainCollection` should hold grain `AudioResult` objects constructed from stored hashes, consistent with how `playSlice` / `playComponent` return `AudioResult`.
4. `filter` should return a new `GrainCollection` (same interface, composable). `map` transforms to an arbitrary type `T` so it returns `T[]`.
5. The existing `samples_features` junction table already supports tracking provenance (source hash → derived grain hashes); no schema changes are needed.

## Next Steps

- Define the full TypeScript API surface in PLAN.md.
- Identify all files that need changes.
- Outline the IPC flow for grain creation and the `GrainCollection` class design.
