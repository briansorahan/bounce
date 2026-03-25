# Plan: MIDI Recording and Playback

**Spec:** specs/midi-recording-and-playback  
**Created:** 2026-03-24  
**Status:** In Progress

## Context

Bounce has polyphonic sampler instruments with `noteOn`/`noteOff`, an 8-channel mixer, and a real-time audio thread — but no way to receive MIDI input from hardware, record sequences, or play them back. Research confirmed that RtMidi is the right C++ library (2-file integration, cross-platform), the existing `RecordingHandle` pattern provides the model for the recording API, and project persistence follows the same pattern as mixer state and REPL scope.

Key resolved decisions from research:
- Single MIDI input device for v1; all channels route to one instrument
- Recording returns a `MidiRecordingHandle` with `.stop()`, or auto-stops with `{ duration: N }`
- MIDI sequences persist per-project and auto-recall on startup
- DB tables go in `migrate001_initialSchema` (no new migration)
- Tests use a synthetic event injection path; no real MIDI hardware needed

## Approach Summary

Add a `midi` REPL namespace backed by:
1. **RtMidi** in the native layer for device enumeration and input callbacks
2. A **lock-free ring buffer** for routing MIDI events from the OS MIDI thread to the audio engine's control queue
3. A **recording engine** in the utility process that timestamps and accumulates events
4. A **playback scheduler** that replays sequences through instruments using wall-clock timing
5. **SQLite persistence** of sequences and routing, scoped to the current project
6. A **minimal SMF parser** for `.mid` file import

## Architecture Changes

```
┌─────────────┐    IPC     ┌─────────────┐   MessagePort   ┌──────────────────┐
│  Renderer    │ ────────→ │   Main       │ ──────────────→ │  Utility Process │
│             │            │             │                  │                  │
│ midi.*()    │            │ midi-       │                  │ RtMidi callback  │
│ namespace    │            │ handlers.ts  │                  │   ↓              │
│             │            │             │                  │ SPSC ring buffer │
│ MidiRecording│ ←──────── │             │ ←────────────── │   ↓              │
│ Handle       │  telemetry │ DB persist   │   telemetry     │ recording engine │
│ SequenceResult│           │ midi_sequences│                │ playback sched.  │
└─────────────┘            └─────────────┘                  └──────────────────┘
```

**New components:**
- `native/src/midi-input.cpp` — RtMidi wrapper: device enumeration, open/close, callback → ring buffer
- `native/src/midi-file-parser.cpp` — minimal SMF type 0/1 parser
- `src/utility/midi-engine.ts` — recording accumulator + playback scheduler in utility process
- `src/electron/ipc/midi-handlers.ts` — IPC bridge and DB persistence
- `src/renderer/namespaces/midi-namespace.ts` — REPL surface
- `src/renderer/results/midi.ts` — result types (MidiRecordingHandle, SequenceResult, etc.)

**Existing components modified:**
- `src/electron/database.ts` — add `midi_sequences` and `midi_events` tables to `migrate001_initialSchema`
- `src/shared/ipc-contract.ts` — add MIDI IPC channels
- `src/electron/ipc/register.ts` — register MIDI handlers
- `binding.gyp` — add RtMidi source, platform defines, link flags
- `src/renderer/bounce-api.ts` — wire `midi` namespace into REPL
- `src/renderer/tab-completion.ts` — add `midi.*` completions

## Changes Required

### Native C++ Changes

**`third_party/rtmidi/` (new, vendored)**
- `RtMidi.h` and `RtMidi.cpp` — vendored from the RtMidi project (Apache 2.0)

**`native/src/midi-input.cpp` + `native/include/midi-input.h` (new)**
- `MidiInput` class wrapping `RtMidiIn`:
  - `listInputPorts()` → returns vector of port name strings
  - `openPort(index)` / `closePort()`
  - RtMidi callback pushes `MidiEvent` structs into a lock-free SPSC ring buffer
  - `drainEvents()` → returns vector of pending `MidiEvent` from ring buffer (called from JS thread)
  - `injectEvent(MidiEvent)` → test-only method that pushes synthetic events into the same ring buffer
- `MidiEvent` struct: `{ uint64_t timestampUs; uint8_t status; uint8_t data1; uint8_t data2; }`
- N-API binding: `listMidiInputs`, `openMidiInput`, `closeMidiInput`, `drainMidiEvents`, `injectMidiEvent`

**`native/src/midi-file-parser.cpp` + `native/include/midi-file-parser.h` (new)**
- `parseMidiFile(const std::string& path)` → returns vector of `MidiFileEvent` with absolute timestamps in ms
- Handles: VLQ decoding, big-endian reads, track chunk iteration, tempo meta events
- Supports Type 0 and Type 1 SMF; rejects Type 2 with error
- N-API binding: `parseMidiFile`

**`native/src/audio-engine-binding.cpp` (modified)**
- Export the new N-API functions: `listMidiInputs`, `openMidiInput`, `closeMidiInput`, `drainMidiEvents`, `injectMidiEvent`, `parseMidiFile`

### TypeScript Changes

**`src/shared/ipc-contract.ts` (modified)**
- Add IPC channels:
  ```
  MidiListInputs         "midi-list-inputs"           (handle)
  MidiOpenInput          "midi-open-input"            (handle)
  MidiCloseInput         "midi-close-input"           (handle)
  MidiStartRecording     "midi-start-recording"       (one-way → utility)
  MidiStopRecording      "midi-stop-recording"        (handle, returns events)
  MidiStartPlayback      "midi-start-playback"        (one-way → utility)
  MidiStopPlayback       "midi-stop-playback"         (one-way → utility)
  MidiSaveSequence       "midi-save-sequence"         (handle, persists to DB)
  MidiLoadSequence       "midi-load-sequence"         (handle, reads from DB)
  MidiDeleteSequence     "midi-delete-sequence"       (handle)
  MidiListSequences      "midi-list-sequences"        (handle)
  MidiLoadFile           "midi-load-file"             (handle, parses .mid)
  MidiInputEvent         "midi-input-event"           (telemetry, main → renderer)
  MidiPlaybackPosition   "midi-playback-position"     (telemetry, main → renderer)
  MidiPlaybackEnded      "midi-playback-ended"        (telemetry, main → renderer)
  ```
- Add corresponding types to `IpcHandleContract` and `IpcSendContract`

**`src/shared/midi-types.ts` (new)**
- Shared types used across all processes:
  ```typescript
  interface MidiEvent {
    timestampMs: number;
    type: 'note_on' | 'note_off' | 'cc';
    channel: number;
    note?: number;        // 0-127
    velocity?: number;    // 0.0-1.0
    ccNumber?: number;
    ccValue?: number;     // 0.0-1.0
  }

  interface MidiSequence {
    id: number;
    name: string;
    projectId: number;
    durationMs: number;
    eventCount: number;
    channels: number[];
    events: MidiEvent[];
  }

  interface MidiInputDevice {
    index: number;
    name: string;
  }
  ```

**`src/utility/midi-engine.ts` (new)**
- Runs in the utility process alongside the audio engine
- **Recording mode**: Polls `drainMidiEvents()` on a timer (~5ms), accumulates events with absolute timestamps, optionally forwards note events to instrument via existing `instrumentNoteOn`/`instrumentNoteOff`
- **Playback mode**: Takes a `MidiEvent[]` array, walks through events using `setTimeout` / `steady_clock` scheduling, dispatches `instrumentNoteOn`/`instrumentNoteOff` for each event
- Handles `midi-start-recording`, `midi-stop-recording`, `midi-start-playback`, `midi-stop-playback` messages from main process
- Sends `midi-input-event` telemetry back to main for live REPL feedback
- Sends `midi-playback-ended` when sequence finishes

**`src/electron/ipc/midi-handlers.ts` (new)**
- `registerMidiHandlers(deps: HandlerDeps)`:
  - `midi-list-inputs`: calls native `listMidiInputs()`, returns device list
  - `midi-open-input` / `midi-close-input`: forwards to utility process
  - `midi-start-recording` / `midi-stop-recording`: forwards to utility process; on stop, receives events back
  - `midi-save-sequence`: inserts into `midi_sequences` + `midi_events` tables
  - `midi-load-sequence`: reads from DB, returns full sequence with events
  - `midi-list-sequences`: returns all sequences for current project
  - `midi-delete-sequence`: deletes sequence and cascade-deletes events
  - `midi-load-file`: calls native `parseMidiFile()`, returns parsed events
  - `midi-start-playback` / `midi-stop-playback`: forwards to utility process

**`src/electron/ipc/register.ts` (modified)**
- Add `registerMidiHandlers(deps)` call in `registerAllHandlers()`

**`src/electron/database.ts` (modified)**
- Add to `migrate001_initialSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS midi_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    duration_ms REAL NOT NULL DEFAULT 0,
    event_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, name)
  );

  CREATE TABLE IF NOT EXISTS midi_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_id INTEGER NOT NULL REFERENCES midi_sequences(id) ON DELETE CASCADE,
    timestamp_ms REAL NOT NULL,
    event_type TEXT NOT NULL,
    channel INTEGER NOT NULL,
    note INTEGER,
    velocity REAL,
    cc_number INTEGER,
    cc_value REAL
  );

  CREATE INDEX IF NOT EXISTS idx_midi_events_sequence
    ON midi_events(sequence_id, timestamp_ms);
  ```
- Add `DatabaseManager` methods: `saveMidiSequence()`, `getMidiSequence()`, `listMidiSequences()`, `deleteMidiSequence()`, `getMidiRouting()`, `saveMidiRouting()`

**`src/renderer/namespaces/midi-namespace.ts` (new)**
- Creates the `midi` namespace object with all REPL-facing methods
- Wires to IPC calls via `window.electron.*`

**`src/renderer/results/midi.ts` (new)**
- `MidiDevicesResult` — lists port names with indices
- `MidiDeviceResult` — shows opened port name and status
- `MidiRecordingHandle` — active recording handle with `.stop()` returning `MidiSequencePromise`
- `MidiSequenceResult` — displays name, event count, duration, channels; has `.play(instrument)` and `.stop()` methods
- `MidiSequencePromise` — thenable wrapper for auto-await in REPL
- `MidiSequencesResult` — list of saved sequences
- All extend `BounceResult` with terminal summaries and `help()`

**`src/renderer/bounce-api.ts` (modified)**
- Import and wire `midi` namespace into REPL scope
- Add `midi` to global `help()` listing

**`src/renderer/tab-completion.ts` (modified)**
- Add `midi.` completions: `devices`, `open`, `close`, `record`, `stop`, `sequences`, `load`, `help`

### Terminal UI Changes

**`midi.devices()` display:**
```
MIDI Input Devices
  0  USB MIDI Keyboard
  1  Launchpad Mini MK3
```

**`midi.open(0)` display:**
```
MIDI Input · USB MIDI Keyboard · connected
```

**`midi.record(inst)` display (MidiRecordingHandle):**
```
⏺ MIDI Recording · USB MIDI Keyboard → mysampler · in progress

  h.stop() to finish recording and get a MidiSequence
```

**`h.stop()` / `midi.record(inst, { duration: 2 })` display (MidiSequenceResult):**
```
MidiSequence · "take-1"
  Events     42
  Duration   3.2s
  Channels   1

  seq.play(instrument)  play through instrument
  seq.stop()            stop playback
```

**`midi.sequences()` display:**
```
MIDI Sequences (current project)
  take-1     42 events   3.2s
  bassline   128 events  8.0s
```

**`midi.load("file.mid")` display:**
```
MidiSequence · "file" (imported)
  Events     1024
  Duration   32.5s
  Channels   1, 2, 10
  Type       1 (multi-track)
```

### REPL Interface Contract

| Object / Namespace | `help()` | Terminal Summary |
|---|---|---|
| `midi` (namespace) | ✅ Lists all commands with usage examples | N/A (namespace) |
| `MidiDevicesResult` | ✅ "How to open a device" | Port list with indices |
| `MidiDeviceResult` | ✅ "How to record, close" | Port name + connected status |
| `MidiRecordingHandle` | ✅ "How to stop recording" | Recording indicator + target instrument |
| `MidiSequenceResult` | ✅ "How to play, delete" | Name, event count, duration, channels |
| `MidiSequencesResult` | ✅ "How to play/load a sequence" | List of sequences with summary stats |

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [x] Unit tests and/or Playwright tests are identified for `help()` output
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

**`binding.gyp` (modified)**
- Add to `audio_engine_native` target:
  - Sources: `"third_party/rtmidi/RtMidi.cpp"`, `"native/src/midi-input.cpp"`, `"native/src/midi-file-parser.cpp"`
  - Include dirs: `"third_party/rtmidi"`
  - Platform conditions:
    - macOS: add `"-framework CoreMIDI"` to `OTHER_LDFLAGS`
    - Linux: add `"-lasound"` to libraries (may already be present for miniaudio)
    - Windows: add `"Winmm.lib"` to libraries

**`Dockerfile` (modified, if needed)**
- Verify `libasound2-dev` is already installed (it should be for miniaudio ALSA). If not, add it.

## Testing Strategy

### Unit Tests

**`src/midi-namespace.test.ts` (new)**
- `midi.devices()` returns `MidiDevicesResult` (empty array when no hardware)
- `midi.open()` with invalid index throws meaningful error
- `midi.record()` returns `MidiRecordingHandle`; `.stop()` returns `MidiSequenceResult`
- `midi.record()` with `{ duration: N }` returns `MidiSequencePromise`
- `midi.sequences()` returns `MidiSequencesResult`
- `midi.load()` parses a test `.mid` file correctly
- All result types have `.help()` returning `BounceResult`
- All result types display correct terminal summaries

**`src/midi-file-parser.test.ts` (new)**
- Parses a known Type 0 `.mid` file, verifies event count and timing
- Parses a Type 1 `.mid` file with multiple tracks
- Rejects Type 2 with a clear error
- Handles tempo changes correctly
- Handles edge cases: empty file, truncated file, invalid header

### E2E Tests

**`tests/midi-recording.spec.ts` (new)**
- Open the app, verify `midi.devices()` returns a result (possibly empty)
- Use `midi.__injectEvent()` to simulate note-on/off
- Start recording with `midi.record(inst)`, inject events, call `h.stop()`
- Verify `MidiSequenceResult` displays in terminal with correct event count
- Verify sequence persists: `midi.sequences()` lists it
- Test `midi.record(inst, { duration: 1 })` auto-stops and returns sequence
- Test project persistence: save sequence, switch projects, switch back, verify `midi.sequences()` still lists it

**`tests/midi-playback.spec.ts` (new)**
- Load a test `.mid` file with `midi.load(path)`
- Verify `MidiSequenceResult` display
- Play sequence through instrument, verify playback-ended telemetry
- Stop playback mid-sequence with `seq.stop()`

**`tests/midi-help.spec.ts` (new)**
- `midi.help()` displays namespace help
- Each result type's `.help()` displays correctly

### Manual Testing

- Connect a real MIDI keyboard, verify `midi.devices()` lists it
- Open device, play notes, verify live-through to sampler instrument
- Record a sequence, play it back, verify timing feels correct
- Import a `.mid` file from a DAW, play back through instrument
- Test on macOS and Linux (at minimum)

## Success Criteria

1. `midi.devices()` enumerates available MIDI input ports on macOS and Linux
2. `midi.open(n)` opens a port; incoming notes trigger the target instrument in real time
3. `midi.record(inst)` captures timestamped MIDI events; `.stop()` returns a named sequence
4. `midi.record(inst, { duration: N })` auto-stops after N seconds
5. Sequences persist per-project in SQLite and survive project switch round-trips
6. `midi.load(path)` parses Type 0/1 `.mid` files into playable sequences
7. `seq.play(inst)` plays back a sequence with accurate timing
8. All REPL objects have `help()` and display useful terminal summaries
9. All unit tests and Playwright E2E tests pass (including in Docker CI without hardware)
10. `npm run lint` passes
11. `./build.sh` passes

## Risks & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| RtMidi build fails on one platform | High | Vendor the source; test build in Docker early (phase 1) |
| MIDI callback thread conflicts with audio thread | High | Use SPSC ring buffer (proven pattern from telemetry); never lock in callback |
| Playback timing jitter from JS event loop | Medium | Schedule in utility process C++ layer with `steady_clock`; accept 1-2ms jitter for v1 |
| SMF parser edge cases (malformed files) | Medium | Fuzz-test with known problematic `.mid` files; fail gracefully with error message |
| No MIDI device in CI | Low | Fully mitigated by `injectMidiEvent()` test path |
| Large MIDI files consume memory | Low | Cap sequence length at 100K events for v1; warn user |

## Implementation Order

### Phase 1: Native RtMidi Integration
- Vendor RtMidi into `third_party/rtmidi/`
- Create `native/src/midi-input.cpp` with device enumeration, open/close, callback, ring buffer, drain, inject
- Update `binding.gyp` with RtMidi source, platform defines, link flags
- Verify `npm run rebuild` succeeds on macOS and in Docker

### Phase 2: IPC Plumbing
- Define MIDI types in `src/shared/midi-types.ts`
- Add IPC channels to `src/shared/ipc-contract.ts`
- Create `src/electron/ipc/midi-handlers.ts` with device listing and open/close
- Register in `src/electron/ipc/register.ts`
- Wire utility process message handling in `src/utility/midi-engine.ts`

### Phase 3: Recording Engine
- Implement recording mode in `src/utility/midi-engine.ts` (poll drain, accumulate, live-through)
- Add `midi-start-recording` / `midi-stop-recording` IPC flow
- Add `midi-input-event` telemetry (utility → main → renderer)

### Phase 4: Database Persistence
- Add `midi_sequences` and `midi_events` tables to `migrate001_initialSchema`
- Add `DatabaseManager` methods for CRUD
- Wire save/load/list/delete through IPC handlers
- Implement project-scoped auto-recall on project load

### Phase 5: REPL Namespace and Result Types
- Create `src/renderer/results/midi.ts` with all result types
- Create `src/renderer/namespaces/midi-namespace.ts`
- Wire into `bounce-api.ts` and `tab-completion.ts`
- Implement `MidiRecordingHandle` (handle path) and `MidiSequencePromise` (duration path)
- Add `help()` to all objects and the namespace

### Phase 6: Playback Scheduler
- Implement playback mode in `src/utility/midi-engine.ts`
- Wire `seq.play(inst)` and `seq.stop()` through IPC
- Add `midi-playback-position` and `midi-playback-ended` telemetry

### Phase 7: MIDI File Import
- Create `native/src/midi-file-parser.cpp` (VLQ, tempo map, Type 0/1)
- N-API binding, wire through IPC
- `midi.load(path)` returns `MidiSequenceResult`

### Phase 8: Testing
- Unit tests for namespace, result types, help output, SMF parser
- Playwright E2E tests for recording, playback, persistence, file import
- Verify `npm run lint` and `./build.sh` pass

## Estimated Scope

**Large** (~20 files, C++ and TypeScript, new REPL namespace, DB schema changes)

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
