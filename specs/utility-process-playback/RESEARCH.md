# Research: Utility-Process Playback Engine

**Spec:** specs/utility-process-playback  
**Created:** 2026-03-16  
**Status:** Complete

## Problem Statement

Bounce's current playback path is centered on a renderer-owned `AudioManager` that plays one in-memory buffer at a time through Web Audio. That is enough for basic `sample.play()` and full-buffer looping, but it is a poor fit for the next set of playback goals:

- multiple samples looping at once
- independent control over playback speed and pitch
- granular synthesis with realtime scheduling
- renderer waveform updates that stay accurate while the audio engine runs elsewhere

The research question is whether Bounce should keep extending renderer-side playback or move transport and DSP into a dedicated utility-process playback engine with native code.

## Background

Current playback is renderer-driven:

- `sample.play()` / `sample.loop()` call `startPlayback(...)` in `src/renderer/bounce-api.ts`
- `startPlayback(...)` loads audio if needed, then calls `audioManager.playAudio(...)`
- `AudioManager` in `src/renderer/audio-context.ts` creates a one-channel `AudioBuffer`, creates an `AudioBufferSourceNode`, connects it to the destination, and starts playback
- playback cursor updates are derived from `AudioContext.currentTime` and forwarded into the waveform/scene visualizers in `src/renderer/app.ts`

Current storage is main-process/SQLite-driven:

- decoded audio is read in the main process and stored in `bounce.db`
- the `samples` table stores full PCM payloads in `samples.audio_data` as a BLOB
- `DatabaseManager` opens the database at `app.getPath("userData")/bounce.db`
- derived assets such as slices and components are also persisted and can be looked up by hash

This means Bounce already has a durable sample store, but its live transport is still a single renderer-local transport.

## Related Work / Prior Art

- **Current Bounce renderer transport** — simple, easy to reason about, but structured around a single current sample and a single source node.
- **Web Audio polyphonic engines** — good for lightweight browser-side layering, but more awkward once a project needs custom realtime DSP, precise voice management, or native audio integration.
- **AudioWorklet architectures** — common browser solution for keeping DSP off the main UI thread. This is the strongest renderer-side alternative to a utility-process design.
- **Native audio engines in DAWs / samplers** — typically run scheduling and DSP on a dedicated audio callback thread with lock-free communication to non-realtime threads.
- **SuperCollider / Max/MSP / granular samplers** — granular time-stretching is usually implemented in a DSP engine that owns its own scheduler and voice lifecycle rather than dispatching grains from a UI process.
- **Electron utility processes** — useful for isolating long-running work and hosting native modules, but not themselves a realtime audio primitive; they still need a native engine thread for actual audio callback work.

## FluCoMa Algorithm Details

No FluCoMa algorithm directly solves the transport problem described here.

This work is primarily about realtime playback architecture, scheduling, and DSP hosting. FluCoMa may still be useful for offline analysis or resynthesis inputs, but the proposed granular playback engine should be treated as a transport/DSP subsystem rather than a new FluCoMa wrapper.

## Technical Constraints

- Bounce is an Electron app with `contextIsolation: true`; renderer code communicates through preload-exposed IPC.
- Electron utility processes are created from the main process. Renderer processes do not communicate with them directly by default; the main process must broker communication, typically via IPC and/or transferred `MessagePort`s.
- A utility process with Node enabled is still not a realtime audio thread. If Bounce moves playback there, the process should host a native audio engine that owns its own high-priority callback thread.
- The current playback design is effectively single-transport and single-buffer. It does not model polyphonic voices, sample caches, or voice groups.
- Bounce already persists sample data in SQLite BLOBs, but current code does not configure SQLite WAL mode or other explicit multi-process tuning.
- SQLite access is acceptable for sample lookup/loading, but not as the timing-critical source for per-grain realtime reads.

## Audio Processing Considerations

- **Polyphony:** multiple simultaneous loops require a voice model, not just repeated calls to a single shared `playAudio(...)` path.
- **Pitch-independent speed change:** changing `AudioBufferSourceNode.playbackRate` is not sufficient because it changes both speed and pitch. A dedicated granular or phase-vocoder style engine is needed.
- **Scheduling:** sample-accurate grain triggering should happen inside the DSP engine, not over Electron IPC.
- **Telemetry:** playback position, loop state, and voice summaries should be exported from the engine through a lock-free queue to a non-realtime bridge thread, then forwarded to the renderer at a throttled UI rate.
- **Sample ownership:** the engine should preload requested sample data from SQLite into RAM before playback begins. SQLite should act as an asset store and persistence layer, not a live streaming scheduler.
- **Cache policy:** the design will need explicit limits for sample memory, derived-grain caching, and eviction behavior.
- **Channel layout:** current playback creates a one-channel Web Audio buffer even though stored sample metadata tracks channel count. A new engine should decide whether MVP remains mono or whether stereo/multichannel playback becomes part of the redesign.
- **Clocking:** the renderer should treat engine telemetry as snapshots and may interpolate between them for smoother cursor display, but must not become the timing authority.

## Terminal UI Considerations

The user still needs responsive waveform feedback while playback runs in another process.

- The renderer waveform display should continue to show current playback position while a sample or loop is active.
- UI updates do not need sample-accurate delivery; they need stable, monotonic snapshots at a reasonable rate.
- If the REPL surface remains `sample.play()`, `sample.loop()`, and `sample.stop()`, the feature may be able to preserve the existing user-facing API while swapping the backend transport.
- If this work introduces new REPL-visible concepts such as transport state objects, engine status, voice groups, or granular playback handles, each one must provide:
  - a `help()` entry point with short usage examples
  - a useful terminal summary when displayed
  - focused test coverage for help text and returned-object display behavior
- Tab completion must include any newly exposed REPL commands or objects.

## Cross-Platform Considerations

- Any native audio backend must work on macOS, Linux, and Windows.
- A utility process that loads native code on macOS may need Electron's `allowLoadingUnsignedLibraries` utility-process option during development, depending on how the addon is packaged and signed.
- Thread priority, device APIs, and buffering behavior differ across platforms; the engine abstraction should hide platform-specific audio backend details behind a common transport API.
- SQLite shared access is feasible because all participating processes are on the same host, but multi-process access should be configured deliberately.

## Open Questions

1. Which audio backend should the native engine use?
   - Candidates include a custom backend layer, PortAudio, miniaudio, or another small cross-platform host API.

2. Should the utility process host a Node native addon, or should it launch a thinner native helper process?
   - Utility process + native addon appears to fit Bounce's existing Electron architecture best, but the final backend boundary is still open.

3. What is the minimal MVP scope?
   - Possibilities: polyphonic looping first, granular time-stretch second; or both in one transport redesign.

4. Should the first version preserve the existing REPL transport API exactly, or introduce a richer transport object?

5. What telemetry payload is sufficient for waveform visualization?
   - Likely current playhead frame, loop region, sample hash/voice identifier, transport state, and dropped-event counters.

6. How should sample preloading and cache eviction work for large corpora?

7. Is stereo support part of this effort, or should the first version keep the current mono-oriented assumptions?

## Research Findings

1. The current renderer transport is the main limitation for advanced playback. Bounce's existing Web Audio path is simple and workable for single-buffer playback, but it does not provide the right architectural foundation for polyphonic realtime DSP.

2. A utility-process playback engine is a reasonable direction if Bounce wants stronger isolation from renderer jank, native DSP implementation, and a transport model built around voices instead of a single current sample.

3. The utility process alone does not eliminate jitter. Jitter is avoided only if all timing-critical scheduling stays inside a native audio engine thread and IPC is limited to coarse control messages plus throttled telemetry.

4. SQLite can serve as the shared sample repository. The DSP process can open `bounce.db` directly and fetch `samples.audio_data` by hash, but playback should operate on preloaded in-memory sample buffers rather than repeated realtime database reads.

5. If the database is shared across processes, Bounce should enable WAL mode and use separate connections per process. That improves reader/writer concurrency and is more appropriate than the default rollback-journal behavior for this architecture.

6. Renderer-to-utility communication is viable in Electron, but it is a brokered model. The main process is responsible for creating the utility process and setting up the communication channel.

7. Playback-position feedback should flow from the audio callback thread through a lock-free queue into a non-realtime bridge thread, then across Electron IPC to the renderer. The renderer can smooth cursor motion visually, but should not drive transport timing.

8. A research-to-plan handoff should treat this as an architectural migration, not just an optimization. The work likely spans native code, main-process orchestration, preload/IPC design, renderer transport integration, caching, and validation strategy.

## Next Steps

- Choose the MVP boundary for the first implementation phase.
- Decide whether the native engine backend will be a C++ addon inside the utility process or a helper launched alongside it.
- Define the control protocol between renderer, main process, utility process, and native engine.
- Define the sample cache lifecycle, including how hashes map to preloaded buffers and how eviction works.
- Decide whether the initial plan preserves the current REPL API or introduces new transport-visible objects.
- Document testing strategy for transport correctness, cursor telemetry, and REPL-facing behavior in `PLAN.md`.
