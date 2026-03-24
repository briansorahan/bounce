# Plan: 8-Channel Mixer

**Spec:** specs/mixer  
**Created:** 2026-03-24  
**Status:** In Progress

## Context

The Bounce audio engine currently mixes all sources additively into a single stereo output with no per-source control. This plan adds a fixed 8-channel mixer with a preview channel and master bus, controllable from the REPL via the `mx` namespace, with peak metering displayed in the status bar and all settings persisted per-project.

See `specs/mixer/RESEARCH.md` for full background, IPC flow details, and existing pattern analysis.

## Approach Summary

Insert a mixer layer between instrument rendering and final output in the C++ audio engine's `processBlock()`. Each of 8 user channels + 1 preview channel has its own stereo buffer. Instruments attach to channels; legacy `sample.play()` routes to the preview channel. All channels sum through a master bus to the output. Metering telemetry flows back via the existing ring buffer. The REPL exposes a `mx` namespace. Settings persist in SQLite tied to the current project.

## Architecture Changes

### Signal Flow (new)

```
                    ┌─ Channel 1 [gain, pan, mute, solo] ◄── Instrument
                    ├─ Channel 2 [gain, pan, mute, solo] ◄── Instrument
                    ├─ ...
                    ├─ Channel 8 [gain, pan, mute, solo] ◄── Instrument
                    ├─ Preview   [gain, mute]            ◄── sample.play() processors
                    ▼
              Master Bus [gain, mute]
                    ▼
              Stereo Output (interleaved)
```

### New C++ Types

```cpp
// In audio-engine.h

struct ChannelStrip {
    float gainDb     = -6.f;   // dB, range: -inf to +6
    float pan        = 0.f;    // -1.0 (L) to +1.0 (R), 0 = center
    bool  mute       = false;
    bool  solo       = false;
    float peakL      = 0.f;    // current block peak (linear)
    float peakR      = 0.f;
    float peakHoldL  = 0.f;    // peak-hold value (linear)
    float peakHoldR  = 0.f;
    int   peakHoldCountdown = 0; // blocks remaining at hold
    int   attachedInstrumentIdx = -1; // index into instruments_ or -1

    // Per-channel stereo buffer (sized to frameCount each block)
    // Allocated once, reused via assign()
};

struct MasterBus {
    float gainDb    = 0.f;
    bool  mute      = false;
    float peakL     = 0.f;
    float peakR     = 0.f;
    float peakHoldL = 0.f;
    float peakHoldR = 0.f;
    int   peakHoldCountdown = 0;
};

static constexpr int kNumUserChannels = 8;
static constexpr int kPreviewChannel  = 8;  // index 8
static constexpr int kNumChannels     = 9;  // 8 user + 1 preview
```

### New ControlMsg Operations

```cpp
enum class Op {
    // ... existing ops ...
    MixerSetChannelGain,    // channelIndex, paramValue (dB)
    MixerSetChannelPan,     // channelIndex, paramValue
    MixerSetChannelMute,    // channelIndex, paramValue (0 or 1)
    MixerSetChannelSolo,    // channelIndex, paramValue (0 or 1)
    MixerAttachInstrument,  // channelIndex, instrumentId
    MixerDetachChannel,     // channelIndex
    MixerSetMasterGain,     // paramValue (dB)
    MixerSetMasterMute,     // paramValue (0 or 1)
};
```

ControlMsg needs a new field: `int channelIndex`.

### Metering Telemetry

New `TelemetryEvent::Kind::MixerLevels` containing per-channel and master peak data. Emitted once per telemetry drain cycle (~60 Hz). Format:

```cpp
struct MixerLevelData {
    // Packed: [ch0_peakL, ch0_peakR, ch0_holdL, ch0_holdR, ch1_peakL, ... , master_peakL, master_peakR, master_holdL, master_holdR]
    // Total: (9 channels + 1 master) × 4 floats = 40 floats
    float levels[40];
};
```

Rather than 40 individual ring buffer events, emit a single consolidated metering snapshot per telemetry cycle. This requires a separate small ring buffer or a side-channel for metering data (since the main ring buffer holds per-event structs). A simple approach: store latest metering state in atomic-friendly memory (array of `std::atomic<float>`) that the telemetry thread reads directly — no ring buffer needed for metering since only the latest values matter.

**Revised metering approach:**
```cpp
// In AudioEngine
std::array<std::atomic<float>, 40> meterData_;  // written by audio thread, read by telemetry thread
```

The telemetry thread reads these atomics at ~60 Hz and dispatches a single `onMixerLevels` callback to JS via a dedicated `ThreadSafeFunction`.

### Peak-Hold Logic (in processBlock)

```
Per channel, per block:
1. Compute blockPeak = max(|sample|) across all frames in channel buffer
2. If blockPeak > peakHold: peakHold = blockPeak, holdCountdown = holdBlocks
3. Else if holdCountdown > 0: holdCountdown--
4. Else: peakHold *= decayFactor  (e.g. 0.95 per block ≈ 20 dB/s decay at 86 blocks/s)
5. Store blockPeak and peakHold into meterData_ atomics
```

Constants (at 44.1kHz / 512 frames ≈ 86 blocks/sec):
- `holdBlocks = 130` (~1.5 seconds)
- `decayFactor = 0.95` per block

## Changes Required

### Native C++ Changes

| File | Changes |
|------|---------|
| `native/include/audio-engine.h` | Add `ChannelStrip`, `MasterBus` structs; add `channels_[kNumChannels]`, `master_` members; add `meterData_` atomics; add new `ControlMsg::Op` values and `channelIndex` field; declare new public methods |
| `native/src/audio-engine.cpp` | Implement mixer methods; refactor `processBlock()` to route through channels; add metering computation; add `onMixerLevels` callback registration; extend control message handling |
| `native/src/audio-engine-binding.cpp` | Add NAPI wrappers for all new mixer methods; add `onMixerLevels` ThreadSafeFunction; register new InstanceMethods |

### TypeScript Changes

| File | Changes |
|------|---------|
| `src/shared/ipc-contract.ts` | Add mixer IPC channel names and type contracts |
| `src/electron/preload.ts` | Add mixer methods to `ElectronAPI` |
| `src/electron/ipc/mixer-handlers.ts` | New file: register mixer IPC handlers, forwarding to audio engine port |
| `src/electron/ipc/register.ts` | Wire `registerMixerHandlers` |
| `src/utility/audio-engine-process.ts` | Handle new mixer message types in port switch |
| `src/renderer/namespaces/mixer-namespace.ts` | New file: `buildMixerNamespace(deps)` → `{ mx }` |
| `src/renderer/namespaces/index.ts` | Export `buildMixerNamespace` |
| `src/renderer/bounce-api.ts` | Register `mx` namespace, wire into REPL context |
| `src/renderer/status-line.ts` | Add canvas-based level meter rendering |
| `src/renderer/index.html` | Add meter canvas element to status bar; adjust status bar height |
| `src/electron/database.ts` | Add `mixer_channels` and `mixer_master` tables to `migrate001_initialSchema()`; add CRUD methods |
| `src/electron/ipc/audio-handlers.ts` | Route legacy `play-sample` through preview channel (or keep as-is and let C++ handle it) |

### Terminal UI Changes

- Status bar height increased from 24px to 34px
- New `<canvas id="level-meters">` element right-aligned in status bar
- Canvas renders horizontal peak bars: one per active channel + master
- Color gradient: green (#0dbc79) → yellow (#e5e510) → red (#cd3131) based on level thresholds (-12 dB, -3 dB)
- Peak-hold indicator: thin bright line at hold position
- Channel labels rendered as small text (ch number) left of each bar
- Master bar visually distinct (slightly wider or different label)
- Meters hidden when no instruments are attached and nothing is playing

### REPL Interface Contract

#### `mx` namespace

```
mx.help()       → BounceResult with full mixer API docs
mx.channels     → BounceResult listing all 8 channels with current state
mx.ch(n)        → MixerChannel object (1-8)
mx.preview      → PreviewChannel object
mx.master       → MasterBus object
```

#### `mx.ch(n)` — MixerChannel

```
ch.gain(dB?)    → get or set gain in dB; returns MixerChannel for chaining
ch.pan(v?)      → get or set pan (-1 to +1); returns MixerChannel for chaining
ch.mute()       → toggle mute; returns MixerChannel
ch.solo()       → toggle solo; returns MixerChannel
ch.attach(inst) → attach instrument to this channel; returns MixerChannel
ch.detach()     → detach instrument; returns MixerChannel
ch.help()       → BounceResult with channel API docs
```

When evaluated as expression, MixerChannel prints:
```
Channel 3: gain -6.0 dB | pan C | mute off | solo off | instrument: "keys"
```

#### `mx.preview` — PreviewChannel

```
preview.gain(dB?) → get or set gain in dB
preview.mute()    → toggle mute
preview.help()    → BounceResult with preview API docs
```

When evaluated:
```
Preview: gain 0.0 dB | mute off
```

#### `mx.master` — MasterBus

```
master.gain(dB?) → get or set gain in dB
master.mute()    → toggle mute
master.help()    → BounceResult with master API docs
```

When evaluated:
```
Master: gain 0.0 dB | mute off
```

#### Tab Completion

- `mx.` → `channels`, `ch`, `preview`, `master`, `help`
- `mx.ch(1).` → `gain`, `pan`, `mute`, `solo`, `attach`, `detach`, `help`
- `mx.preview.` → `gain`, `mute`, `help`
- `mx.master.` → `gain`, `mute`, `help`

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties
- [x] Unit tests identified for `help()` output
- [x] Playwright tests identified for returned-object display behavior and level meters

### Configuration/Build Changes

| File | Changes |
|------|---------|
| `binding.gyp` | No changes needed — same source directory, new .cpp files added to existing `audio_engine_native` target sources list if we add new C++ files (but mixer logic lives in existing audio-engine.cpp) |

## Testing Strategy

### Unit Tests

- `src/mixer.test.ts` — test dB-to-linear conversion, pan law computation, peak-hold decay math
- REPL help() output assertions for `mx.help()`, `mx.ch(1).help()`, `mx.preview.help()`, `mx.master.help()`
- Returned-object terminal summary format assertions

### E2E Tests (Playwright, via `./build.sh`)

- `tests/mixer.spec.ts`:
  - Create instrument, attach to channel, verify `mx.channels` output
  - Set gain/pan/mute/solo, verify channel state
  - Detach instrument, verify channel clears
  - Master gain/mute control
  - Preview channel gain control
  - Verify level meters appear in status bar when audio is playing
  - Verify mixer state persists across project reload

### Manual Testing

- Listen to audio output while adjusting gain/pan to verify audible correctness
- Verify solo-in-place behavior with multiple active channels
- Verify peak-hold visual behavior in status bar
- Verify meter responsiveness and smoothness
- Cross-platform: macOS + Linux (via Docker/build.sh)

## Success Criteria

1. 8 user channels + preview + master bus process audio correctly in C++
2. Instruments can be attached/detached to channels from REPL
3. `sample.play()` routes through preview channel transparently
4. All channel parameters (gain, pan, mute, solo) controllable and audibly correct
5. Master bus gain/mute works
6. Peak meters with peak-hold visible in status bar
7. Mixer state persists in project DB and restores on reload
8. All `help()` methods return useful documentation
9. Tab completion works for all `mx.*` paths
10. No audio glitches, clicks, or performance regression

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| `controlMutex` contention increases with more params | Mixer params change infrequently (user turning knobs); contention stays low. Lock-free queue upgrade deferred to when MIDI/automation adds high-frequency param changes. |
| Metering atomics torn reads on 32-bit | `std::atomic<float>` is lock-free on all our target platforms (x86-64, ARM64). Verify with `static_assert(std::atomic<float>::is_always_lock_free)`. |
| Status bar too cramped for meters | Start with only active channels + master shown; collapse to icon when nothing is playing. Expand status bar height to 34px. |
| Peak-hold timing varies with buffer size | Compute `holdBlocks` and `decayFactor` from actual sample rate and buffer size at engine start, not hardcoded. |
| Breaking existing `sample.play()` flow | Preview channel is transparent — existing processors render into preview buffer instead of directly to output. No API change needed. |

## Implementation Order

### Phase 1: C++ Mixer Core
Add `ChannelStrip`, `MasterBus` structs and channel arrays to `AudioEngine`. Refactor `processBlock()` to route instruments through channels and legacy processors through preview channel. Apply gain, pan, mute, solo. Sum to master bus. No metering yet, no IPC yet — just hardcoded defaults. Verify audio output is unchanged with default settings.

### Phase 2: C++ Mixer Control API + NAPI Binding
Add public methods to `AudioEngine` for all mixer operations. Add corresponding `ControlMsg::Op` values. Implement NAPI wrappers in `audio-engine-binding.cpp`. Verify methods are callable from Node.js.

### Phase 3: IPC Plumbing
Add IPC channel definitions to `ipc-contract.ts`. Add preload API methods. Create `mixer-handlers.ts`. Extend utility process message handler. Wire everything so renderer can control mixer params end-to-end.

### Phase 4: REPL Namespace (`mx`)
Create `mixer-namespace.ts` with full `mx` API. Register in bounce-api.ts. Implement help() methods and terminal summaries for all objects. Wire tab completion. Write unit tests for help output and display formatting.

### Phase 5: Database Persistence
Add `mixer_channels` and `mixer_master` tables to `migrate001_initialSchema()`. Add DatabaseManager CRUD methods. Save mixer state on parameter change. Load mixer state on project load. Wire through IPC.

### Phase 6: Metering Telemetry
Add peak computation and peak-hold logic to `processBlock()`. Add `meterData_` atomics. Add `onMixerLevels` callback + ThreadSafeFunction in binding. Emit metering data from telemetry thread. Forward through IPC to renderer.

### Phase 7: Status Bar Level Meters
Expand status bar height. Add canvas element. Implement meter rendering with peak bars, peak-hold indicators, color gradient. Wire to metering telemetry. Add show/hide logic.

### Phase 8: E2E Tests
Write Playwright tests covering full mixer workflow: attach, control, detach, persistence, metering visibility.

## Estimated Scope

**Large** — spans C++ engine, NAPI bindings, IPC plumbing, REPL namespace, database schema, and UI rendering across ~15 files. Phases are designed to be independently testable and commitable.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (sample.play() routes transparently through preview channel)
- [x] All sections agree on the data model / schema approach (add to existing migration, no new migration)
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and Playwright coverage for REPL help/display behavior
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
