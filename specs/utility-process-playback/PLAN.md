# Plan: Utility-Process Playback Engine

**Spec:** specs/utility-process-playback  
**Created:** 2026-03-16  
**Status:** In Progress

## Context

From RESEARCH.md: the current renderer-owned `AudioManager` is a single-transport Web Audio engine. It cannot support polyphonic looping, precise voice management, or future realtime DSP (granular, spectral). The goal is to migrate all playback into a native audio engine hosted in an Electron utility process, while preserving the existing `sample.play()` / `sample.loop()` REPL API exactly.

All open questions resolved. See RESEARCH.md findings 9–17 for decisions.

## Approach Summary

1. Introduce a new native C++ audio engine built on **miniaudio**, exposing a CLAP-inspired `AudioProcessor` interface.
2. `SamplePlaybackEngine` is the only concrete processor for MVP (polyphonic looping).
3. Host the native addon in a new **Electron utility process** (`src/utility/audio-engine-process.ts`).
4. The **main process** brokers all communication: it fetches PCM from SQLite and forwards control messages to the utility process via `MessagePort`. It also forwards telemetry back to the renderer via IPC.
5. The **renderer** replaces direct `AudioManager` calls with IPC messages. Waveform cursor updates are driven by telemetry from the engine rather than `AudioContext.currentTime`.
6. `sample.play()` and `sample.loop()` are unchanged from the user's perspective.

## Architecture

```
Renderer (TypeScript)
  sample.play() / sample.loop() / sample.stop()
      │  ipcRenderer (existing preload channels)
      ▼
Main Process (TypeScript)
  - fetches PCM from SQLite by hash
  - creates / manages utility process
  - forwards control → utility process via MessagePort
  - forwards telemetry → renderer via ipcMain
      │  MessagePort (transferred at utility process startup)
      ▼
Utility Process (TypeScript + native addon)
  - receives MessagePort messages
  - calls native AudioEngine N-API bindings
  - receives telemetry callbacks via napi_threadsafe_function
  - posts telemetry back to main via MessagePort
      │  N-API direct calls / threadsafe callbacks
      ▼
Native Audio Engine (C++)
  - AudioEngine owns miniaudio device + processor pool
  - audio callback thread: iterates active processors, mixes output
  - lock-free ring buffer: audio thread → bridge → napi_threadsafe_function
```

## Message Protocol

### Control messages (main → utility process, via MessagePort)

```typescript
type PlayMessage  = { type: 'play';  sampleHash: string; pcm: Float32Array; sampleRate: number; loop: boolean }
type StopMessage  = { type: 'stop';  sampleHash: string }
type StopAllMessage = { type: 'stop-all' }
```

PCM is transferred (not copied) using `ArrayBuffer` transfer — zero-copy across the MessagePort boundary.

### Telemetry messages (utility process → main, via MessagePort)

```typescript
type PositionMessage = { type: 'position'; sampleHash: string; positionInSamples: number }
type EndedMessage    = { type: 'ended';    sampleHash: string }
```

### IPC channels (renderer ↔ main, existing preload pattern)

| Channel | Direction | Payload |
|---|---|---|
| `play-sample` | renderer → main | `{ hash: string, loop: boolean }` |
| `stop-sample` | renderer → main | `{ hash?: string }` |
| `playback-position` | main → renderer | `{ hash: string, positionInSamples: number }` |
| `playback-ended` | main → renderer | `{ hash: string }` |

## Changes Required

### Native C++ (new files under `native/src/` and `native/include/`)

#### `native/include/audio-processor.h`
Abstract base class:
```cpp
class AudioProcessor {
public:
    virtual void prepare(const float* pcm, int numSamples,
                         double sampleRate, int maxBlockSize) = 0;
    virtual void process(float** outputs, int numChannels,
                         int numFrames) = 0;
    virtual void reset() = 0;
    virtual const std::string& hash() const = 0;
    virtual ~AudioProcessor() = default;
};
```

#### `native/include/audio-engine.h` / `native/src/audio-engine.cpp`
- Owns the `ma_device` (miniaudio device).
- Owns a fixed-size processor pool (e.g. 32 slots) with atomic active flags.
- Lock-free control queue: main thread enqueues add/remove processor messages; audio callback applies them at the top of each block.
- Lock-free telemetry ring buffer: audio callback writes `{hash, positionInSamples}` snapshots; a bridge thread drains this and calls a registered `napi_threadsafe_function` to deliver telemetry to the utility process JS event loop.
- `AudioEngine::play(hash, pcm, sampleRate, loop)` — constructs a `SamplePlaybackEngine`, calls `prepare()`, enqueues add message.
- `AudioEngine::stop(hash)` — enqueues remove message for matching processor.
- `AudioEngine::stopAll()` — enqueues remove message for all active processors.

#### `native/include/sample-playback-engine.h` / `native/src/sample-playback-engine.cpp`
- `SamplePlaybackEngine : AudioProcessor`
- Owns a `std::vector<float>` copy of the PCM (loaded during `prepare()`).
- `process()`: advances a read pointer, copies samples to output buffer, handles loop point wrap-around, emits ended event when non-looping playback completes.
- Mono only for MVP.

#### `native/src/audio-engine-binding.cpp`
N-API bindings exposing `AudioEngine` to Node.js:
- `AudioEngine` constructor / destructor
- `engine.play(hash, pcmBuffer, sampleRate, loop)`
- `engine.stop(hash)`
- `engine.stopAll()`
- `engine.onPosition(callback)` — registers the `napi_threadsafe_function` for telemetry
- `engine.onEnded(callback)` — registers callback for playback-ended events

#### `binding.gyp`
- Add a second target `audio_engine_native` with miniaudio as a header-only include and the new source files.
- miniaudio is a single-header library; add it under `third_party/miniaudio/`.

### TypeScript — New Files

#### `src/utility/audio-engine-process.ts`
Entry point for the utility process:
- Receives the `MessagePort` from the main process on startup.
- Loads `audio_engine_native` addon and constructs `AudioEngine`.
- Registers `onPosition` and `onEnded` callbacks; forwards to main via MessagePort.
- Handles `play`, `stop`, `stop-all` messages from main by calling the native engine.

### TypeScript — Modified Files

#### `src/electron/main.ts`
- On app ready: create the utility process pointing at `src/utility/audio-engine-process.ts`; create a `MessageChannel`; transfer one port to the utility process; retain the other for main-side communication.
- Add `ipcMain` handler for `play-sample`: fetch PCM from SQLite by hash, post `PlayMessage` to utility process via retained port.
- Add `ipcMain` handler for `stop-sample`: post `StopMessage` or `StopAllMessage`.
- On `position` message from utility process: forward `playback-position` to renderer via `ipcMain` / `webContents.send`.
- On `ended` message from utility process: forward `playback-ended` to renderer.

#### `src/renderer/audio-context.ts`
- Remove `AudioManager.playAudio()` and `AudioManager.stopAudio()` internal implementation.
- `playAudio()` becomes a thin wrapper that sends `play-sample` IPC and registers the playback key.
- `stopAudio()` sends `stop-sample` IPC.
- `getPlaybackPositions()` is driven by the last-received `playback-position` telemetry snapshot rather than `AudioContext.currentTime` arithmetic.
- Keep the `AudioContext` for any remaining Web Audio use (e.g. future effects chain); just remove the source-node playback path.

#### `src/renderer/app.ts`
- Add listener for `playback-position` IPC: update active playback position snapshots.
- Add listener for `playback-ended` IPC: remove from active playbacks, trigger waveform cursor cleanup.
- Remove any code that derives position from `AudioContext.currentTime` directly.

#### `src/electron/preload.ts`
- Expose `play-sample` and `stop-sample` send channels.
- Expose `playback-position` and `playback-ended` receive channels (already partially present; verify completeness).

### Terminal UI Changes

No visible changes to the user. Waveform cursors continue to track playback position; they are now driven by engine telemetry snapshots instead of `AudioContext.currentTime` interpolation.

### REPL Interface Contract

No new REPL-visible objects, namespaces, or functions. `sample.play()`, `sample.loop()`, and `sample.stop()` preserve their existing signatures and `help()` output exactly.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not — no new objects introduced
- [x] Every returned custom REPL type defines a useful terminal summary — no new return types
- [x] Unit tests and/or Playwright tests are identified for `help()` output — existing tests unchanged
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior — existing tests unchanged

### Configuration/Build Changes

- Add `third_party/miniaudio/` as a git submodule or vendored header.
- Add `audio_engine_native` target to `binding.gyp`.
- Add `src/utility/audio-engine-process.ts` to `tsconfig.electron.json` include paths.
- Update `package.json` `rebuild` script to rebuild both native targets.
- Configure Electron `BrowserWindow` / utility process options: utility process needs `nodeIntegration: true` (it is a trusted internal process, not a renderer).

## Testing Strategy

### Unit Tests

- `native/tests/sample-playback-engine.test.cpp` (or via N-API test harness): verify read pointer advances correctly, loop wrap-around, ended event fires for non-looping playback.
- `native/tests/audio-engine.test.cpp`: verify play/stop lifecycle, processor pool slot management.

### E2E Tests (Playwright)

- Existing `tests/playback.spec.ts` must continue to pass unchanged — this is the primary correctness signal.
- Add a test: call `sample.loop()`, verify waveform cursor is moving (position telemetry arriving), then call `sample.stop()`, verify cursor stops.
- Add a test: play two samples simultaneously, verify both cursors update independently.

### Manual Testing

- Play a sample with `sample.play()`, verify audio is heard and waveform cursor tracks.
- Loop a sample with `sample.loop()`, verify it loops cleanly without glitches.
- Play two samples simultaneously, verify both play and both cursors update.
- Stop individual and all playbacks.
- Verify no audio artifacts on repeated play/stop cycles.

## Success Criteria

- `sample.play()` and `sample.loop()` produce audible output via the native engine.
- All existing Playwright playback tests pass without modification.
- Waveform cursor tracks playback position driven by engine telemetry.
- Two simultaneous loops play and display cursors independently.
- `sample.stop()` stops playback cleanly with no dropout artifacts.
- No renderer-thread audio glitches under normal Electron UI interaction.

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| miniaudio device initialization fails on some platforms | Add explicit error logging from `prepare()`; fall back to a no-op engine that logs clearly rather than crashing |
| napi_threadsafe_function teardown race on app quit | Call `napi_release_threadsafe_function` in `AudioEngine` destructor; ensure utility process shuts down before main process |
| PCM ArrayBuffer transfer leaves renderer with detached buffer | Main process fetches fresh PCM from SQLite per play call; renderer never holds the PCM buffer |
| Telemetry floods IPC at audio-thread rate | Bridge thread throttles telemetry to ~60Hz before posting to MessagePort |
| Utility process crashes silently | Add `utilityProcess.on('exit')` handler in main; log and attempt restart |
| Existing Playwright tests break during migration | Keep `AudioManager` Web Audio path alive behind a feature flag until native path is validated end-to-end |

## Implementation Order

1. Add `third_party/miniaudio/` and verify it compiles in a minimal C++ test binary.
2. Implement `AudioProcessor` interface and `SamplePlaybackEngine`; write C++ unit tests.
3. Implement `AudioEngine` with miniaudio device and processor pool; write C++ unit tests.
4. Write `audio-engine-binding.cpp` N-API bindings; add `audio_engine_native` target to `binding.gyp`; verify `engine.play()` produces audio in a Node.js test script.
5. Implement `src/utility/audio-engine-process.ts`; verify MessagePort ↔ native round-trip in isolation.
6. Update `main.ts` to create utility process, broker IPC, and forward telemetry.
7. Update `preload.ts` with new channels.
8. Update `audio-context.ts` to route through IPC (keep Web Audio path behind flag).
9. Update `app.ts` to consume `playback-position` / `playback-ended` IPC.
10. Run Playwright suite; fix regressions.
11. Remove Web Audio playback path and feature flag.
12. Manual testing across macOS and Linux.

## Estimated Scope

Large

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (REPL API unchanged)
- [x] All sections agree on the data model / schema approach (no schema changes; SQLite read-only from utility process perspective)
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries (no new REPL surface)
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
