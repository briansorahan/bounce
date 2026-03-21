# Research: Granular Instrument

**Spec:** specs/granular-instrument  
**Created:** 2026-03-21  
**Status:** In Progress

## Problem Statement

Bounce has a working grain extraction feature (`sample.granularize()`) that segments audio into grains and stores them as derived samples, and a fully implemented instrument abstraction with `SamplerInstrument` as the first concrete type. What's missing is **real-time granular synthesis as a playable instrument** — an instrument that takes a source sample and continuously generates overlapping grains with controllable parameters (position, grain size, density, scatter, envelope), enabling the expressive sound-design workflows that granular synthesis is known for.

The current `granularize()` function is a data-preparation utility: it slices audio, stores grains in the database, and returns an iterator. It's useful for analysis, but it doesn't provide real-time playback with parameter modulation. A `GranularInstrument` would fill this gap by combining grain generation with the existing instrument infrastructure (voice pool, note-on/note-off, telemetry, persistence).

## Background

### Existing Infrastructure

**Instrument Abstraction (C++):** Fully implemented in `native/include/instrument.h`. Abstract base class with:
- `process(float** outputs, int numChannels, int numFrames)` — called per audio block
- `noteOn(int note, float velocity)` / `noteOff(int note)` — trigger/release
- `loadSample(int note, vector<float> pcm, double sampleRate, string hash)` — cache PCM
- `setParam(int paramId, float value)` — parameter modulation
- Telemetry: opt-in position/ended callbacks via ring buffer
- Voice management: polyphony count, subclass owns voice pool

**SamplerInstrument (C++):** First concrete type in `native/include/sampler-instrument.h`. Maps MIDI notes to cached PCM buffers. noteOn creates a `SamplePlaybackEngine` voice that plays the mapped sample once. Fixed-size voice pool with round-robin stealing.

**AudioEngine:** Manages instruments alongside legacy processors. `processBlock()` iterates instruments; each instrument's `process()` handles its own voices. Control messages (define/free/noteOn/noteOff/loadSample/setParam/telemetry) queued via mutex, applied at block boundaries.

**IPC Protocol:** All instrument message types defined in `src/shared/audio-engine-protocol.ts`: `define-instrument`, `free-instrument`, `load-instrument-sample`, `instrument-note-on`, `instrument-note-off`, `set-instrument-param`, `subscribe/unsubscribe-instrument-telemetry`.

**N-API Bindings:** All instrument methods exposed via `audio-engine-binding.cpp`.

**Grain Extraction (TypeScript):** `database.ts` has a `granularize()` method that computes grain positions, extracts PCM slices, filters silent grains, and stores as derived samples. The renderer's `GrainCollection` class provides `forEach/map/filter/length` on the stored grains.

### Key Difference: Sampler vs. Granular

| Aspect | SamplerInstrument | GranularInstrument |
|--------|------------------|--------------------|
| Sample mapping | One sample per MIDI note | One source sample per instrument |
| Trigger model | noteOn = play entire sample | noteOn = start grain stream |
| Voice model | One voice = one sample playback | One voice = one grain stream (manages many overlapping grains internally) |
| Voice lifetime | Long (full sample playback) | Long (stream runs until noteOff) |
| Voice count | Low (1–16 concurrent streams) | Low (1–8 concurrent streams, each with many overlapping grains) |
| Parameters | Volume | Position, grain size, density, scatter, envelope, pitch, volume |
| Scheduling | User-triggered | Internal grain scheduler per stream |

### Grain Stream Model

A single "voice" in the granular instrument is not an individual grain — it is a **grain stream**: a self-contained scheduler that continuously spawns, processes, and mixes overlapping grains from the source buffer. Each stream manages a fixed-size pool of lightweight grain structs internally.

This means:
- **noteOn** starts a grain stream (one voice). Multiple noteOns can create independent, layered streams.
- **noteOff** stops a stream (active grains within it fade out naturally).
- **Polyphony** controls maximum concurrent streams (default 4), not individual grains.
- Each stream internally manages up to ~128 overlapping grains as plain structs (read position, phase, length) — no heap allocation per grain.

## Related Work / Prior Art

### Classic Granular Synthesis (Roads, 1978/2001)

Curtis Roads formalized granular synthesis: sound is decomposed into "grains" — short acoustic events (typically 1–100ms) — and reassembled. Key parameters:

- **Grain duration**: Length of each grain.
- **Grain density**: Number of grains per second (or inter-onset interval).
- **Grain envelope**: Window function applied to each grain (Hann, Gaussian, triangle, etc.).
- **Position in source**: Where in the source audio each grain reads from.
- **Position scatter**: Randomization of grain start position.
- **Pitch/transposition**: Per-grain speed change.

Two main modes:
1. **Synchronous**: Grains triggered at regular intervals. Density controls spacing.
2. **Asynchronous (stochastic)**: Grain timing follows a random distribution. More "cloud-like."

### SuperCollider GrainBuf

`GrainBuf.ar(numChannels, trigger, dur, sndbuf, rate, pos, interp, pan, envbufnum)`

- `trigger`: When to generate a grain (e.g. `Impulse.kr(density)`)
- `dur`: Grain duration in seconds
- `pos`: Position in buffer (0–1)
- `rate`: Playback rate (1.0 = normal, 0.5 = half speed)
- `interp`: Interpolation mode (1=none, 2=linear, 4=cubic)
- `envbufnum`: Custom envelope buffer (-1 = built-in Hann)

Key insight: trigger-based model where an external clock controls grain emission. This maps naturally to noteOn starting the clock and noteOff stopping it.

### Max/MSP munger~ / granular~

Classic real-time granular objects. Parameters:
- Grain size, grain rate (grains/sec)
- Position (with jitter/randomization)
- Pitch variation
- Amplitude envelope (typically Hann or triangle)
- Stereo spread/panning

### Ableton Granulator II (Robert Henke)

A practical, musically-oriented granular instrument. Notable design choices:
- **Position** is the primary performance parameter — mapped to a slider or MIDI controller
- **Spray** (position scatter) adds variation around the position
- **Grain Size** and **Density** are coupled — density = grains-per-second, and overlap = density × grain_size
- **Envelope** fixed to Hann-like shape (not user-selectable in basic mode)
- **Pitch** modifiable per-grain

### FluCoMa BufGranulate (hypothetical)

FluCoMa doesn't currently provide a real-time granular synthesis UGen, but the library's analysis outputs (onset positions, spectral descriptors, MFCC) could inform intelligent grain selection — e.g., "generate grains only from regions with high spectral centroid." This is future work beyond this spec.

## FluCoMa Algorithm Details

No FluCoMa algorithms are directly required. Granular synthesis is a playback/rendering operation, not an analysis one. However, the architecture should not preclude future integration where FluCoMa descriptors guide grain selection (e.g., position scanning weighted by spectral features).

## Technical Constraints

### Audio Thread Safety
- The grain scheduler runs inside `GranularInstrument::process()`, which executes on the audio thread.
- Grain scheduling must not allocate memory on the hot path. Voice pool must be pre-allocated.
- Window function values should be computed at construction time or use closed-form sample-by-sample computation (Hann/Hamming are cheap).
- Parameter changes arrive via control queue messages applied at block boundaries — block-level granularity, not sample-accurate. This is acceptable for granular parameters.

### Voice Pool Sizing
- A "voice" in the granular instrument is a **grain stream**, not an individual grain. Each stream manages its own internal pool of overlapping grains.
- Default polyphony (max concurrent streams) should be modest: 4 (vs. sampler's 16). Multiple streams are used for layering (e.g. different positions or pitches simultaneously).
- Each stream pre-allocates a fixed pool of ~128 grain slots. At 100 grains/sec with 200ms grain duration, ~20 grains overlap — well within the 128 budget.
- The global 32-processor cap in the legacy path doesn't apply — instruments manage their own voice pools.
- Memory per grain slot is tiny: read position (double), grain length (int), envelope phase (float), active flag — ~24 bytes. 128 slots × 4 streams = ~12 KB. Negligible.

### Memory Budget
- Source sample PCM is stored once in the instrument. A 20-second mono sample at 44.1 kHz ≈ 3.5 MB.
- Grain stream pool: 4 streams × 128 grain slots × ~24 bytes ≈ 12 KB. Negligible.
- Window lookup table: 1024 floats ≈ 4 KB per window type. Negligible.
- Total overhead vs. SamplerInstrument: minimal. The source sample dominates.

### IPC Protocol Compatibility
- The existing `define-instrument` message has a `kind` field. Setting `kind: "granular"` routes to `GranularInstrument` construction in `AudioEngine::defineInstrument()`.
- `load-instrument-sample` maps to loading the source sample (using note=0 as convention for single-source instruments).
- `instrument-note-on` starts the grain stream; `instrument-note-off` stops it.
- `set-instrument-param` controls grain parameters (position, size, density, scatter, envelope, pitch, volume).
- No new IPC message types are needed — the existing instrument protocol handles everything.

## Audio Processing Considerations

### Grain Lifecycle

A grain stream (one voice) manages many concurrent grains. Each individual grain has this lifecycle within its parent stream:
1. **Spawn**: Stream's scheduler determines it's time for a new grain. Claim a slot from the stream's pre-allocated grain pool.
2. **Configure**: Set read position in source buffer (base position + scatter), grain length in source samples, playback rate, envelope phase.
3. **Process**: Each block, the grain reads samples from the source buffer at its current read position, applies the envelope window via LUT lookup, and accumulates to the stream's output. Advance read position by `numFrames * playbackRate`. Advance envelope phase by `numFrames / grainLengthInOutputSamples`.
4. **Finish**: When envelope phase reaches 1.0 (grain complete), release the slot back to the pool.

### Grain Scheduling

The scheduler runs inside each grain stream's processing loop:
- Track a `samplesUntilNextGrain_` counter per stream, decremented by `numFrames` each block.
- When counter reaches 0: spawn a grain in the stream's pool, reset counter to `sampleRate / density` (with optional jitter).
- This produces synchronous scheduling. Asynchronous scheduling (random inter-onset intervals) is a future enhancement — synchronous is sufficient for MVP.
- If the grain pool is full (all 128 slots active), the new grain is dropped. This is a natural density ceiling.

### Window Functions

Applied sample-by-sample during `GrainVoice::process()`:

```
Hann:      w(i, N) = 0.5 * (1 - cos(2π * i / (N-1)))
Hamming:   w(i, N) = 0.54 - 0.46 * cos(2π * i / (N-1))
Triangle:  w(i, N) = 1 - |2i/(N-1) - 1|
Tukey(α):  Flat center with Hann taper on edges (α controls taper fraction)
```

For efficiency, use a pre-computed lookup table (1024 samples per window type) and linearly interpolate for grains of arbitrary length. This avoids trig calls on the audio thread.

### Source Buffer Reading

- Source PCM is mono (interleaved multi-channel sources are summed to mono at load time, or first channel is used).
- Read position is a floating-point value to support non-integer playback rates (pitch shifting).
- Linear interpolation between adjacent samples: `out = pcm[floor(pos)] * (1 - frac) + pcm[ceil(pos)] * frac`.
- Boundary handling: if read position exceeds source length, the grain finishes early (no wrapping by default).

### Parameter Ranges

| Parameter | Range | Default | Unit |
|-----------|-------|---------|------|
| position | 0.0–1.0 | 0.5 | Fraction of source duration |
| grainSize | 1–1000 | 80 | Milliseconds |
| density | 0.1–200 | 20 | Grains per second |
| scatter | 0.0–1.0 | 0.1 | Fraction of source duration |
| envelope | 0–3 | 0 (Hann) | Enum: Hann, Hamming, Triangle, Tukey |
| pitch | 0.25–4.0 | 1.0 | Playback rate multiplier |
| volume | 0.0–2.0 | 1.0 | Linear gain |

### Pitch Shifting

- `pitch = 1.0` plays grains at original speed/pitch.
- `pitch = 2.0` reads source at double speed → one octave up, grain duration halved in source time.
- `pitch = 0.5` reads at half speed → one octave down, grain extends further in source.
- The grain's audio duration (in output time) remains constant regardless of pitch — what changes is how much source material the grain traverses.

## Terminal UI Considerations

### REPL API Surface

**Instrument creation:**
```
const g = inst.granular({ name: "clouds", source: samp })
```
This creates a `GranularInstrument`, loads the source sample's PCM, and returns an instrument handle.

**Parameter control:**
```
g.set({ position: 0.3, grainSize: 100, density: 30 })
g.set({ scatter: 0.2, pitch: 0.8 })
```

**Playback:**
```
g.noteOn(60)       // start grain stream
g.noteOff(60)      // stop grain stream
g.stop()           // stop all voices immediately
```

**Inspection:**
```
g.toString()       // "Granular 'clouds' | 44100Hz | pos 0.30 | 100ms grains @ 30/s | 3 active"
g.help()           // instance help with parameter list
```

**Namespace:**
```
inst.granular.help()   // granular-specific creation docs
inst.help()            // updated to list both sampler and granular
```

### REPL Interface Contract

- `inst.granular.help()` — documents creation parameters (name, source, polyphony) and available parameters
- `g.help()` — instance help listing parameter names, ranges, and examples
- `g.toString()` — compact summary: name, source info, current position, grain size, density, active voice count
- `g.set.help()` — documents all settable parameters with ranges and defaults

### Tab Completion

- `inst.` completes to `sampler`, `granular`, `list`, `get`, `help`
- Instance methods: `noteOn`, `noteOff`, `stop`, `free`, `set`, `help`

## Cross-Platform Considerations

No platform-specific concerns. The granular instrument is implemented entirely in portable C++17 (audio processing) and TypeScript (REPL layer). Window function math, floating-point interpolation, and voice management are platform-agnostic. Miniaudio handles platform audio I/O as before.

## Open Questions — Resolved

1. **Grain scheduling mode**: Start with synchronous scheduling (fixed interval based on density). Asynchronous/stochastic scheduling is a future enhancement.

2. **Source sample format**: Mono only for MVP. Multi-channel sources use the first channel. This simplifies the grain voice's read logic and window application.

3. **Maximum source duration**: No hard limit (unlike the `granularize()` analysis function's 20s cap). The instrument caches the full source sample in native memory. Duration is bounded practically by available memory — a 60-second stereo source at 44.1 kHz ≈ 21 MB, which is fine.

4. **Grain overlap behavior**: Grains accumulate additively. At high densities, this can cause clipping. A per-instrument output limiter or auto-gain based on density is desirable but deferred to a follow-up. Users can control volume via `set({ volume })`.

5. **Parameter smoothing**: Parameters change at block boundaries (same as sampler). For position scanning, this means ~1ms granularity at 44.1 kHz / 512-frame blocks. Acceptable for MVP — per-sample parameter interpolation is a future optimization.

6. **Relationship to existing `granularize()`**: The existing `sample.granularize()` function remains as a grain analysis/extraction tool. The `GranularInstrument` is for real-time playback. They serve complementary purposes and coexist.

## Research Findings

### 1. The Instrument Base Class Supports Granular Without Changes

The `Instrument` virtual interface in `instrument.h` already accommodates granular synthesis:
- `process()` is where the grain scheduler and voice processing live.
- `noteOn()` / `noteOff()` map to start/stop grain stream.
- `loadSample()` maps to loading the source sample (single-source, keyed at note 0).
- `setParam()` maps to granular parameter changes (position, size, density, etc.).
- `activeVoiceCount()` reports number of active grains.
- Telemetry callbacks can report grain position relative to source.

No changes to `instrument.h` are needed.

### 2. GrainStream Replaces Per-Grain Voices

Unlike the sampler's model (one `SamplePlaybackEngine` per voice), a granular instrument uses a **grain stream** as its voice abstraction. Each stream:
- Owns a flat array of ~128 `Grain` structs (pre-allocated, no heap allocation per grain)
- Runs its own scheduler (samples-until-next-grain counter)
- Iterates active grains in `process()`, reads from the shared source buffer, applies window LUT, accumulates output
- Is much more cache-friendly than pointer-chasing through `unique_ptr<AudioProcessor>` objects

A `Grain` struct contains only: `double readPos`, `int grainLength`, `float envelopePhase`, `float playbackRate`, `bool active` — ~24 bytes. The entire grain pool for one stream fits in a few cache lines.

### 3. IPC Protocol Needs No Extension

All existing instrument IPC messages work for granular:
- `define-instrument { kind: "granular", polyphony: 4 }` — creates the instrument (polyphony = max concurrent grain streams)
- `load-instrument-sample { note: 0, pcm, sampleRate, sampleHash }` — loads the source
- `instrument-note-on { note: 60, velocity: 1.0 }` — starts grain stream
- `instrument-note-off { note: 60 }` — stops grain stream
- `set-instrument-param { paramId, value }` — controls all parameters

The `kind: "granular"` routing in `AudioEngine::defineInstrument()` is the only C++ change needed outside the new `GranularInstrument` class itself.

### 4. Window LUT is Efficient

Pre-computing a 1024-point window lookup table at instrument construction:
- Memory: 4 KB per window type
- Runtime cost: One table lookup + linear interpolation per sample per grain
- Switching window types: Swap the LUT pointer via `setParam()`, applies at next block

### 5. Database Persistence Reuses Existing Schema

The `instruments` table (from sampler-instrument spec) already supports `kind = 'granular'`. The `config_json` column stores granular-specific defaults (grain size, density, position, etc.). The `instrument_samples` junction table links the source sample to the instrument.

### 6. Renderer REPL Layer Builds on Sampler Patterns

The `inst` namespace (not yet implemented in the renderer, per the sampler-instrument spec's status) will include both `inst.sampler()` and `inst.granular()`. The instrument result type and display logic can be shared, with kind-specific parameter display. The `set()` method is a new convenience over individual `setParam()` IPC calls — it accepts an object of parameter names and values, translates to paramId/value pairs, and sends them as a batch.

## Next Steps

Move to PLAN phase to design:
1. C++ `GranularInstrument` class (grain voice struct, scheduler, window LUT, parameter set)
2. `AudioEngine::defineInstrument()` routing for `kind: "granular"`
3. Renderer REPL integration (can be parallel with or after `inst` namespace from sampler-instrument spec)
4. Database persistence for granular instruments
5. Testing strategy (unit tests for grain scheduling, Playwright for REPL)
6. Implementation order (likely depends on sampler-instrument `inst` namespace being built first)
