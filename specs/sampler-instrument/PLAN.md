# Plan: Sampler Instrument

**Spec:** specs/sampler-instrument  
**Created:** 2026-03-21  
**Status:** In Progress

## Context

The audio engine currently manages a flat list of `AudioProcessor` instances (one per active playback). Every `play-sample` IPC call re-fetches PCM from the database and transfers it to the native engine. There is no concept of a persistent, stateful instrument that caches samples and responds to MIDI-like triggers.

RESEARCH.md confirmed that the existing `AudioProcessor` base class maps cleanly to a "voice" within an instrument, and that the control queue + ring buffer architecture supports the instrument model with minimal changes to the core audio loop.

Key decisions from research:
- MIDI note numbering (0–127)
- `inst` namespace
- Per-instrument polyphony parameter (default 16)
- Per-voice telemetry, opt-in via subscribe/unsubscribe IPC
- Dedicated `instruments` + `instrument_samples` database tables
- Volume parameter with sane default (1.0)

## Approach Summary

1. Introduce a C++ `Instrument` base class that owns a pool of voices (`AudioProcessor` instances) and exposes `process()`, `noteOn()`, `noteOff()`, and parameter methods.
2. Implement `SamplerInstrument` as the first concrete type — loads sample PCM data at definition time, maps MIDI notes to samples, spawns `SamplePlaybackEngine` voices on note-on.
3. Refactor `AudioEngine` to manage instruments instead of raw processors. The `processBlock()` loop iterates instruments; each instrument processes its own voices internally.
4. Extend the IPC protocol with new message types for instrument lifecycle and triggering.
5. Add N-API bindings for the new C++ methods.
6. Add database tables for instrument persistence within projects.
7. Build the `inst` REPL namespace with help(), display, and chainable methods.
8. Maintain backward compatibility: `samp.play()` / `samp.loop()` / `samp.stop()` continue to work via an implicit default sampler instrument.

## Architecture Changes

### New Layer: Instrument

```
Before:
  AudioEngine → [AudioProcessor, AudioProcessor, ...]

After:
  AudioEngine → [Instrument, Instrument, ...]
                      ↓
               [Voice, Voice, ...]  (AudioProcessor instances)
```

The `AudioEngine` no longer directly manages processors. It manages instruments, each of which internally manages its own voices. The `processBlock()` function iterates instruments instead of processors.

### Backward Compatibility

The existing `play-sample` / `stop-sample` IPC flow is preserved via an implicit "default" sampler instrument. When the renderer calls `samp.play()`, the main process routes it through a transient sampler instrument that is created on-the-fly if needed. This means all existing Playwright tests and REPL workflows continue to work without modification.

The default instrument:
- Is auto-created per project (not persisted to DB)
- Has no name visible to users
- Manages voices for `samp.play()` / `samp.loop()` / `samp.stop()` calls
- Does not require explicit sample loading (PCM transferred on play, like today)

User-created instruments via `inst.sampler(...)` are distinct — they cache samples at definition time and respond to note-on/note-off.

## Changes Required

### Native C++ Changes

**New file: `native/include/instrument.h`**
```cpp
class Instrument {
public:
    explicit Instrument(std::string id, int polyphony = 16);
    virtual ~Instrument() = default;

    // Audio processing — called by AudioEngine::processBlock()
    virtual void process(float** outputs, int numChannels, int numFrames) = 0;

    // Voice control
    virtual void noteOn(int note, float velocity) = 0;
    virtual void noteOff(int note) = 0;
    virtual void stopAll() = 0;

    // Sample management
    virtual void loadSample(int note, const float* pcm, int numSamples,
                            double sampleRate, const std::string& sampleHash) = 0;

    // Parameters
    virtual void setParam(int paramId, float value) = 0;

    // Telemetry
    void setTelemetryEnabled(bool enabled) { telemetryEnabled_ = enabled; }
    bool telemetryEnabled() const { return telemetryEnabled_; }

    // Identity
    const std::string& id() const { return id_; }
    int polyphony() const { return polyphony_; }
    int activeVoiceCount() const;

    // Telemetry ring buffer access (set by AudioEngine)
    using TelemetryWriter = std::function<void(const std::string& hash, int pos)>;
    using EndedWriter = std::function<void(const std::string& hash)>;
    void setTelemetryWriters(TelemetryWriter posWriter, EndedWriter endWriter);

protected:
    std::string id_;
    int polyphony_;
    bool telemetryEnabled_ = false;
    TelemetryWriter posWriter_;
    EndedWriter endWriter_;
};
```

**New file: `native/src/sampler-instrument.h` + `native/src/sampler-instrument.cpp`**
```cpp
class SamplerInstrument : public Instrument {
public:
    SamplerInstrument(std::string id, int polyphony = 16);

    void process(float** outputs, int numChannels, int numFrames) override;
    void noteOn(int note, float velocity) override;
    void noteOff(int note) override;
    void stopAll() override;
    void loadSample(int note, const float* pcm, int numSamples,
                    double sampleRate, const std::string& sampleHash) override;
    void setParam(int paramId, float value) override;

private:
    // Loaded samples: note → PCM buffer
    struct SampleData {
        std::vector<float> pcm;
        double sampleRate;
        std::string hash;
    };
    std::unordered_map<int, SampleData> samples_;

    // Active voices
    struct Voice {
        std::unique_ptr<SamplePlaybackEngine> processor;
        int note;
        bool active = false;
    };
    std::vector<Voice> voices_;  // Fixed-size pool (polyphony_)
    int nextVoiceIndex_ = 0;    // Round-robin for voice stealing

    // Parameters
    float volume_ = 1.0f;

    // Internal
    Voice* allocateVoice(int note);
    void releaseVoice(int note);
};
```

**Voice allocation strategy:**
- Fixed-size pool of `polyphony_` voices, allocated at construction.
- `noteOn` finds an inactive voice, or steals the oldest if all active (round-robin index).
- `noteOff` marks the voice for the given note as finished.
- `process()` iterates active voices, calls `voice.processor->process()`, sums output, applies volume, emits telemetry if enabled, removes finished voices.

**Modified file: `native/include/audio-engine.h`**
- Add `instruments_` vector alongside (or replacing) `processors_`.
- Add new control message ops: `DefineInstrument`, `FreeInstrument`, `NoteOn`, `NoteOff`, `LoadSample`, `SetParam`, `SubscribeTelemetry`, `UnsubscribeTelemetry`.
- Keep existing `Add`/`Remove`/`RemoveAll` ops for the default instrument's backward-compatible path.

**Modified file: `native/src/audio-engine.cpp`**
- `processBlock()`: iterate `instruments_` instead of `processors_`. Each instrument's `process()` handles its own voices and telemetry.
- New methods: `defineInstrument()`, `freeInstrument()`, `loadSample()`, `noteOn()`, `noteOff()`, `setParam()`, `subscribeTelemetry()`, `unsubscribeTelemetry()` — all queue control messages.
- Default instrument: auto-created, handles legacy `play()`/`stopSample()` calls by mapping them to note-on/note-off internally.

**Modified file: `native/src/audio-engine-binding.cpp`**
- Expose new methods to JavaScript: `defineInstrument`, `freeInstrument`, `loadSample`, `noteOn`, `noteOff`, `setParam`, `subscribeTelemetry`, `unsubscribeTelemetry`.

**Modified file: `binding.gyp`**
- Add `native/src/sampler-instrument.cpp` to sources.

### TypeScript Changes

**Modified file: `src/shared/audio-engine-protocol.ts`**
```typescript
export type AudioEngineCommand =
  // Existing (kept for backward compat with default instrument)
  | { type: "play"; sampleHash: string; pcm: Float32Array; sampleRate: number; loop: boolean }
  | { type: "stop"; sampleHash: string }
  | { type: "stop-all" }
  // New: instrument lifecycle
  | { type: "define-instrument"; instrumentId: string; kind: string; polyphony: number }
  | { type: "free-instrument"; instrumentId: string }
  // New: sample loading
  | { type: "load-sample"; instrumentId: string; note: number; pcm: Float32Array; sampleRate: number; sampleHash: string }
  // New: note events
  | { type: "note-on"; instrumentId: string; note: number; velocity: number }
  | { type: "note-off"; instrumentId: string; note: number }
  // New: parameters
  | { type: "set-param"; instrumentId: string; paramId: number; value: number }
  // New: telemetry control
  | { type: "subscribe-telemetry"; instrumentId: string }
  | { type: "unsubscribe-telemetry"; instrumentId: string };

// Telemetry extended with instrument context
export type AudioEngineTelemetry =
  | { type: "position"; sampleHash: string; positionInSamples: number; instrumentId?: string; note?: number }
  | { type: "ended"; sampleHash: string; instrumentId?: string; note?: number }
  | { type: "error"; sampleHash?: string; code: string; message: string };
```

**Modified file: `src/utility/audio-engine-process.ts`**
- Handle new message types in the port listener.
- Route to corresponding native engine methods.

**Modified file: `src/electron/ipc/audio-handlers.ts`**
- New IPC handlers: `define-instrument`, `free-instrument`, `load-instrument-sample`, `instrument-note-on`, `instrument-note-off`, `set-instrument-param`, `subscribe-instrument-telemetry`, `unsubscribe-instrument-telemetry`.
- Each handler validates input and forwards to the audio engine port.

**Modified file: `src/electron/preload.ts`**
- Expose new IPC methods: `defineInstrument`, `freeInstrument`, `loadInstrumentSample`, `instrumentNoteOn`, `instrumentNoteOff`, `setInstrumentParam`, `subscribeInstrumentTelemetry`, `unsubscribeInstrumentTelemetry`.

**Modified file: `src/electron/database.ts`**
- New migration: create `instruments` and `instrument_samples` tables.
- New methods: `createInstrument()`, `getInstrument()`, `listInstruments()`, `deleteInstrument()`, `addInstrumentSample()`, `getInstrumentSamples()`, `removeInstrumentSample()`.

**New file: `src/renderer/namespaces/instrument-namespace.ts`**
- The `inst` namespace with `sampler()`, `list()`, `get()`, `help()`.
- `sampler()` creates a `SamplerInstrument` REPL object.
- Returns bound instrument objects with `noteOn()`, `noteOff()`, `stop()`, `free()`, `loadSample()`, `help()` methods.

**New file: `src/renderer/results/instrument.ts`**
- `InstrumentResult` class extending `HelpableResult`.
- Terminal display: name, type, polyphony, loaded samples count, active voices.

**Modified file: `src/renderer/bounce-api.ts`**
- Register `inst` namespace in the API.

**Modified file: `src/renderer/audio-context.ts`**
- Handle instrument-scoped telemetry (position events with `instrumentId` and `note`).
- Track per-instrument playback states.

### Terminal UI Changes

**New namespace `inst`:**
```
inst.help()                                         → namespace help text
inst.sampler({ name: "keys", polyphony: 8 })        → creates SamplerInstrument
inst.list()                                         → lists all instruments in project
inst.get("keys")                                    → retrieves instrument by name
```

**Instrument instance methods:**
```
keys.help()                                         → instance help
keys.loadSample(60, samp)                           → load sample at note 60
keys.noteOn(60)                                     → trigger note 60 (velocity 1.0)
keys.noteOn(60, { velocity: 0.5 })                  → trigger with velocity
keys.noteOff(60)                                    → release note 60
keys.stop()                                         → stop all voices
keys.free()                                         → destroy instrument
keys.toString()                                     → "Sampler 'keys' | 3 samples | poly 8 | 0 active"
```

### REPL Interface Contract

**Namespace: `inst`**
- `inst.help()` → BounceResult with namespace overview, available instrument types, examples
- `inst.sampler.help()` → BounceResult with sampler-specific docs (parameters, sample loading, note triggering)

**Returned object: `SamplerInstrument` (REPL representation)**
- `toString()` → `"Sampler '<name>' | <N> samples | poly <M> | <K> active"`
- Properties visible: name, kind, polyphony, sample count
- Methods: noteOn, noteOff, stop, free, loadSample, help

**Returned object: `InstrumentList`**
- `toString()` → table of instruments with name, kind, sample count

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [ ] Unit tests and/or Playwright tests are identified for `help()` output
- [ ] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

**`binding.gyp`**: Add `native/src/sampler-instrument.cpp` to `audio_engine_native` sources.

**Database migration**: New migration version adding `instruments` and `instrument_samples` tables.

No new npm dependencies required.

## Testing Strategy

### Unit Tests

**`src/instrument-namespace.test.ts`** (new):
- `inst.help()` produces expected output format
- `inst.sampler.help()` produces expected output format
- Instrument `toString()` format with various states
- InstrumentList display format

### E2E Tests

**`tests/instrument.spec.ts`** (new):
- Define a sampler instrument via REPL
- Load a sample into the instrument
- Trigger note-on and verify audio plays
- Trigger note-off and verify audio stops
- Verify instrument persists across project reload
- Verify `inst.list()` shows the instrument
- Free instrument and verify cleanup
- Verify `inst.help()` output in terminal
- Verify instrument `toString()` display

**`tests/playback.spec.ts`** (existing):
- Verify `samp.play()` / `samp.stop()` still work unchanged (backward compat)

### Manual Testing

- Create multiple instruments with different samples
- Verify polyphony limit (trigger more notes than polyphony allows, verify oldest is stolen)
- Verify telemetry subscribe/unsubscribe (visualize waveform, dismiss, check no telemetry leak)
- Test on macOS and Linux (via Docker)

## Success Criteria

1. `inst.sampler({ name: "keys" })` creates a sampler instrument accessible in the REPL.
2. `keys.loadSample(60, samp)` caches sample PCM in the native engine.
3. `keys.noteOn(60)` triggers playback without re-fetching PCM from DB.
4. `keys.noteOff(60)` stops playback of that note.
5. `keys.free()` releases all resources.
6. Instrument definitions persist in the database and restore on project load.
7. `samp.play()` and all existing playback workflows continue to work unchanged.
8. `inst.help()` and instrument `help()` provide useful documentation.
9. All existing Playwright tests pass without modification.
10. New Playwright tests cover instrument CRUD, playback, and persistence.

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing playback | High | Default instrument preserves backward-compat `play()`/`stop()` path; existing tests verify |
| Voice stealing audible clicks | Medium | Apply short fade-out (1–2ms) when stealing a voice |
| Ring buffer overflow with many voices | Medium | Telemetry is opt-in; only subscribed instruments emit |
| Complex C++ refactoring | Medium | Implement instrument layer alongside existing processor code first, then swap once tested |
| Memory bloat from cached samples | Low | Document per-instrument memory cost; instrument samples are explicit user actions |

## Implementation Order

1. **C++ Instrument base class** — `instrument.h` with pure virtual interface.
2. **C++ SamplerInstrument** — concrete implementation with voice pool, sample cache, note-on/note-off.
3. **AudioEngine refactoring** — add instrument management alongside existing processor code. Default instrument handles legacy path.
4. **N-API bindings** — expose new methods (defineInstrument, freeInstrument, etc.).
5. **IPC protocol extension** — new message types in `audio-engine-protocol.ts`.
6. **Utility process routing** — handle new messages in `audio-engine-process.ts`.
7. **Main process IPC handlers** — new handlers in `audio-handlers.ts`.
8. **Preload bridge** — expose new IPC to renderer.
9. **Database migration** — `instruments` + `instrument_samples` tables.
10. **Database methods** — CRUD operations for instruments.
11. **REPL namespace** — `inst` namespace with `sampler()`, `list()`, `get()`, `help()`.
12. **Result types** — `InstrumentResult` for terminal display.
13. **Instrument persistence** — load/restore on project open.
14. **Telemetry integration** — subscribe/unsubscribe wired to AudioManager.
15. **Backward compatibility verification** — run all existing tests.
16. **New E2E tests** — instrument lifecycle, playback, persistence.

## Estimated Scope

Large — spans C++ native code, N-API bindings, IPC protocol, database schema, and REPL UI across ~15 files with several new files.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
