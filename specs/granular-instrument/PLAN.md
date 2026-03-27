# Plan: Granular Instrument

**Spec:** specs/granular-instrument  
**Created:** 2026-03-21  
**Status:** In Progress

## Context

Bounce already has:
- A working `Instrument` abstract base class (`native/include/instrument.h`) with `process()`, `noteOn/Off()`, `loadSample()`, `setParam()`.
- `SamplerInstrument` as a fully implemented concrete type.
- An `inst` REPL namespace with `inst.sampler()`, `inst.list()`, `inst.get()`.
- An `InstrumentResult` display type (`src/renderer/results/instrument.ts`).
- IPC protocol that handles all instrument operations via `define-instrument`, `load-instrument-sample`, `instrument-note-on/off`, `set-instrument-param`.
- A `granularize()` analysis utility that's complementary (grain extraction, not real-time playback).

What's missing: **a real-time granular synthesis instrument** that takes a source sample and generates overlapping grains with controllable parameters.

## Approach Summary

1. Implement `GranularInstrument` in C++: grain stream voices, grain scheduler, window LUT, linear interpolation of source PCM.
2. Wire it into `AudioEngine::defineInstrument()` via `kind == "granular"`.
3. Add `inst.granular()` factory to the renderer REPL namespace.
4. Add a `set()` method to instrument result objects (granular-specific but could apply to sampler too for extensibility).
5. Update tab completion and `inst.help()` output.
6. Persist granular instruments to the DB using the existing `instruments` + `instrument_samples` tables.

## Architecture Changes

The `GranularInstrument` follows the same pattern as `SamplerInstrument`:
- New C++ header + implementation files.
- Routing added to `AudioEngine::defineInstrument()`.
- Registered in `binding.gyp`.
- New TypeScript factory `inst.granular()` modeled on `inst.sampler()`, extended with a `set()` method.

No schema changes required — the existing `instruments` table has a `kind` column that already accommodates `'granular'`.

## Changes Required

### Native C++ Changes

**New files:**
- `native/include/granular-instrument.h` — `GranularInstrument : public Instrument`
  - Inner `Grain` struct: `double readPos`, `int grainLength`, `float envelopePhase`, `float playbackRate`, `bool active`
  - Inner `GrainStream` class: flat array of 128 `Grain` slots, `samplesUntilNextGrain_`, own copy of current params
  - Parameter enum:
    ```cpp
    enum class Param : int {
        Position = 0,  // 0.0–1.0 fraction of source
        GrainSize = 1, // 1–1000 ms
        Density = 2,   // 0.1–200 grains/sec
        Scatter = 3,   // 0.0–1.0 fraction of source
        Envelope = 4,  // 0=Hann, 1=Hamming, 2=Triangle, 3=Tukey
        Pitch = 5,     // 0.25–4.0 playback rate
        Volume = 6,    // 0.0–2.0 linear gain
    };
    ```
  - Window LUT: 1024-sample pre-computed tables for Hann, Hamming, Triangle, Tukey
  - Default polyphony: 4 grain streams

- `native/src/granular-instrument.cpp` — Implementation:
  - Constructor: pre-allocate all grain stream objects and window LUTs; default params
  - `loadSample()`: store mono PCM (note ignored; first channel if multi-channel), record `sampleRate_`, `sourceLengthSamples_`
  - `noteOn(note, vel)`: find idle stream, reset scheduler, store velocity as volume scale
  - `noteOff(note)`: mark matching stream for drainage (let active grains finish, do not spawn new ones)
  - `stopAll()`: immediately deactivate all streams and all grains
  - `process(outputs, numChannels, numFrames)`:
    - For each active stream: run scheduler, process all active grains, mix to outputs, apply volume
  - `setParam(paramId, value)`: update shared params; each stream reads them from shared state
  - `activeVoiceCount()`: count active streams

**Modified files:**
- `native/src/audio-engine.cpp`: Add `else if (kind == "granular") { inst = std::make_shared<GranularInstrument>(id, polyphony); }` in `defineInstrument()`.

**Build files:**
- `binding.gyp`: Add `'native/src/granular-instrument.cpp'` to the sources list.

### TypeScript Changes

**Modified:** `src/renderer/namespaces/instrument-namespace.ts`

1. Add param name → paramId mapping for granular:
   ```typescript
   const GRANULAR_PARAM_IDS: Record<string, number> = {
     position: 0, grainSize: 1, density: 2, scatter: 3,
     envelope: 4, pitch: 5, volume: 6,
   };
   ```

2. Add `set(params)` method to instrument result objects (available for both sampler and granular; for sampler, only `volume` is meaningful):
   ```typescript
   set(params: Record<string, number>): void
   ```
   Internally iterates params, looks up paramId by kind-specific map, calls `window.electron.setInstrumentParam(instrumentId, paramId, value)` for each.

3. Add `inst.granular(opts)` factory:
   ```typescript
   granular: Object.assign(
     function granular(opts: { name: string; polyphony?: number }): InstrumentResult { ... },
     { help: () => BounceResult }
   )
   ```
   Same pattern as `inst.sampler()` but default polyphony = 4 and kind = `"granular"`.
   Instead of `loadSample(note, sample)`, expose `load(sample)` (convenience wrapper for note=0).

4. Update `inst.help()` to document both `sampler` and `granular`.

**Modified:** `src/renderer/results/instrument.ts`

- Update `formatInstrument()` to show granular-specific info when `kind === 'granular'`:
  ```
  Granular 'clouds' | 44100Hz | pos 0.50 | 80ms grains @ 20/s | poly 4
  ```

**Modified:** `src/renderer/tab-completion.ts`
- `inst.` completions: add `granular` alongside `sampler`, `list`, `get`, `help`.
- Instrument instance methods: add `set` and `load` alongside existing `noteOn`, `noteOff`, `stop`, `free`, `help`.

### Terminal UI Changes

No canvas/visualization changes. Output-only: updated `toString()` format for granular instruments.

### REPL Interface Contract

**`inst.granular.help()`** — documents creation: `name` (required), `polyphony` (optional, default 4); explains that a source sample is loaded with `.load(sample)` rather than `.loadSample(note, sample)`.

**`g.help()`** — instance help listing:
- `.load(sample)` — load a source sample
- `.noteOn(note)` / `.noteOff(note)` / `.stop()` / `.free()`
- `.set(params)` — table of all settable parameters with ranges and defaults
- Examples

**`g.toString()` (terminal display):**
```
Granular 'clouds' | 44100Hz | pos 0.50 | 80ms grains @ 20/s | poly 4
```

**`inst.help()` update** — includes `granular` example alongside `sampler`.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties (source info, position, grain size, density)
- [x] Unit tests identified for `help()` output
- [x] Unit tests identified for returned-object display behavior

### Configuration/Build Changes

- `binding.gyp`: add `granular-instrument.cpp` to sources.
- No `package.json` or `tsconfig` changes needed.

## Testing Strategy

### Unit Tests

- `src/granular-instrument.test.ts`:
  - `inst.granular.help()` output contains expected text
  - `g.toString()` with default params matches expected format
  - `g.toString()` after `.set({ position: 0.3, grainSize: 100 })` reflects updated values
  - `g.help()` lists all parameters with ranges

### E2E Tests

- `tests/granular-instrument.spec.ts`:
  - `inst.granular({ name: 'test' })` creates instrument and displays correct summary
  - `g.load(sn.read(...))` loads source sample without error
  - `g.set({ position: 0.5, grainSize: 80, density: 20 })` executes without error
  - `g.noteOn(60)` and `g.noteOff(60)` execute without error
  - `g.help()` output renders in terminal
  - `inst.granular.help()` output renders in terminal

### Manual Testing

- Audible: create instrument, load a sample, noteOn → hear granular texture.
- Parameter live-control: `.set({ position: 0.8 })` while playing should shift grain position.
- Polyphony: multiple `.noteOn()` calls create layered streams up to poly limit.
- `.stop()` silences immediately.
- `inst.list()` shows the granular instrument.
- App restart: `inst.get('clouds')` restores the instrument from DB.

## Success Criteria

- `inst.granular({ name: 'clouds', polyphony: 2 })` creates a working granular instrument in the REPL.
- `g.load(sample)` loads source PCM into the native engine.
- `g.set({ position: 0.3, grainSize: 120, density: 25, scatter: 0.15 })` sends param updates.
- `g.noteOn(60)` / `g.noteOff(60)` starts/stops grain streaming with audible output.
- All unit and Playwright tests pass.
- `./build.sh` succeeds.

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Audio clicks from grain boundaries | Hann window envelope ensures smooth grain fade-in/out |
| Overdriving mix at high density | Document volume control; auto-gain by `1/sqrt(overlap)` is a nice-to-have |
| `noteOff` leaves orphaned grains | Grains in flight finish naturally; stream simply stops scheduling new grains |
| Source PCM > one channel | Take first channel at load time; document this limitation |
| Grain pool exhaustion | New grains dropped when all 128 slots full; this is a natural density ceiling, not a crash |

## Implementation Order

1. **C++**: `native/include/granular-instrument.h` — class declaration, `Grain` struct, `GrainStream` class, `Param` enum, window LUT declarations.
2. **C++**: `native/src/granular-instrument.cpp` — full implementation.
3. **C++**: `native/src/audio-engine.cpp` — add `"granular"` routing.
4. **Build**: `binding.gyp` — add new source file.
5. **Rebuild**: `npm run rebuild` — verify native compile succeeds.
6. **TypeScript**: `src/renderer/results/instrument.ts` — granular display format.
7. **TypeScript**: `src/renderer/namespaces/instrument-namespace.ts` — `inst.granular()` factory + `set()` method + `load()` method.
8. **TypeScript**: `src/renderer/tab-completion.ts` — add `granular`, `set`, `load` completions.
9. **Unit tests**: `src/granular-instrument.test.ts`.
10. **Playwright tests**: `tests/granular-instrument.spec.ts`.
11. **Build verification**: `./build.sh`.

## Estimated Scope

**Large** — involves both C++ audio DSP and TypeScript REPL integration.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (no breaking changes to sampler or existing IPC)
- [x] All sections agree on the data model / schema approach (existing `instruments` table, `kind='granular'`)
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and Playwright coverage for REPL help/display behavior
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
