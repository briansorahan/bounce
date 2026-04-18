# Research: Mock Audio Engine

**Spec:** specs/mock-audio-engine
**Beads Parent Issue:** bounce-20g
**Created:** 2026-04-08
**Status:** Complete

## Problem Statement

Five workflow test tasks remain deferred because they require the audio engine (`audio_engine_native` C++ addon) or real-time audio behavior:

- `bounce-wf-playback` — tests playback position advancement
- `bounce-wf-transport-pattern` — tests BPM, transport start/stop, pattern DSL
- `bounce-wf-granular-instrument` — tests instrument lifecycle and sample loading

(Two others — `bounce-wf-play-component-then-play-full` and `bounce-wf-granularize` — are blocked by renderer DOM state and DatabaseManager respectively; this spec does not address them.)

Workflow tests run in plain Node.js with no Electron, no renderer, and no native audio hardware. They test IPC contracts and service state via JSON-RPC pairs. Without a mock audio engine, any workflow that sends commands to the audio engine has no handler and will fail.

## Background

### Audio Engine Architecture

In production, the audio engine is an Electron utility process (`src/utility/audio-engine-process.ts`) that:
- Loads `audio_engine_native` (miniaudio + rtmidi C++ addon)
- Receives `AudioEngineCommand` messages over a `MessagePort`
- Sends `AudioEngineTelemetry` messages back over the same port

The `AudioEngineCommand` union (`src/shared/audio-engine-protocol.ts`) covers:
- `play` / `stop` / `stop-all` — legacy sample playback
- `define-instrument` / `free-instrument` — instrument lifecycle
- `load-instrument-sample` — loads PCM data into an instrument voice
- `instrument-note-on/off` / `instrument-stop-all` — note events
- `set-instrument-param` — param control
- `subscribe/unsubscribe-instrument-telemetry` — telemetry gating
- (Mixer and transport commands handled by the process but not in the shared union type)

Telemetry types (`AudioEngineTelemetry`): `position`, `ended`, `error`.

The `AudioEngineNative` interface in `audio-engine-process.ts` also exposes:
- Mixer API: `mixerSetChannelGain/Pan/Mute/Solo`, `mixerAttachInstrument`, `mixerDetachChannel`, `mixerSetMasterGain/Mute`
- Transport API: `transportStart/Stop/SetBpm/SetPattern/ClearPattern`, `onTransportTick`
- Device info: `onDeviceInfo`

### Service Layer vs Audio Engine

The domain services (`InstrumentService`, `MixerService`, etc.) do NOT call the audio engine. They manage state only (emit domain events → `InMemoryPersistenceService` applies them → `InMemoryQueryService` reads them). The audio engine is called directly from Electron IPC handlers in `src/electron/ipc/`.

This means:
- Granular instrument **state** tests (create, add sample, list) → use `instrumentClient`, no mock needed
- Granular instrument **playback** tests (noteOn, noteOff) → need mock audio engine
- Transport **state** tests (BPM get/set, pattern storage) → need a transport state tracker
- Playback **state** tests (play, stop, current state) → need mock audio engine

### What the Playwright Specs Actually Test

**granular-instrument.spec.ts**: Tests terminal output for `inst.granular()`, `g.load()`, `g.set()`, `g.noteOn()`, `g.noteOff()`, help text. The terminal output tests are renderer-dependent. The underlying state changes can be tested via `instrumentClient`.

**transport-pattern.spec.ts**: Tests BPM get/set, range validation, `transport.start/stop`, `pat.xox()` pattern DSL parsing, and transport tick telemetry. BPM/start/stop/pattern go to the audio engine. Tick telemetry is asynchronous real-time behavior. The pattern DSL parsing is a pure function.

**playback.spec.ts**: Tests position advancement during playback, stop, stop-all, multiple concurrent playbacks. All require real-time position telemetry — the most time-bound of the three.

## Technical Constraints

- All workflow test services must use JSON-RPC (`vscode-jsonrpc` MessageConnection pattern)
- Mock must be pure TypeScript — no C++, no native addons, no hardware
- The mock must be deterministic for test assertions (no real timers unless controllable)
- Only lives in `tests/workflows/` — not shipped in production builds

## Research Findings

### What the Mock Needs

**AudioEngineRpc contract** (`src/shared/rpc/audio-engine.rpc.ts`):
- Request methods: `play`, `stop`, `stopAll`, `defineInstrument`, `freeInstrument`, `loadInstrumentSample`, `instrumentNoteOn`, `instrumentNoteOff`, `instrumentStopAll`, `setInstrumentParam`, `transportStart`, `transportStop`, `setBpm`, `getBpm`, `setPattern`, `clearPattern`
- All return void or simple results (no streaming, no real-time push needed for test assertions)

**MockAudioEngineService** (`tests/workflows/mock-audio-engine.ts`):
- Implements the handlers interface
- Tracks state: active playbacks, BPM, instrument definitions, loaded samples, transport running, pattern assignments
- Exposes state query methods (for workflow checks): `getPlaybackState()`, `getBpm()`, `isTransportRunning()`, `getInstruments()`, `getPattern(channelIndex)`
- Does NOT fire real-time telemetry (position events, transport ticks) — workflow tests check state directly rather than observing async events

### Granular Instrument Tests (No Mock Needed for State)

The InstrumentService + InstrumentRpc already provide:
- `createInstrument` → create granular instrument record
- `addInstrumentSample` → attach sample to instrument
- `getInstrumentSamples` → verify samples loaded
- `deleteInstrument` → verify cleanup

The `noteOn`/`noteOff` commands are audio engine fire-and-forget. Workflow tests can test them by invoking `audioEngineClient.invoke("instrumentNoteOn", ...)` and verifying the mock recorded the command.

### Transport Pattern Tests (Partial — No Tick Telemetry)

The Playwright spec includes a tick telemetry test (`transport tick telemetry fires`). This is real-time async behavior — the mock can record `transportStart` was called, but firing actual ticks requires a timer loop. This test will remain in Playwright only (permanently deferred from workflow tests).

The remaining transport tests (BPM, start/stop, pattern parsing) are fully testable via the mock.

### Playback Tests

Playwright tests check position advancement over time. Workflow tests can verify:
- After `play(sampleHash, ...)`, the mock records the sample as active
- After `stop(sampleHash)`, the mock records it as stopped
- After `stopAll()`, all active playbacks are cleared

Position advancement over time is inherently real-time and will remain Playwright-only.

## Open Questions

None — scope is clear.

## Next Steps

- Create `AudioEngineRpc` contract
- Implement `MockAudioEngineService`
- Wire into `bootServices()`
- Write workflow files for playback, transport-pattern, and granular-instrument
- Add to `run.ts`
