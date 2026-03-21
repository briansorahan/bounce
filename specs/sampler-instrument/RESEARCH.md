# Research: Sampler Instrument

**Spec:** specs/sampler-instrument  
**Created:** 2026-03-21  
**Status:** In Progress

## Problem Statement

Bounce currently has a flat audio engine model: every play command creates a standalone `SamplePlaybackEngine` processor that the engine mixes directly. There is no concept of an "instrument" — a stateful entity that owns sample data, responds to trigger messages, and persists across sessions. This makes it difficult to:

1. **Add new playback modes** (e.g. granular synthesis) without modifying the core audio process loop.
2. **Cache sample data** — currently, every `play-sample` IPC call re-fetches PCM from the database and transfers it over the MessagePort. An instrument could load its samples once at definition time.
3. **Model rich interactions** — MIDI-like note-on/note-off semantics, polyphony management, and parameter modulation don't have a natural home in the current flat model.
4. **Persist user setups** — a user who loads samples and configures playback parameters has no way to save that configuration as part of their project.

The goal of this spec is to introduce an `Instrument` abstraction, refactor the existing sample playback to work as a `SamplerInstrument`, and design the system so that adding new instrument types (e.g. `GranularInstrument`) requires minimal changes to the core process loop.

## Background

### Current Architecture

The audio engine has three key layers:

**C++ Native Engine** (`native/src/audio-engine.cpp`):
- `AudioProcessor` base class with `prepare()`, `process()`, `reset()`, `isFinished()`.
- `SamplePlaybackEngine` is the sole concrete implementation — reads from a copied PCM buffer with optional looping.
- `AudioEngine` manages up to 32 processors via a mutex-guarded control queue (Add/Remove/RemoveAll operations applied at block boundaries).
- A lock-free ring buffer emits Position and Ended telemetry events, drained by a ~60 Hz telemetry thread.
- Miniaudio handles cross-platform audio I/O (2-channel float32 playback).

**Utility Process** (`src/utility/audio-engine-process.ts`):
- Loads the native addon and wires a MessagePort for IPC.
- Routes `play`, `stop`, and `stop-all` commands to the native engine.
- Forwards telemetry (position, ended, error) back to the main process.

**IPC Flow**:
- Renderer sends `play-sample` → Main fetches PCM from DB → Main posts `{ type: "play", sampleHash, pcm, sampleRate, loop }` to utility process → Native engine creates `SamplePlaybackEngine`.
- Telemetry flows back: utility → main → renderer.

### What Works Well

- **AudioProcessor base class** is already a clean voice-level abstraction.
- **Control queue pattern** (mutex-guarded messages applied at block boundaries) is a proven real-time-safe design.
- **Lock-free telemetry ring buffer** decouples audio thread from JS callbacks.
- **De-interleaved processing** (`float** outputs, int numChannels, int numFrames`) is standard DSP practice.

### What's Missing

- No grouping of processors into logical instruments.
- No sample caching — PCM transferred on every play.
- No addressing — processors identified only by sample hash, not by instrument + note.
- No voice management (polyphony limits, voice stealing).
- No persistence of instrument configurations.
- No parameter modulation (volume, pan, etc.).

## Related Work / Prior Art

### VST3 / CLAP Plugin Models

Both VST3 and CLAP model instruments as:
- **Processor**: Handles audio rendering. Receives MIDI-like note events and parameter changes in the audio block alongside sample data.
- **Controller**: Handles UI/state. Separated from processor for thread safety.
- **Parameter system**: Typed parameters with ranges, used for automation.
- **Note events**: Note-on (pitch, velocity, channel, note ID), note-off (same), per-note expressions (pressure, tuning, etc.).

Key takeaway: events and parameters are delivered *within* the audio block at sample-accurate positions. For Bounce's initial implementation, block-level granularity (events applied at block start) is sufficient — the control queue already works this way.

### MIDI Model

Standard MIDI messages relevant here:
- **Note On**: channel, note number (0-127), velocity (0-127)
- **Note Off**: channel, note number, velocity
- **Control Change**: channel, CC number, value (0-127)
- **Program Change**: channel, program number

Bounce doesn't need MIDI compatibility, but the note-on/note-off/param message taxonomy is well-proven and maps cleanly to our IPC protocol.

### SuperCollider SynthDef Model

SuperCollider's approach:
- **SynthDef**: A reusable definition (template) for a sound-making process.
- **Synth**: A running instance of a SynthDef on the server.
- **Bus/Group**: Routing and organization.
- Messages: `/s_new`, `/n_set`, `/n_free`.

Relevant insight: the separation of *definition* (what an instrument can do) from *instance* (a running instrument) is useful. In Bounce, an instrument definition specifies the type and loaded samples; the running instrument processes audio and responds to events.

## FluCoMa Algorithm Details

Not directly applicable to this spec. FluCoMa algorithms remain on the analysis side (onset detection, NMF, MFCC, etc.). The instrument abstraction is about playback, not analysis. However, future instruments could use FluCoMa descriptors for intelligent voice selection (e.g. "play the grain closest to this MFCC target").

## Technical Constraints

### Audio Thread Safety
- The audio callback (`processBlock`) must not allocate memory, lock mutexes (except the control queue at block start), or perform I/O.
- Voice allocation and instrument state changes happen via the existing control queue pattern.
- Sample data must be pre-loaded into the instrument before note-on triggers.

### Memory Budget
- Each loaded sample consumes `numSamples * sizeof(float)` bytes in the native engine.
- A 10-second mono sample at 44.1 kHz = ~1.7 MB. A sampler with 16 loaded samples ≈ 27 MB.
- The 32-processor limit applies to total concurrent voices across all instruments, not per-instrument.

### IPC Overhead
- Current design transfers PCM on every `play-sample`. With instruments, PCM is sent once at definition/load time and cached in the native engine.
- IPC messages for note-on/note-off are small (< 100 bytes) and low-latency.

### Platform Requirements
- Must work on macOS, Linux, and Windows.
- C++17 required (already established).
- No new native dependencies beyond miniaudio and node-addon-api.

## Audio Processing Considerations

### Voice Management
- A sampler instrument needs polyphony: multiple notes can be active simultaneously.
- Each active note corresponds to one `AudioProcessor` (voice).
- Voice limit per instrument (e.g. 8 or 16) prevents resource exhaustion.
- Voice stealing policy when limit reached: oldest-note-first is simplest.
- The global 32-processor cap remains as a hard ceiling. This cap may need to be increased or made configurable.

### Sample Caching
- Samples loaded at instrument definition time are stored in the instrument's memory.
- An instrument holds a map of note/key → PCM buffer.
- The `SamplerInstrument` maps sample hashes to cached PCM data.
- A `load-sample` message transfers PCM to a specific instrument.
- Subsequent note-on messages reference the cached data by hash — no PCM transfer needed.

### Mixing
- The `processBlock` loop currently iterates processors and sums their output.
- With instruments, it would iterate instruments, each of which processes its internal voices and writes to the de-interleaved output buffers.
- The summing behavior is identical — instruments produce additive output just like processors do today.

## Terminal UI Considerations

### REPL API Surface

The instrument abstraction introduces new REPL-facing objects:

**Instrument definition:**
```
const inst = instrument.sampler({ name: "keys", samples: [samp1, samp2] })
```

**Playback:**
```
inst.noteOn(60, { velocity: 0.8 })   // trigger note 60
inst.noteOff(60)                      // release note 60
inst.stop()                           // stop all voices
```

**Lifecycle:**
```
inst.free()                           // tear down instrument, release memory
instrument.list()                     // show all defined instruments
```

**Help & display:**
- `instrument.help()` — namespace-level help
- `inst.help()` — instance-level help showing loaded samples, voice count, parameters
- `inst.toString()` — terminal summary: name, type, sample count, active voices

### Tab Completion
- `instrument.` should complete to `sampler`, `list`, `help`
- Instance methods (`noteOn`, `noteOff`, `stop`, `free`, `help`) should complete

## Cross-Platform Considerations

No new platform-specific concerns. The instrument abstraction is implemented entirely in portable C++17 and TypeScript. Miniaudio handles platform audio I/O as before.

## Open Questions — Resolved

1. **Note numbering**: Use MIDI convention (0–127). Mapping note numbers to sample hashes is the sampler's job.

2. **Parameter system**: Start with sane defaults — volume 1.0, polyphony 16. Parameters are per-instrument initially; per-voice modulation can come later.

3. **Instrument namespace name**: `inst` — concise and clear.

4. **Max voices**: Configurable at definition time via a `polyphony` parameter (default 16). Controls maximum concurrent voices for the instrument.

5. **Database schema**: Dedicated `instruments` table — cleaner than overloading `features` given the distinct lifecycle (create/update/delete vs. compute-once).

6. **Playback position telemetry**: Per-voice, but **optional**. Telemetry is off by default and gated by subscribe/unsubscribe IPC messages per instrument. The renderer subscribes when a waveform scene is displayed and unsubscribes when dismissed. This avoids flooding the ring buffer when no visualization is active. Two new IPC messages: `subscribe-telemetry { instrumentId }` and `unsubscribe-telemetry { instrumentId }`. The instrument checks a `telemetryEnabled_` flag in its `process()` loop — zero cost when disabled.

## Research Findings

### The AudioProcessor → Instrument Mapping Is Clean

The existing `AudioProcessor` base class maps naturally to a "voice" within an instrument:

| Current Concept | Instrument Model |
|----------------|-----------------|
| `AudioProcessor` | Voice (owned by instrument) |
| `AudioEngine::processors_` | `Instrument::voices_` |
| `AudioEngine::processBlock()` iterates processors | Iterates instruments, each processes its voices |
| `ControlMsg::Add` with `SamplePlaybackEngine` | `NoteOn` routed to instrument, which spawns a voice |
| `ControlMsg::Remove` by hash | `NoteOff` routed to instrument, which stops a voice |

### Minimal Core Loop Changes

The refactoring to `processBlock()` is minimal:

**Before:**
```cpp
for (auto& processor : processors_) {
    processor->process(chPtrs, numChannels, frameCount);
    // emit telemetry
}
```

**After:**
```cpp
for (auto& instrument : instruments_) {
    instrument->process(chPtrs, numChannels, frameCount);
    // instrument internally manages its voices and emits telemetry
}
```

The `Instrument` class would own the voice pool and expose `process()` which iterates its active voices. Telemetry could be emitted per-voice by the instrument, using the same ring buffer.

### IPC Protocol Extension

New message types needed:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `define-instrument` | TS → Native | Create instrument of a given type with config (polyphony, etc.) |
| `free-instrument` | TS → Native | Destroy instrument, release resources |
| `load-sample` | TS → Native | Cache PCM data in an instrument, mapped to a MIDI note |
| `note-on` | TS → Native | Trigger a voice (note 0–127, velocity) |
| `note-off` | TS → Native | Release a voice (note 0–127) |
| `set-param` | TS → Native | Modify instrument parameter (volume, etc.) |
| `subscribe-telemetry` | TS → Native | Enable per-voice position telemetry for an instrument |
| `unsubscribe-telemetry` | TS → Native | Disable telemetry for an instrument |

These map to new `ControlMsg::Op` variants processed at block boundaries, same as today.

### Database Persistence Is Straightforward

An `instruments` table stores the definition:
```sql
CREATE TABLE instruments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,               -- 'sampler', future: 'granular', etc.
    config_json TEXT,                 -- type-specific config (voice limit, etc.)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, name),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

A junction table links instruments to their loaded samples:
```sql
CREATE TABLE instrument_samples (
    instrument_id INTEGER NOT NULL,
    sample_hash TEXT NOT NULL,
    note_key TEXT,                    -- optional note mapping
    PRIMARY KEY (instrument_id, sample_hash),
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);
```

On project load, the app reads `instruments` + `instrument_samples`, sends `define-instrument` and `load-sample` messages to the native engine to reconstruct the setup.

## Next Steps

Move to PLAN phase to design:
1. C++ `Instrument` base class and `SamplerInstrument` implementation
2. `AudioEngine` refactoring (processors → instruments)
3. Extended IPC protocol (new message types)
4. N-API binding additions
5. Database migration (new tables)
6. TypeScript REPL namespace and result types
7. Testing strategy
8. Implementation order
