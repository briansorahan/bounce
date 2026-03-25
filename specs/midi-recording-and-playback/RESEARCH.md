# Research: MIDI Recording and Playback

**Spec:** specs/midi-recording-and-playback  
**Created:** 2026-03-24  
**Status:** Complete

## Problem Statement

Bounce currently has no way to receive MIDI input from hardware controllers or other software, and no way to record, store, or play back MIDI sequences. Users who want to trigger sampler instruments via a keyboard or pad controller must call `noteOn`/`noteOff` manually from the REPL. The goal is to add:

1. **MIDI device discovery and input** — enumerate available MIDI input ports, open one, and route incoming note-on/note-off/CC messages to instruments.
2. **MIDI recording** — capture timestamped MIDI events while a device is open and store them as named sequences in the project database.
3. **MIDI file import** — load a standard MIDI file (.mid) and play it back through instruments assigned to each MIDI channel.
4. **MIDI playback** — play a recorded sequence or imported MIDI file back through a named instrument with accurate timing.

## Background

Bounce already has the key primitives needed for MIDI to be useful:

- Polyphonic sampler instruments (`inst.sampler()`) with `noteOn(note, velocity)` / `noteOff(note)`.
- An 8-channel mixer where each instrument is routed to a channel.
- A real-time audio thread in the utility process (miniaudio callback on a separate thread).
- An IPC message-passing architecture between renderer → main → utility process.

What is missing is the MIDI hardware I/O layer, a recording buffer, a sequence data model, and the REPL surface to drive all of it.

## Related Work / Prior Art

- **Ableton Live** — MIDI tracks record to clips, playback is clock-synced; MIDI routing to instruments is channel-based.
- **SuperCollider** — MIDIIn.connect, MIDIIn.noteOn handlers; very similar to what Bounce's REPL approach would look like.
- **REAPER** — MIDI items on tracks; hardware input routing per track.
- **ChucK** — MidiIn / MidiMsg objects used inline in code, close to Bounce's live-coding philosophy.

For MIDI library selection, the relevant prior art in C++ audio tooling:
- **RtMidi** — de facto standard lightweight cross-platform C++ MIDI I/O library (CoreMIDI / ALSA / WinMM). Apache 2.0. Single `.h` / `.cpp` pair. ~100KB. Very stable.
- **libremidi** — modern C++17 rewrite/extension of RtMidi. Also handles Standard MIDI File (SMF) parsing. Supports additional backends (JACK MIDI, WebMIDI). More featureful but heavier.
- **PortMidi** — older C library; less ergonomic in C++17 context.

## FluCoMa Algorithm Details

Not applicable for this feature.

## Technical Constraints

### MIDI Library Choice

**miniaudio has no MIDI I/O.** The only MIDI-related constants in miniaudio are metadata fields in WAV file headers (midiUnityNote, etc.). A separate library is required.

**Recommendation: RtMidi** for the initial implementation.

Reasons:
- Minimal footprint — two files added to `native/src/` and `native/include/`, no submodule required.
- Stable and battle-tested in similar embedded audio tools.
- Supports all three target platforms out of the box.
- For MIDI file parsing, a thin SMF parser can be added separately (or RtMidi's companion `midifile` library can be used).
- If libremidi is desired later, migration is straightforward since the API shapes are similar.

**Platform dependencies for RtMidi:**
- macOS: `-framework CoreMIDI -framework CoreFoundation` (already linking CoreAudio/CoreFoundation)
- Linux: `-lasound` (libasound-dev; already required for miniaudio ALSA)
- Windows: `winmm.lib` (already available in the MinGW / MSVC toolchain)

### Timing Model

MIDI recording timestamps must be captured in the audio thread or as close to it as possible to avoid jitter from the Node.js event loop. RtMidi delivers callbacks on a dedicated OS MIDI thread with microsecond-resolution timestamps (delta time since last message). Recording should accumulate these deltas into absolute millisecond timestamps.

For playback, we need a simple scheduler. Without a full clock/transport (planned for later), we use wall-clock time (`std::chrono::steady_clock`) relative to a playback start time. Quantization and tempo sync will be added when the transport is implemented.

### MIDI File Format

Standard MIDI Files (SMF) come in three types:
- **Type 0**: Single track, all channels merged. Most common for simple sequences.
- **Type 1**: Multiple synchronous tracks. Most DAW exports.
- **Type 2**: Multiple independent patterns (rare; we can ignore for now).

MIDI file playback requires:
1. Parsing the header and track chunks (variable-length encoding, big-endian integers).
2. Resolving delta times to absolute ticks, then to milliseconds using the tempo map.
3. Scheduling note-on/note-off events to instruments (one instrument per MIDI channel, or one instrument for all channels).

For SMF parsing, two options:
- **Embed a minimal SMF parser** (~200 lines of C++) — full control, no extra dependency.
- **Use the `midifile` C++ library** (Craig Stuart Sapp, BSD-2, header-based) — more complete, handles edge cases.

**Recommendation**: Use a minimal embedded SMF parser for now; it covers type 0 and type 1 files and keeps the dependency count low.

## Audio Processing Considerations

### MIDI Input (Real-Time Path)

RtMidi delivers callbacks on its own thread. The callback must be fast:
1. Stamp the event with `steady_clock::now()`.
2. Push to a lock-free SPSC ring buffer (same pattern as telemetry).
3. If recording is active, drain the ring buffer in the telemetry thread and accumulate events.
4. If live-through is enabled (MIDI input directly triggers the instrument), queue a `ControlMsg::InstrumentNoteOn` (already thread-safe via `controlMutex_`).

### MIDI Playback (Scheduling)

A simple timer-based approach for v1:
- Background thread sleeps until the next event's scheduled time, wakes up, posts the IPC message.
- This runs in the utility process (same process as the audio engine).
- No audio-rate precision needed for note scheduling — 1–2ms jitter is acceptable for non-quantized playback.

### Memory

- Recorded sequences: 128 bytes/event (timestamp + type + note + velocity + channel + padding). At 10 notes/second × 60 seconds = 600 events = ~75KB. Very small.
- Loaded MIDI file: parse into an in-memory vector of events; same order of magnitude.

## Terminal UI Considerations

### New `midi` REPL Namespace

All MIDI functionality lives under a new top-level `midi` namespace (not under `inst` or `mx`).

**Device management:**
```
midi.devices()          → list available MIDI input devices
midi.open(name | index) → open a device; returns a DeviceResult
midi.close()            → close the active device
```

**Recording:**
```
midi.record(instrument, { name? })  → start recording to instrument
midi.stop()                          → stop recording; returns SequenceResult
midi.sequences()                     → list saved sequences
```

**Playback:**
```
seq.play(instrument)                 → play sequence through instrument
seq.stop()                           → stop playback
midi.load(path)                      → parse a .mid file; returns SequenceResult
```

**REPL display requirements:**
- `midi.devices()` returns a `DevicesResult` that lists port names with indices.
- `midi.open()` returns a `DeviceResult` showing the opened port name and status.
- Calling `midi.record()` displays a recording-active indicator; `midi.stop()` displays event count and duration.
- A `SequenceResult` displays: name, event count, duration, MIDI channels present.
- All objects have `.help()`.
- `midi` itself has `midi.help()` at the namespace level.
- `midi` is added to the global `help()` listing.

**Tab completion:** `midi.` completes to `devices`, `open`, `close`, `record`, `stop`, `sequences`, `load`, `help`.

## Cross-Platform Considerations

| Platform | MIDI Backend     | Build Dependency                          |
|----------|-----------------|-------------------------------------------|
| macOS    | CoreMIDI         | `-framework CoreMIDI` (already easy)      |
| Linux    | ALSA sequencer   | `-lasound` (already needed for miniaudio) |
| Windows  | WinMM            | `winmm.lib` (standard toolchain)          |

RtMidi handles all three via preprocessor defines (`__MACOSX_CORE__`, `__LINUX_ALSA__`, `__WINDOWS_MM__`). We configure the correct define per platform in `binding.gyp`.

Linux Docker CI: The GitHub Actions test runner is Ubuntu. `libasound2-dev` is already installed for miniaudio's ALSA backend, so RtMidi ALSA should compile without extra apt packages. However, no physical MIDI device will be present in CI — MIDI input tests must either be skipped in CI or use a virtual ALSA sequencer port (via `aconnect` / `amidi`).

**CI strategy**: Unit-test the MIDI namespace (device listing returns empty array gracefully, sequence play/stop lifecycle) without requiring real hardware. E2E tests can use a mock/stub MIDI device injected in the test environment.

## Open Questions

1. **Single active input device or multiple?** ✅ **Resolved**: Single open MIDI input device for v1. Multi-device is a future concern.

2. **MIDI channel routing** ✅ **Resolved**: All MIDI channels route to a single nominated instrument for v1. Per-channel routing to multiple instruments is deferred.

3. **MIDI output (to hardware)**: Not in scope for v1. Only MIDI input.

4. **Clock/transport integration** ✅ **Resolved**: The transport does not exist yet. For v1, playback uses wall-clock time. The plan should note where transport hooks will eventually be inserted.

5. **MIDI CC (continuous controller) messages** ✅ **Resolved**: Record and store CC events in sequences, but do not route to instrument/mixer parameters yet. That's the modulation matrix feature.

6. **Live-through while recording** ✅ **Resolved**: Incoming MIDI note-on/off events trigger the instrument in real time while recording is active.

7. **MIDI file type support** ✅ **Resolved**: Type 0 and Type 1 only. Type 2 (rare) is out of scope.

8. **Quantization**: Not in v1. Recorded sequences play back with original timing. Quantize command can be added later.

9. **Recording API shape** ✅ **Resolved**: `midi.record(instrument)` returns a `MidiRecordingHandle` with `.stop()` (mirrors the `RecordingHandle` pattern from audio recording in `src/renderer/results/recording.ts`). `midi.record(instrument, { duration: 2 })` returns a `MidiSequencePromise` that auto-stops after the given duration (mirrors the duration path in `sample-namespace.ts`).

10. **Project persistence** ✅ **Resolved**: MIDI sequences and channel routing are saved with the current project and auto-recalled on startup, following the same pattern as mixer state and REPL scope persistence (`mixer_channels`, `repl_env` tables).

11. **Database migration strategy** ✅ **Resolved**: New MIDI tables (`midi_sequences`, `midi_events`) go directly into `migrate001_initialSchema` in `src/electron/database.ts`. No new migration file needed — dev databases will be rebuilt from scratch.

12. **Testing strategy** ✅ **Resolved**: No real MIDI hardware in tests. C++ layer exposes a test-only `injectMidiEvent()` that pushes synthetic events into the same ring buffer that RtMidi callbacks write to. Unit tests verify the `midi` namespace (device listing returns empty array gracefully, record/stop lifecycle). Playwright E2E tests use a test-only `midi.__injectEvent()` to simulate MIDI input end-to-end. CI (Docker) relies entirely on the injection path.

## Research Findings

### Codebase Readiness

The codebase is well-positioned for MIDI:
- The `instrumentNoteOn` / `instrumentNoteOff` primitives exist in C++ and are wired all the way through IPC to the REPL — MIDI is essentially just another source of these calls.
- The control message queue (`controlQueue_` + `controlMutex_`) provides the correct pattern for injecting MIDI-triggered note events without modifying the audio callback directly.
- The telemetry ring buffer pattern can be reused for funneling MIDI events back to the main process during recording.
- The `ChannelStrip.attachedInstrumentId` field provides the instrument-to-channel mapping that MIDI playback needs.

### RtMidi Integration Assessment

RtMidi integrates via two files: `RtMidi.h` and `RtMidi.cpp`. These would live in `native/src/` and `native/include/` (or a `third_party/rtmidi/` directory). The `binding.gyp` needs:
- Source: `native/src/RtMidi.cpp`
- Include: the directory containing `RtMidi.h`
- Platform defines and link flags as described above

RtMidi's callback signature:
```cpp
void midiCallback(double deltatime, std::vector<unsigned char>* message, void* userData);
```
This is exactly what we need to capture note-on/off/CC events.

### SMF Parser Assessment

A minimal SMF parser requires handling:
- Variable-length quantity (VLQ) encoding for delta times
- Big-endian 16/32-bit integer reads
- Track chunk iteration
- Meta events (tempo changes are essential for correct playback timing)
- Note-on/off and CC MIDI events

This is ~200–300 lines of C++ and avoids any external dependency for file parsing. We can embed it directly in `native/src/midi-file-parser.cpp`.

### Database Schema Additions

New tables needed in `migrate001_initialSchema`:

```sql
CREATE TABLE IF NOT EXISTS midi_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  duration_ms REAL NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS midi_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_id INTEGER NOT NULL REFERENCES midi_sequences(id) ON DELETE CASCADE,
  timestamp_ms REAL NOT NULL,
  event_type TEXT NOT NULL,  -- 'note_on' | 'note_off' | 'cc'
  channel INTEGER NOT NULL,
  note INTEGER,              -- 0-127 for note events
  velocity REAL,             -- 0.0-1.0 for note_on
  cc_number INTEGER,         -- for cc events
  cc_value REAL              -- 0.0-1.0 for cc events
);

CREATE INDEX IF NOT EXISTS idx_midi_events_sequence ON midi_events(sequence_id, timestamp_ms);
```

## Next Steps

The PLAN phase should:
1. Define the exact phased implementation (C++ RtMidi integration → IPC plumbing → recording engine → playback scheduler → REPL namespace → DB persistence → E2E tests).
2. Confirm the single-device v1 scope and channel routing approach with the user.
3. Specify the full `midi` REPL API contract (help strings, display formats for all result types).
4. Design the CI strategy for MIDI device absence in Docker.
