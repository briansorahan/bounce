# Research: Granularize Effect (Audio Editor Workflow)

**Spec:** specs/granularize-effect  
**Beads Parent Issue:** bounce-e1f  
**Created:** 2026-04-26  
**Status:** In Progress

## Problem Statement

Bounce currently supports granular synthesis through two paths:

1. **`sample.granularize()`** — Decomposes a sample into individual grains stored as derived samples. Returns a `GrainCollection` of separate `SampleResult` objects. This is an analysis/extraction tool.
2. **`inst.granular()`** — Creates a real-time granular instrument that must be played with `noteOn`/`noteOff`. This is a performance tool.

Neither path provides a way to **resynthesize** grains back into a single processed sample. Users who want to apply granular processing as an effect — time-stretching, texture creation, grain density manipulation — must set up an instrument, play notes, and record the output. This is cumbersome for sound design and batch processing workflows.

**User need:** After decomposing a sample into grains, call `grains.bounce({ density: 20, pitch: 1.2 })` to resynthesize the grains into a new `SampleResult` — playable, saveable, and chainable with other operations.

## Background

The natural workflow is a two-step pipeline:

```typescript
const grains = sample.grains({ grainSize: 50 })  // step 1: decompose
const result = grains.bounce({ density: 20, pitch: 1.2, duration: 10 })  // step 2: resynthesize
```

Or fully chained:

```typescript
const res = sn.load("foo").grains().bounce({ pitch: 1.2 })
vis.waveform(res).show()
res.play()
```

This separates concerns cleanly:
- **Grain extraction** (`grains()`) controls *what* grains are extracted — grain size, hop, jitter, silence filtering
- **Resynthesis** (`bounce()`) controls *how* grains are reassembled — density, pitch, envelope, output duration

The intermediate `GrainCollection` is inspectable and filterable, so users can curate grains before resynthesizing. This composability is a strength over a single monolithic "granular effect" function.

**Key design decisions (confirmed with user):**
- Rename existing `sample.granularize()` → `sample.grains()` (shorter, cleaner)
- `bounce()` is a method on `GrainCollection`, not a new top-level `sn.*` method
- `GrainCollectionPromise` must proxy `bounce()` so chaining works without `await`
- Output duration matches input by default, but can be overridden (enables time-stretching)
- No real-time preview — process and return
- Name "bounce" is on-brand with the application name

## Related Work / Prior Art

### Audio Software with Granular Effects

- **Ableton Live's Granulator II (Max for Live):** Real-time granular instrument, but also has a "freeze" mode that captures a moment and granularizes it. Parameters: grain size, density, position, pitch, spray (scatter).
- **Cecilia5 (Python/Csound):** Granular effects as offline processors. Apply grain parameters, render to new file.
- **Paul Stretch:** Extreme time-stretching via granular overlap-add. Input → parameters → output file.
- **SuperCollider GrainBuf:** Real-time UGen, but commonly used in NRT (non-real-time) synthesis for offline rendering.
- **AudioSculpt (IRCAM):** Granular resynthesis as an editing operation on spectral data.

### Common Parameter Sets Across Tools

| Parameter | Paul Stretch | Granulator II | Cecilia5 | Our Proposal |
|-----------|-------------|--------------|----------|-------------|
| Grain size | ✓ | ✓ | ✓ | ✓ (in granularize step) |
| Density/overlap | ✓ | ✓ | ✓ | ✓ (in bounce step) |
| Pitch | ✗ | ✓ | ✓ | ✓ (in bounce step) |
| Position scatter | ✗ | ✓ (spray) | ✓ | ✓ (in granularize step) |
| Window/envelope | ✓ | ✗ (fixed Hann) | ✓ | ✓ (in bounce step) |
| Time stretch | ✓ (primary) | ✗ | ✓ | ✓ (via duration in bounce step) |
| Reverse grains | ✗ | ✗ | ✓ | Deferred |

## FluCoMa Algorithm Details

This feature does not directly use FluCoMa algorithms. It adds an overlap-add resynthesis step to the existing `GrainCollection`. However, the output samples can be further analyzed with FluCoMa tools (MFCC, spectral shape, etc.), making this a natural part of the corpus analysis pipeline.

## Technical Constraints

### Existing Infrastructure to Reuse

1. **`GrainCollection`** (`src/renderer/grain-collection.ts`) — The class that will gain the new `bounce()` method. Already stores grain references, source hash, and supports filtering.

2. **`computeGrains()` in `src/electron/services/granularize/index.ts`** — Pure synchronous function that computes grain start positions, applies jitter, filters silent grains, and derives hashes. The grain positions stored in `GrainCollection` were computed by this function.

3. **Audio resolver** (`src/electron/audio-resolver.ts`) — Resolves sample hashes to PCM data. Handles raw, derived, recorded, and freesound sample types.

4. **Derived sample storage** — Database schema already supports `sample_type='derived'` for programmatically-created samples.

5. **IPC contract** — Existing `granularize-sample` channel and RPC infrastructure.

### What Needs to Be Built

The **resynthesis engine** — the core new code. Given grain audio data, reconstruct a single output buffer by:

1. Resolving each grain's audio data from the source sample
2. Applying a window envelope (Hann, Hamming, Triangle, or Tukey)
3. Optionally pitch-shifting each grain (via playback rate / linear interpolation)
4. Placing grains into the output buffer at computed positions (overlap-add)
5. Returning the complete output as a single `Float32Array`

### Architecture Fit

This fits cleanly into the three-process model:
- **Renderer** calls `grains.bounce()` which sends an IPC request
- **Main process** resolves source audio, delegates resynthesis computation
- **Worker** (existing granularize worker) performs the overlap-add resynthesis
- **Audio engine** is not involved (offline processing, not real-time)

## Audio Processing Considerations

### Overlap-Add Resynthesis

The standard approach for granular resynthesis is overlap-add (OLA):

1. **Output buffer allocation:** `outputLength = ceil(outputDuration * sampleRate)`
2. **Grain placement:** Each grain is windowed and added to the output at its target position
3. **Normalization:** After all grains are placed, optionally normalize to prevent clipping

**Memory budget for a typical operation:**
- 30-second mono source @ 44.1 kHz = 5.3 MB (source)
- 30-second mono output @ 44.1 kHz = 5.3 MB (output)
- Grain window LUT: 4 KB
- Peak memory: ~11 MB — well within desktop constraints

### Grain Scheduling for Output

The grains in `GrainCollection` already have defined positions in the source. The `bounce()` method needs to determine where to place each grain in the *output*:

- **Output placement interval:** `outputHop = sampleRate / density` samples between grains
- When `outputDuration` equals input duration and density matches the natural hop rate, the output sounds like a granular reconstruction of the input
- When they differ, you get time-stretching or density effects

### Source Grain Selection

With N source grains and M output grain slots, source grains are selected by linearly mapping output position to source grain index. This naturally handles time-stretching: longer output = each source grain used multiple times.

### Pitch Shifting

Per-grain pitch shifting via playback rate change (same technique as `GranularInstrument` C++):
- `playbackRate = pitch` (1.0 = original pitch)
- Read source samples with fractional increment, linear interpolation
- Grain output length stays the same; source traversal speed changes

### Window Envelopes

Reuse the same envelope types as the C++ granular instrument:
- **0 = Hann** (default) — smooth, minimal spectral leakage
- **1 = Hamming** — slightly narrower main lobe
- **2 = Triangle** — simple, efficient
- **3 = Tukey** — flat top with tapered edges (good for preserving transients)

### Sample Rate

Output sample rate always matches input sample rate. No resampling needed.

## Terminal UI Considerations

### REPL API Surface

**New method on `GrainCollection`:**
```typescript
grains.bounce(options?: BounceGrainsOptions): SamplePromise
```

This returns a `SamplePromise` (not another `GrainCollection`), consistent with other sample-producing methods.

### REPL Interface Contract

- `grains.bounce.help()` — must document all parameters with defaults and ranges
- The returned `SampleResult` uses the existing `toString()` display — no new result type needed
- Tab completion for `BounceGrainsOptions` keys

### Terminal Output

Processing feedback via `terminal.writeln()`:
```
Bounce: 500 grains → 50ms @ 20/s, pitch 1.2x → 3.5s
```

The returned `SampleResult` displays normally (hash, duration, channels, sample rate).

## Cross-Platform Considerations

No platform-specific concerns. All computation is pure TypeScript/JavaScript math operating on `Float32Array` buffers.

## Open Questions

All resolved during user discussion:

1. ~~Should this be a top-level `sn.*` method or a method on `GrainCollection`?~~ → **Method on `GrainCollection`** — composable pipeline: `sample.granularize().bounce()`
2. ~~What should the method be called?~~ → **`bounce()`** — short, on-brand
3. ~~Should output duration match input?~~ → **Match by default, allow override**
4. ~~Where does computation run?~~ → Main process or existing worker, same as `granularize-sample`

## Research Findings

1. **The resynthesis engine is the only significant new code.** Everything else — grain computation, audio resolution, sample storage, IPC, REPL patterns — already exists.

2. **Overlap-add is the right approach.** It's well-understood, deterministic, and efficient for offline granular resynthesis.

3. **Adding `bounce()` to `GrainCollection` is the cleanest design.** It extends the existing granularize pipeline without adding new top-level API surface. The two-step workflow (grains → bounce) separates extraction concerns from resynthesis concerns.

4. **Renaming `granularize()` to `grains()` is a breaking change** but is worthwhile for a cleaner API. All references in `SampleResult`, `SamplePromise`, `CurrentSamplePromise`, `sample-namespace.ts`, `repl-environment.d.ts`, `repl-registry.generated.ts`, `opts-docs.ts`, and tests need updating.

5. **A new options type (`BounceGrainsOptions`) is needed** for the resynthesis parameters: `density`, `pitch`, `envelope`, and `duration`. These don't overlap with `GranularizeOptions`.

6. **TypeScript implementation is sufficient.** The overlap-add resynthesis is straightforward math on `Float32Array` — no need for C++ native code.

7. **GrainCollection needs access to IPC** to send audio data to the worker for resynthesis. Currently it's a pure data class. It will need a reference to `window.electron` (or a callback) to perform the bounce operation.

8. **`GrainCollectionPromise` must proxy `bounce()`** so that `sample.grains().bounce()` chains without an explicit `await`. This follows the same pattern `SamplePromise` uses to proxy `SampleResult` methods.

## Next Steps

In the PLAN phase:

1. Define the `BounceGrainsOptions` interface with all parameters, defaults, and ranges
2. Design the resynthesis engine (overlap-add algorithm)
3. Design how `GrainCollection` gains access to IPC (constructor injection or callback)
4. Plan the `granularize()` → `grains()` rename across all files
5. Plan `GrainCollectionPromise.bounce()` proxy
6. Define the RPC contract extension
7. Plan the IPC flow and handler wiring
8. Specify REPL integration (help, tab completion, display)
9. Define testing strategy (unit tests for the engine, Playwright for REPL)
10. Create beads task graph with dependencies
