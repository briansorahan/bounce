# Research: Granularize Effect (Audio Editor Workflow)

**Spec:** specs/granularize-effect  
**Beads Parent Issue:** bounce-e1f  
**Created:** 2026-04-26  
**Status:** In Progress

## Problem Statement

Bounce currently supports granular synthesis through two paths:

1. **`sample.granularize()`** — Decomposes a sample into individual grains stored as derived samples. Returns a `GrainCollection` of separate `SampleResult` objects. This is an analysis/extraction tool.
2. **`inst.granular()`** — Creates a real-time granular instrument that must be played with `noteOn`/`noteOff`. This is a performance tool.

Neither path provides a simple audio-editor-style workflow: "take this sample, run it through granular synthesis with these parameters, give me back a new sample." Users who want to apply granular processing as an effect — time-stretching, texture creation, grain density manipulation — must set up an instrument, play notes, and record the output. This is cumbersome for sound design and batch processing workflows.

**User need:** A function like `sn.granularize(sample, { grainSize: 50, density: 4, pitch: 1.2 })` that returns a new `SampleResult` — playable, saveable, and chainable with other operations.

## Background

The distinction between "instrument" and "effect" workflows is fundamental in audio software:

- **Instrument workflow:** Create instrument → load sample → play notes → hear output in real-time. Output is ephemeral unless explicitly recorded.
- **Effect/editor workflow:** Select sample → apply processing → get new sample. Output is persistent and deterministic.

Bounce's REPL already has the effect workflow pattern for other operations (e.g., `sample.slice()` creates new samples from slice points). Granular synthesis is the missing piece — it should feel like applying an effect, not performing an instrument.

**Key design decision (confirmed with user):**
- Pure processing function: takes a sample + parameters, returns a new `SampleResult`
- Output duration matches input by default, but can be overridden (enables time-stretching)
- No real-time preview — process and return

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
| Grain size | ✓ | ✓ | ✓ | ✓ |
| Density/overlap | ✓ | ✓ | ✓ | ✓ |
| Pitch | ✗ | ✓ | ✓ | ✓ |
| Position scatter | ✗ | ✓ (spray) | ✓ | ✓ |
| Window/envelope | ✓ | ✗ (fixed Hann) | ✓ | ✓ |
| Time stretch | ✓ (primary) | ✗ | ✓ | ✓ (via duration) |
| Reverse grains | ✗ | ✗ | ✓ | Deferred |

## FluCoMa Algorithm Details

This feature does not directly use FluCoMa algorithms. It reuses the existing grain computation infrastructure in `GranularizeService.computeGrains()` and adds an overlap-add resynthesis step.

However, the output samples can be further analyzed with FluCoMa tools (MFCC, spectral shape, etc.), making this a natural part of the corpus analysis pipeline.

## Technical Constraints

### Existing Infrastructure to Reuse

1. **`computeGrains()` in `src/electron/services/granularize/index.ts`** — Pure synchronous function that computes grain start positions, applies jitter, filters silent grains, and derives hashes. This handles the "analysis" half of the effect.

2. **Audio resolver** (`src/electron/audio-resolver.ts`) — Resolves sample hashes to PCM data. Handles raw, derived, recorded, and freesound sample types.

3. **Derived sample storage** — Database schema already supports `sample_type='derived'` for programmatically-created samples.

4. **IPC contract** — Existing `granularize-sample` channel and RPC infrastructure.

5. **`GranularizeOptions` interface** — Already defined in `src/shared/ipc-contract.ts` and `src/shared/rpc/granularize.rpc.ts`.

### What Needs to Be Built

The **resynthesis engine** — the core new code. Given grain positions from `computeGrains()`, reconstruct a single output buffer by:

1. Extracting each grain from the source PCM
2. Applying a window envelope (Hann, Hamming, Triangle, or Tukey)
3. Optionally pitch-shifting each grain (via playback rate / linear interpolation)
4. Placing grains into the output buffer at computed positions (overlap-add)
5. Returning the complete output as a single `Float32Array`

### Architecture Fit

This fits cleanly into the three-process model:
- **Main process** handles the computation (same as existing `granularize-sample` handler)
- **Renderer** calls the new method and receives a `SampleResult`
- **Audio engine** is not involved (offline processing, not real-time)

The computation can run in the existing granularize worker process (JSON-RPC over stdio) to avoid blocking the main process for large files.

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

The existing `computeGrains()` uses `hopSize` to space grain *read* positions in the source. For the effect, we need to distinguish:

- **Source positions** (where to read grains from the source): Controlled by existing parameters (`startTime`, `endTime`, `hopSize`, `jitter`)
- **Output positions** (where to place grains in the output): Determined by `density` and output duration

When `outputDuration` equals input duration and density matches the natural hop rate, the output sounds like a granular reconstruction of the input. When they differ, you get time-stretching or density effects.

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

**New method on `SampleResult`:**
```typescript
sample.granularizeEffect(options?: GranularizeEffectOptions): SamplePromise
```

This returns a `SamplePromise` (not a `GrainCollection`), consistent with other sample processing methods. The result is a single new sample, not a collection of grains.

**Namespace-level convenience:**
```typescript
sn.granularizeEffect(source?, options?): SamplePromise
```

Follows the existing overloaded pattern where the source can be a sample, promise, hash, or omitted (uses current audio).

### REPL Interface Contract

- `sn.granularizeEffect.help()` — must document all parameters with defaults and ranges
- The returned `SampleResult` uses the existing `toString()` display — no new result type needed
- Tab completion for `GranularizeEffectOptions` keys

### Terminal Output

Processing feedback via `terminal.writeln()`:
```
Granularize effect: 500 grains, 50ms @ 20/s, pitch 1.2x → 3.5s output
```

The returned `SampleResult` displays normally (hash, duration, channels, sample rate).

## Cross-Platform Considerations

No platform-specific concerns. All computation is pure TypeScript/JavaScript math operating on `Float32Array` buffers. The existing cross-platform infrastructure for sample storage and IPC handles the rest.

## Open Questions

All resolved during user discussion:

1. ~~Should this be a real-time preview or offline render?~~ → **Offline render** (pure function, returns new sample)
2. ~~Should output duration match input?~~ → **Match by default, allow override**
3. ~~Where does computation run?~~ → Main process or existing worker, same as `granularize-sample`

## Research Findings

1. **The resynthesis engine is the only significant new code.** Everything else — grain computation, audio resolution, sample storage, IPC, REPL patterns — already exists.

2. **Overlap-add is the right approach.** It's well-understood, deterministic, and efficient for offline granular resynthesis.

3. **The existing `GranularizeOptions` needs extension** with new parameters: `density`, `pitch`, `envelope`, and `duration` (output duration). These don't conflict with the existing analysis parameters.

4. **A new options type (`GranularizeEffectOptions`) is cleaner** than extending `GranularizeOptions`, since the semantics differ (effect vs. analysis). The effect options include parameters that don't apply to grain extraction (pitch, envelope, output duration) and exclude parameters that don't apply to the effect (normalize per-grain, silence threshold for filtering).

5. **TypeScript implementation is sufficient.** The overlap-add resynthesis is straightforward math on `Float32Array` — no need for C++ native code. This keeps the feature simpler to maintain and test.

6. **The method name should distinguish from existing `granularize()`** to avoid confusion. `granularizeEffect()` is clear: it applies granular synthesis as an effect and returns a processed sample.

## Next Steps

In the PLAN phase:

1. Define the `GranularizeEffectOptions` interface with all parameters, defaults, and ranges
2. Design the resynthesis engine (overlap-add algorithm)
3. Define the RPC contract extension
4. Plan the IPC flow and handler wiring
5. Specify REPL integration (help, tab completion, display)
6. Define testing strategy (unit tests for the engine, Playwright for REPL)
7. Create beads task graph with dependencies
