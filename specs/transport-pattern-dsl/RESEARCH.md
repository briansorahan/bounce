# Research: Transport Clock & Pattern DSL

**Spec:** specs/transport-pattern-dsl  
**Created:** 2026-03-25  
**Status:** Complete

## Problem Statement

Bounce has no transport clock. Without a clock, there is no way to:
- Synchronize looping to tempo
- Drive sample-accurate MIDI sequencing from the audio thread
- Build LFOs, modulators, or any sync-based feature
- Integrate with Ableton Link or MIDI clock

Before implementing the full transport feature, we need an interactive way to test it. A minimal X0X-style live-coding DSL that creates patterns synced to the clock will serve as both the test harness and a genuinely useful REPL feature.

## Background

The current architecture has no tempo concept anywhere in the stack. Key observations from codebase analysis:

**Audio engine (`native/include/audio-engine.h`, `native/src/audio-engine.cpp`):**
- `processBlock()` is called by miniaudio at ~86 Hz (44.1 kHz / 512 frames)
- No sample counter, no beat tracking, no clock state
- `ControlMsg` queue drains at the top of each block — the natural place to apply transport state changes
- Instruments accept `noteOn(note, velocity)` and `noteOff(note)` — already the right interface for pattern scheduling
- `TelemetryEvent` ring buffer (1024 slots, SPSC, lock-free) already handles async data from audio thread to telemetry thread; we extend it with a `Tick` kind

**MIDI playback (`src/electron/ipc/midi-handlers.ts`):**
- Existing playback uses `setTimeout` in the main process — no sample accuracy, no sync
- This will remain as-is; the transport is a separate, sample-accurate path

**Telemetry model (`native/src/audio-engine.cpp`, `native/src/audio-engine-binding.cpp`):**
- Position events travel: ring buffer → telemetry thread (~16ms drain) → ThreadSafeFunction → Node.js → MessagePort → main process → `webContents.send` → renderer
- We extend this same pipeline with `Tick` events carrying `{absoluteTick, bar, beat, step}` (~60 Hz arrival rate in renderer is fine for visual feedback)

**Mixer (`native/include/audio-engine.h`):**
- 8 user channels (index 0–7) + 1 preview channel (index 8)
- Instruments attach to channels via `attachedInstrumentId`
- Pattern scheduler will look up the attached instrument for a given channel and call `noteOn`/`noteOff` directly in `processBlock()`

**IPC pattern (`src/shared/ipc-contract.ts`, `src/electron/preload.ts`):**
- One-way fire-and-forget: `ipcRenderer.send` → `ipcMain.on` → `port.postMessage` → utility process switch → native method
- Telemetry back-channel: utility process → `port.postMessage` → main `MessagePort.on('message')` → `webContents.send` → `ipcRenderer.on`
- No DB persistence is needed for patterns (PoC scope: patterns are ephemeral session state)

## Related Work / Prior Art

- **Roland TR-808/909 (X0X):** 16-step sequencer per row, dot for rest, velocity via letter/symbol. Classic influence on the DSL design.
- **TidalCycles:** Mini-notation for pattern description. Key influence on the idea of a compact string DSL; we deliberately keep our format simpler.
- **Web Audio API scheduling pattern:** Classic lookahead scheduler (Chris Wilson) schedules events slightly ahead of playback. We avoid this by running the scheduler directly on the audio thread.
- **Ableton Live "Follow Actions" / Clip Quantization:** The concept of snapping pattern start to bar boundaries is standard in DAW design.

## Technical Constraints

### Transport Clock Precision

At 44.1 kHz with 512-frame blocks:
- Block duration: 512 / 44100 ≈ 11.6 ms
- 16th note at 120 BPM: (60 / 120 / 4) × 44100 ≈ 5512.5 samples ≈ 10.8 blocks

There will never be more than one 16th-note boundary per block at any tempo above ~30 BPM. This simplifies tick detection: scan for at most one boundary per `processBlock()` call.

### Note-Off Timing (100% Gate)

The simplest sample-accurate note-off strategy: fire note-off at the start of the block in which the *next* tick falls. This gives a gate duration of exactly one tick minus up to one block (≤ 11.6 ms). For a PoC this is indistinguishable from 100% gate.

### Bar Quantization

A "bar" is 16 ticks (4 beats × 4 sixteenth-notes). When `p.play(channel)` is called:
- If transport is running: pattern starts at `currentBar + 1`
- If transport is stopped: pattern is queued; starts immediately when transport starts

### ControlMsg and Shared Pointers

`PatternData` is variable-size (16 steps, each with ≥0 events). It must be heap-allocated and passed via `std::shared_ptr<PatternData>` as a new field on `ControlMsg`. This follows the existing `std::shared_ptr<AudioProcessor>` and `std::shared_ptr<Instrument>` precedent in `ControlMsg`.

### One Pattern Per Channel

Each user channel holds at most one active pattern. Setting a new pattern replaces the old one at the next bar boundary.

## Audio Processing Considerations

### Tick Detection in processBlock()

```
samplesPerTick = sampleRate * 60.0 / bpm / 4.0   (4 = 16th notes per beat)

At block entry:
  tickBefore = sampleCount / samplesPerTick   (integer division)
  tickAfter  = (sampleCount + frameCount) / samplesPerTick

If tickAfter > tickBefore:
  tickFired = tickBefore + 1
  sampleOffset = (tickFired * samplesPerTick) - sampleCount
  // fire events at frame index `sampleOffset` within this block
  currentTick = tickFired
```

The `sampleOffset` is informational for the PoC (all events fire at block start for simplicity; sub-block accuracy can be added later if needed for tight groove).

### Pending Note-Offs

When a note-on fires for a channel/note pair, record it in a small vector of pending note-offs `{channelIndex, note, tickDue}`. On each tick, fire note-offs for entries where `tickDue == currentTick`. This handles polyphonic patterns (multiple notes active on the same channel) cleanly.

### Memory Safety

`PatternData` shared_ptr is reference-counted. Audio thread holds a copy in `activePatterns_` map; when replaced or cleared, the old shared_ptr drops automatically. No raw pointer danger.

## Terminal UI Considerations

### `transport` Namespace

```
transport.bpm(120)   → displays:  Transport  bpm: 120  (was: 90)
transport.start()    → displays:  Transport started  bpm: 120
transport.stop()     → displays:  Transport stopped  position: bar 3, beat 2, step 4
transport.bpm()      → displays:  Transport  bpm: 120  running: true
transport.help()     → displays full API reference
```

### `pat()` Function Return Value

```
Pattern  steps: 16  notes: 3
  c4  . a . A . . E . . . . . . . .
  e4  a . . . E . . . a . . . E . .
  g4  . . . . . . . . a . . . . . .
play: p.play(1)   stop: p.stop()   help: p.help()
```

### Tick Telemetry (Optional Visual)

The renderer can subscribe to `transport-tick` IPC events. For the PoC, the tick event simply prints nothing unless the user inspects `transport.position()`. This is sufficient for testing — we verify correct behaviour by hearing the pattern and/or checking that the REPL shows no errors.

### REPL Contract

- `transport` namespace: exposes `help()`
- `pat()` return value (`Pattern`): exposes `help()`
- `TransportResult` (returned by `transport.bpm()`, `transport.start()`, `transport.stop()`): useful terminal summary showing BPM and running state
- `Pattern.toString()`: ASCII step display with note labels

## Cross-Platform Considerations

- No platform-specific audio APIs are touched; the transport runs purely within the existing miniaudio callback — cross-platform by construction
- `uint64_t` for `sampleCount` avoids 32-bit overflow (at 44.1 kHz, 32-bit overflows in ~27 hours; 64-bit overflows in ~13 million years)
- `double` for `bpm` is sufficient precision

## Open Questions (Resolved During Research)

| Question | Decision |
|---|---|
| Where does the scheduler run? | C++ audio thread — sample-accurate |
| Quantization granularity | Next bar boundary (16 steps) |
| Note-off strategy | Fire at next tick start (100% gate) |
| Multiple notes per step? | Yes — each step can have ≥1 note/velocity pairs |
| MIDI routing | Via the instrument attached to the target mixer channel |
| Tick telemetry? | Yes — `transport-tick` IPC event, use for visual feedback and testing |
| Pattern persistence? | No — ephemeral session state for PoC |
| `pat()` step count | Exactly 16 per row (pad with rest if short, error if > 16) |
| BPM range | 20–400 BPM (validated in TypeScript before sending to engine) |
| Velocity encoding | `a`–`z` = indices 0–25, `A`–`Z` = indices 26–51; map linearly to velocity 1–127 |

## Research Findings

1. **The audio engine is the right place for the transport clock.** It already has sample-accurate timing, a control message queue that applies at block boundaries, a telemetry ring buffer for outbound events, and direct access to instruments for note firing. No other process has these properties.

2. **ControlMsg extension is straightforward.** Adding `std::shared_ptr<PatternData> patternData` and `double transportBpm` to `ControlMsg`, plus new `Op` values (`TransportStart`, `TransportStop`, `TransportSetBpm`, `TransportSetPattern`, `TransportClearPattern`), follows the exact pattern of the mixer extension.

3. **Tick telemetry fits the existing ring buffer.** Adding `Tick` to `TelemetryEvent::Kind` and a `TickPayload` sub-struct requires minimal changes. The telemetry thread already drains the ring at ~60 Hz — tick events at 120 BPM 16th notes (8 ticks/sec) will never saturate the 1024-slot buffer.

4. **The IPC pipeline is well-understood.** Five new one-way channels (transport-start, transport-stop, transport-set-bpm, transport-set-pattern, transport-clear-pattern) and one telemetry channel (transport-tick) fit cleanly into the existing `IpcChannel` enum and handler pattern.

5. **The X0X parser is pure TypeScript.** No native code required. It takes a multi-line string and produces a `CompiledPattern` (serializable to JSON for the IPC message).

6. **Testing is viable without real audio hardware.** The REPL tick telemetry event (`transport-tick`) can be listened for in Playwright tests to verify the transport is actually advancing. The existing `midi.__injectEvent` test injection pattern serves as precedent for similar test seams.

## Next Steps

- Design detailed C++ structs and method signatures in PLAN.md
- Define the full `CompiledPattern` JSON schema used across the IPC boundary
- Define the REPL contract (what `transport` and `Pattern` print at each step)
- Enumerate all files to change and sequence the 8 implementation phases
