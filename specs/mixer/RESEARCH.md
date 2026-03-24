# Research: 8-Channel Mixer

**Spec:** specs/mixer  
**Created:** 2026-03-24  
**Status:** Complete

## Problem Statement

Bounce's audio engine currently mixes all sample playbacks and instruments into a single stereo output with no per-source volume, pan, or routing control. Users need a mixer to independently control audio levels, stereo positioning, and muting/soloing of instruments — essential for any multi-source audio workflow.

## Background

The current audio engine (`native/src/audio-engine.cpp`) processes all `SamplePlaybackEngine` instances and `Instrument` instances additively into a single pair of de-interleaved stereo buffers (ch0, ch1), then re-interleaves to the output device. There is no concept of channels, buses, or per-source gain/pan.

The instrument system already supports a `setParam(paramId, value)` pattern for controlling per-instrument parameters (currently only volume). This pattern can be extended to mixer channel parameters.

## Related Work / Prior Art

- **DAW mixers** (Ableton, Logic, Reaper): Fixed or dynamic channel count, per-channel gain/pan/mute/solo, master bus, metering.
- **Hardware mixers**: Fixed channel count, simple signal flow (channel → bus → master).
- **SuperCollider**: Bus-based routing where synths write to numbered buses, mixer-like control via `Group` ordering.

The fixed 8-channel + preview + master topology mirrors a small hardware mixer — simple, predictable, no graph configuration needed.

## Technical Constraints

### Audio Engine Threading Model (3 threads)
1. **Node.js event loop** (utility process) — receives IPC, calls native methods
2. **miniaudio audio thread** (real-time) — runs `processBlock()`, must be lock-free except for brief control queue drain
3. **Telemetry thread** (~60 Hz) — drains ring buffer, dispatches callbacks via `ThreadSafeFunction`

All mixer parameter changes must flow through the existing `controlMutex_`-protected `controlQueue_` and be applied at block boundaries in `processBlock()`.

### IPC Flow
Renderer → Main → Utility → Native C++ (via MessagePort). One-way `ipcRenderer.send` for control, telemetry flows back via `webContents.send`. Latency is block-bounded (~11.6ms at 44.1kHz/512 frames).

### Current Limits
- `kMaxProcessors = 32` for legacy sample playback
- Stereo only (2 channels, hardcoded)
- Sample rate: device default (not configurable)
- Ring buffer: 1024 telemetry events

## Audio Processing Considerations

### Mixer Channel Processing (per block)
Each channel strip needs to:
1. Zero its own stereo buffer
2. Let its attached instrument (if any) render into that buffer
3. Apply gain (dB → linear conversion: `powf(10.f, dB / 20.f)`)
4. Apply pan (constant-power or linear; constant-power preferred: `L = cos(θ), R = sin(θ)` where `θ = (pan+1) * π/4`)
5. Apply mute (zero buffer) or solo logic
6. Accumulate into master bus buffer

### Preview Channel
Same processing as user channels but dedicated to `sample.play()` / `sample.loop()` — the legacy `processors_` vector. Existing SamplePlaybackEngine instances render into the preview channel instead of directly into the output.

### Master Bus Processing
1. Sum all channel outputs (post-gain, post-pan, post-mute/solo)
2. Apply master gain
3. Apply master mute
4. Copy to final interleaved output

### Peak Metering
- Compute per-channel peak amplitude per block: `peak = max(|sample|)` across all frames
- Apply peak-hold with decay: hold peak value for ~1.5s, then decay at ~20 dB/s
- Emit metering telemetry via the existing ring buffer at ~60 Hz (telemetry thread rate)
- New telemetry event kind needed: `TelemetryEvent::Kind::MixerLevels`

### Memory/Performance
- 10 channel buffers (8 user + 1 preview + 1 master) × 2 channels × 512 frames × 4 bytes = ~40 KB per block — negligible
- Per-channel processing is trivial compared to instrument rendering
- Metering adds one pass over each channel buffer per block

## Terminal UI Considerations

### REPL API (`mx` namespace)
The mixer exposes a `mx` global object with the following surface:

- `mx.help()` — overview of mixer API
- `mx.channels` — list all 8 channels with current settings
- `mx.ch(n)` — returns a channel control object (1-8)
- `mx.ch(n).gain(dB)` / `.pan(v)` / `.mute()` / `.solo()` / `.attach(instrument)` / `.detach()` / `.help()`
- `mx.preview` — preview channel control (gain, mute)
- `mx.master` — master bus control (gain, mute)
- `mx.master.help()` / `mx.preview.help()`

All channel/master/preview objects should print a useful terminal summary when evaluated as expressions (showing current gain, pan, mute, solo, attached instrument).

Tab completion should work for `mx.`, `mx.ch(1).`, `mx.master.`, `mx.preview.`.

### Status Bar Level Meters
- Expand status bar from 24px to ~32-36px to future-proof for transport info
- Right-aligned compact horizontal peak bars for active channels + master
- Canvas-based, updated via `requestAnimationFrame`
- Peak-hold indicator (brief bright line at peak, decays)
- Color: green → yellow → red gradient based on level

## Cross-Platform Considerations

- All C++ changes use standard library types and miniaudio (already cross-platform)
- Canvas-based status bar meters use standard HTML5 Canvas API
- No platform-specific audio routing or MIDI (that comes later)
- dB ↔ linear conversion is pure math, no platform dependency

## Open Questions

All resolved during design discussion:
- ✅ One instrument per channel (not multiple) 
- ✅ Preview channel for sample.play() (hidden from user, but controllable via mx.preview)
- ✅ dB-scaled gain (-∞ to +6 dB)
- ✅ Peak metering with peak-hold
- ✅ Solo-in-place (SIP)
- ✅ No new migration — add DDL to existing first migration
- ✅ Status bar meters (Option A: right-aligned in expanded status bar)

## Research Findings

### Existing Patterns to Follow
1. **Namespace registration**: Factory function `buildMixerNamespace(deps)` → exports `{ mx }`, registered in `namespaces/index.ts`
2. **IPC channels**: Add to `IpcChannel` enum and `IpcSendContract` in `src/shared/ipc-contract.ts`
3. **IPC handlers**: New `registerMixerHandlers(deps)` in `src/electron/ipc/`, wired in `register.ts`
4. **Preload API**: Add mixer methods to `ElectronAPI` in `preload.ts`
5. **Utility process**: Extend `port.on("message")` switch in `audio-engine-process.ts`
6. **Native binding**: Add `InstanceMethod` registrations in `audio-engine-binding.cpp`
7. **C++ engine**: Add mixer types, extend `processBlock()`, add control message ops
8. **Database**: Add `mixer_channels` and `mixer_master` tables to `migrate001_initialSchema()`

### Key Architecture Insight
The mixer sits **between** instrument rendering and final output in `processBlock()`. Instead of all instruments rendering directly into the shared ch0/ch1 buffers, each instrument renders into its assigned channel's private buffer, then channels are mixed down through the master bus.

## Next Steps

PLAN phase should define:
1. Detailed C++ class design for mixer channels and master bus
2. New ControlMsg operations needed
3. Telemetry event format for metering
4. Complete REPL API with help() text and return types
5. Database schema for mixer persistence
6. Implementation phases (C++ engine → IPC → REPL → metering → UI)
