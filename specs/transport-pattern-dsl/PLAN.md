# Plan: Transport Clock & Pattern DSL

**Spec:** specs/transport-pattern-dsl  
**Created:** 2026-03-25  
**Status:** In Progress

## Context

The audio engine has no transport clock. Adding one enables sample-accurate beat-synced scheduling. To test the transport interactively, we pair it with a minimal X0X-style live-coding DSL: a multi-line string notation where each line is a 16-step row for one MIDI note, and letters encode velocity. Patterns are compiled in TypeScript, sent to the C++ audio thread, and play back sample-accurately on the instrument attached to the target mixer channel, quantized to the next bar boundary.

See RESEARCH.md for full analysis of the existing architecture and all design decisions.

## Approach Summary

1. Add a `Transport` struct and `PatternData` struct to the C++ audio engine
2. Extend `processBlock()` to advance the clock, detect 16th-note tick boundaries, fire scheduled pattern events, and emit tick telemetry
3. Expose transport and pattern control through the standard NAPI → IPC → utility process → native call chain
4. Write a TypeScript X0X parser that compiles the mini-notation to `CompiledPattern` JSON
5. Add `transport` REPL namespace and `pat()` function with a `Pattern` result type

## Architecture Changes

The transport lives entirely in the C++ audio engine and is controlled via the existing `ControlMsg` queue. No new processes or threads are introduced.

```
Renderer: transport.bpm(120) / transport.start() / pat(...).play(1)
  ↓ window.electron.transportSetBpm / transportStart / transportSetPattern
  ↓ ipcRenderer.send
Main process: ipcMain.on("transport-*") → port.postMessage(...)
Utility process: message switch → engine.transportStart() / engine.transportSetPattern(...)
Audio thread (processBlock):
  - Advance sampleCount if running
  - Detect tick boundary → fire pattern note-on/note-off for all active patterns
  - Write Tick to telemetry ring buffer
Telemetry thread → ThreadSafeFunction → utility process → port.postMessage({type:"transport-tick",...})
Main process → webContents.send("transport-tick", {...})
Renderer: ipcRenderer.on("transport-tick") → audioManager/transport namespace state
```

## Changes Required

### Native C++ Changes

#### `native/include/audio-engine.h`

**New structs:**
```cpp
struct PatternStep {
    std::vector<std::pair<uint8_t, uint8_t>> events; // {note, velocity}; empty = rest
};

struct PatternData {
    int channelIndex;
    int scheduledBar;       // bar at which to start playing (-1 = immediate)
    std::array<PatternStep, 16> steps;
};

struct Transport {
    bool running = false;
    double bpm = 120.0;
    uint64_t sampleCount = 0;
    int currentBar = 0;
    int currentTick = 0;    // absolute tick count since transport started
};
```

**New `ControlMsg::Op` values:**
```cpp
TransportStart,
TransportStop,
TransportSetBpm,
TransportSetPattern,
TransportClearPattern,
```

**New `ControlMsg` fields:**
```cpp
double transportBpm = 0.0;
std::shared_ptr<PatternData> patternData;
```

**New `TelemetryEvent::Kind`:**
```cpp
Tick,
```

**New `TelemetryEvent` field (union-style):**
```cpp
int absoluteTick = 0;
int bar = 0;
int beat = 0;        // 0-3
int step = 0;        // 0-15 within bar
```

**New `AudioEngine` public API:**
```cpp
void transportStart();
void transportStop();
void transportSetBpm(double bpm);
void transportSetPattern(std::shared_ptr<PatternData> pattern);
void transportClearPattern(int channelIndex);
void onTransportTick(std::function<void(int absoluteTick, int bar, int beat, int step)> cb);
```

**New private members:**
```cpp
Transport transport_;
std::map<int, std::shared_ptr<PatternData>> activePatterns_;  // channelIndex → pattern
std::vector<std::tuple<int,int,int>> pendingNoteOffs_;        // {channelIndex, note, tickDue}
std::function<void(int,int,int,int)> tickCb_;
ThreadSafeFunction tickTsfn_;   // in binding
```

#### `native/src/audio-engine.cpp`

**New public methods** (enqueue ControlMsg):
```cpp
void AudioEngine::transportStart() {
    ControlMsg msg; msg.op = Op::TransportStart;
    std::lock_guard<std::mutex> lk(controlMutex_);
    controlQueue_.push_back(std::move(msg));
}
// transportStop, transportSetBpm, transportSetPattern, transportClearPattern follow same pattern
```

**ControlMsg switch additions** (inside existing drain loop):
```cpp
case Op::TransportStart:
    transport_.running = true;
    transport_.sampleCount = 0;
    transport_.currentTick = 0;
    transport_.currentBar = 0;
    // Activate all queued patterns with scheduledBar == -1 or scheduledBar == 0
    for (auto& [ch, pd] : activePatterns_) {
        if (pd->scheduledBar < 0) pd->scheduledBar = 0; // start immediately
    }
    break;

case Op::TransportStop:
    transport_.running = false;
    // Fire note-offs for all pending notes
    for (auto& [ch, note, tickDue] : pendingNoteOffs_) {
        auto it = instruments_.end();
        for (auto& inst : instruments_) {
            if (channels_[ch].attachedInstrumentId == inst->id()) { it = &inst; break; }
        }
        // fire noteOff...
    }
    pendingNoteOffs_.clear();
    break;

case Op::TransportSetBpm:
    transport_.bpm = msg.transportBpm;
    break;

case Op::TransportSetPattern:
    activePatterns_[msg.patternData->channelIndex] = msg.patternData;
    break;

case Op::TransportClearPattern:
    activePatterns_.erase(msg.channelIndex);
    break;
```

**processBlock() transport section** (inserted after control message drain, before rendering):
```cpp
if (transport_.running) {
    const double samplesPerTick = transport_.sampleRate * 60.0 / transport_.bpm / 4.0;
    const uint64_t tickBefore = (uint64_t)(transport_.sampleCount / samplesPerTick);
    const uint64_t tickAfter  = (uint64_t)((transport_.sampleCount + frameCount) / samplesPerTick);

    if (tickAfter > tickBefore) {
        const uint64_t tickFired = tickBefore + 1;
        transport_.currentTick = (int)tickFired;
        const int step = (int)(tickFired % 16);
        const int bar  = (int)(tickFired / 16);
        const int beat = step / 4;

        // Fire pending note-offs for this tick
        for (auto it = pendingNoteOffs_.begin(); it != pendingNoteOffs_.end(); ) {
            auto& [ch, note, tickDue] = *it;
            if ((int)tickFired >= tickDue) {
                fireNoteOff(ch, note);  // helper to find instrument and call noteOff
                it = pendingNoteOffs_.erase(it);
            } else {
                ++it;
            }
        }

        // Fire pattern events for this step
        for (auto& [ch, pd] : activePatterns_) {
            if (pd->scheduledBar < 0 || bar < pd->scheduledBar) continue;
            for (auto& [note, vel] : pd->steps[step].events) {
                fireNoteOn(ch, note, vel / 127.f);
                pendingNoteOffs_.emplace_back(ch, note, (int)tickFired + 1);
            }
        }

        // Emit tick telemetry
        TelemetryEvent ev;
        ev.kind = TelemetryEvent::Kind::Tick;
        ev.absoluteTick = (int)tickFired;
        ev.bar = bar; ev.beat = beat; ev.step = step;
        int w = ringWritePos_.load(std::memory_order_relaxed);
        ring_[w % kRingSize] = std::move(ev);
        ringWritePos_.store(w + 1, std::memory_order_release);
    }

    transport_.sampleCount += frameCount;
}
```

**Helper methods** (private):
```cpp
void AudioEngine::fireNoteOn(int channelIndex, uint8_t note, float velocity) {
    for (auto& inst : instruments_) {
        if (channels_[channelIndex].attachedInstrumentId == inst->id()) {
            inst->noteOn((int)note, velocity);
            return;
        }
    }
}
void AudioEngine::fireNoteOff(int channelIndex, uint8_t note) { ... }
```

**Telemetry thread** (drain loop extension):
```cpp
case TelemetryEvent::Kind::Tick:
    if (tickCb_) tickCb_(ev.absoluteTick, ev.bar, ev.beat, ev.step);
    break;
```

#### `native/src/audio-engine-binding.cpp`

**New methods** (registered via `InstanceMethod` in `DefineClass`):
```cpp
Napi::Value TransportStart(const Napi::CallbackInfo& info);
Napi::Value TransportStop(const Napi::CallbackInfo& info);
Napi::Value TransportSetBpm(const Napi::CallbackInfo& info);   // info[0] = bpm (Number)
Napi::Value TransportSetPattern(const Napi::CallbackInfo& info); // info[0] = channelIndex, info[1] = stepsJson (String)
Napi::Value TransportClearPattern(const Napi::CallbackInfo& info); // info[0] = channelIndex
Napi::Value OnTransportTick(const Napi::CallbackInfo& info);   // info[0] = callback
```

`TransportSetPattern` deserializes the JSON string into a `PatternData` shared_ptr. Using JSON avoids adding a complex struct conversion layer in the binding:
```cpp
Napi::Value AudioEngineWrapper::TransportSetPattern(...) {
    int channelIndex = info[0].As<Napi::Number>().Int32Value();
    std::string json = info[1].As<Napi::String>().Utf8Value();
    // parse JSON: [{"events": [{"note": 60, "velocity": 80}, ...]}, ...] (16 entries)
    auto pd = std::make_shared<PatternData>();
    pd->channelIndex = channelIndex;
    pd->scheduledBar = info[2].As<Napi::Number>().Int32Value(); // -1 for immediate
    // parse steps from json...
    engine_->transportSetPattern(pd);
}
```

`OnTransportTick` follows the exact `onPosition` ThreadSafeFunction pattern:
```cpp
engine_->onTransportTick([this](int abs, int bar, int beat, int step) {
    struct D { int abs, bar, beat, step; };
    auto* d = new D{abs, bar, beat, step};
    tickTsfn_.NonBlockingCall(d, [](Napi::Env env, Napi::Function cb, D* data) {
        cb.Call({ Napi::Number::New(env, data->abs),
                  Napi::Number::New(env, data->bar),
                  Napi::Number::New(env, data->beat),
                  Napi::Number::New(env, data->step) });
        delete data;
    });
});
```

### TypeScript Changes

#### `src/shared/ipc-contract.ts`

**New `IpcChannel` enum values:**
```typescript
TransportStart:       "transport-start",
TransportStop:        "transport-stop",
TransportSetBpm:      "transport-set-bpm",
TransportSetPattern:  "transport-set-pattern",
TransportClearPattern:"transport-clear-pattern",
TransportTick:        "transport-tick",  // telemetry (main → renderer)
```

**New `IpcSendContract` entries** (one-way renderer → main):
```typescript
[IpcChannel.TransportStart]:       void
[IpcChannel.TransportStop]:        void
[IpcChannel.TransportSetBpm]:      { bpm: number }
[IpcChannel.TransportSetPattern]:  { channelIndex: number; stepsJson: string; scheduledBar: number }
[IpcChannel.TransportClearPattern]:{ channelIndex: number }
```

**New `ElectronAPI` methods:**
```typescript
transportStart(): void
transportStop(): void
transportSetBpm(bpm: number): void
transportSetPattern(channelIndex: number, stepsJson: string, scheduledBar: number): void
transportClearPattern(channelIndex: number): void
onTransportTick(cb: (data: TransportTickData) => void): void
```

**New shared type:**
```typescript
export interface TransportTickData {
  absoluteTick: number;
  bar: number;
  beat: number;
  step: number;
}
```

#### `src/electron/preload.ts`

Five one-way sends + one listener:
```typescript
transportStart: () => ipcRenderer.send("transport-start"),
transportStop: () => ipcRenderer.send("transport-stop"),
transportSetBpm: (bpm: number) => ipcRenderer.send("transport-set-bpm", { bpm }),
transportSetPattern: (channelIndex, stepsJson, scheduledBar) =>
    ipcRenderer.send("transport-set-pattern", { channelIndex, stepsJson, scheduledBar }),
transportClearPattern: (channelIndex) =>
    ipcRenderer.send("transport-clear-pattern", { channelIndex }),
onTransportTick: (cb) =>
    ipcRenderer.on("transport-tick", (_event, data: TransportTickData) => cb(data)),
```

#### `src/electron/ipc/transport-handlers.ts` (new file)

```typescript
import { ipcMain } from "electron";
import type { HandlerDeps } from "./register";

export function registerTransportHandlers(deps: HandlerDeps): void {
    ipcMain.on("transport-start", () => {
        deps.getAudioEnginePort()?.postMessage({ type: "transport-start" });
    });
    ipcMain.on("transport-stop", () => {
        deps.getAudioEnginePort()?.postMessage({ type: "transport-stop" });
    });
    ipcMain.on("transport-set-bpm", (_event, { bpm }: { bpm: number }) => {
        deps.getAudioEnginePort()?.postMessage({ type: "transport-set-bpm", bpm });
    });
    ipcMain.on("transport-set-pattern", (_event, { channelIndex, stepsJson, scheduledBar }) => {
        deps.getAudioEnginePort()?.postMessage({
            type: "transport-set-pattern", channelIndex, stepsJson, scheduledBar
        });
    });
    ipcMain.on("transport-clear-pattern", (_event, { channelIndex }) => {
        deps.getAudioEnginePort()?.postMessage({ type: "transport-clear-pattern", channelIndex });
    });
}
```

Wire into `src/electron/ipc/register.ts`:
```typescript
import { registerTransportHandlers } from "./transport-handlers";
// in registerAllHandlers():
registerTransportHandlers(deps);
```

#### `src/utility/audio-engine-process.ts`

**AudioEngineNative interface additions:**
```typescript
transportStart(): void;
transportStop(): void;
transportSetBpm(bpm: number): void;
transportSetPattern(channelIndex: number, stepsJson: string, scheduledBar: number): void;
transportClearPattern(channelIndex: number): void;
onTransportTick(cb: (absoluteTick: number, bar: number, beat: number, step: number) => void): void;
```

**Message data type additions:**
```typescript
bpm?: number;
stepsJson?: string;
scheduledBar?: number;
```

**Message switch additions:**
```typescript
case "transport-start":
    if (engine) engine.transportStart();
    break;
case "transport-stop":
    if (engine) engine.transportStop();
    break;
case "transport-set-bpm":
    if (engine && data.bpm !== undefined) engine.transportSetBpm(data.bpm);
    break;
case "transport-set-pattern":
    if (engine && data.channelIndex !== undefined && data.stepsJson && data.scheduledBar !== undefined)
        engine.transportSetPattern(data.channelIndex, data.stepsJson, data.scheduledBar);
    break;
case "transport-clear-pattern":
    if (engine && data.channelIndex !== undefined) engine.transportClearPattern(data.channelIndex);
    break;
```

**Tick telemetry callback** (at engine startup):
```typescript
engine.onTransportTick((absoluteTick, bar, beat, step) => {
    port?.postMessage({ type: "transport-tick", absoluteTick, bar, beat, step });
});
```

#### `src/renderer/types.d.ts`

Add to `Window.electron`:
```typescript
transportStart(): void;
transportStop(): void;
transportSetBpm(bpm: number): void;
transportSetPattern(channelIndex: number, stepsJson: string, scheduledBar: number): void;
transportClearPattern(channelIndex: number): void;
onTransportTick(cb: (data: import('../shared/ipc-contract').TransportTickData) => void): void;
```

#### `src/renderer/namespaces/transport-namespace.ts` (new file)

```typescript
import type { NamespaceDeps } from "../bounce-api";
import { BounceResult } from "../bounce-result";

const MIN_BPM = 20;
const MAX_BPM = 400;

export interface TransportNamespace {
  bpm(value?: number): BounceResult;
  start(): BounceResult;
  stop(): BounceResult;
  help(): BounceResult;
}

export function buildTransportNamespace(_deps: NamespaceDeps): { transport: TransportNamespace } {
    let currentBpm = 120;
    let isRunning = false;
    // ...
}
```

Terminal display for `TransportResult`:
```
Transport  bpm: 120  running: true  bar: 3  beat: 2  step: 5
```

#### `src/renderer/results/pattern.ts` (new file)

`Pattern` class extending `BounceResult`:
- Constructor: `(notation: string, compiled: CompiledPattern)`
- `play(channel: number): BounceResult` — validates 1–8, converts to 0-indexed, sends `transport-set-pattern`
- `stop(): BounceResult` — sends `transport-clear-pattern`
- `help(): BounceResult`
- `toString()` — renders ASCII step grid:
  ```
  Pattern  steps: 16  notes: 3
    c4  . a . A . . E . . . . . . . .
    e4  a . . . E . . . a . . . E . .
    g4  . . . . . . . . a . . . . . .
  play: p.play(1)   stop: p.stop()
  ```

#### `src/renderer/pattern-parser.ts` (new file)

```typescript
export interface CompiledStep {
  events: Array<{ note: number; velocity: number }>;  // empty = rest
}

export interface CompiledPattern {
  channelIndex: number; // set later by .play()
  steps: CompiledStep[];  // always 16
}

/** Parse X0X notation string into a CompiledPattern. channelIndex defaults to -1 (unassigned). */
export function parsePattern(notation: string): CompiledPattern { ... }

/** Parse a MIDI note name like "c4", "c'4", "a3", "b'2" into a MIDI note number. */
export function parseMidiNote(name: string): number { ... }

/** Map a velocity character (a-z, A-Z) to MIDI velocity 1–127. */
export function velocityFromChar(ch: string): number { ... }
```

**Note name format:** `[a-gA-G]'?[0-9]`
- `c4` → MIDI 60 (middle C)
- `c'4` → MIDI 61 (C#4)
- `a4` → MIDI 69
- `b'3` → MIDI 58 (B♭3 / A#3)
- Note: octave 0 maps to MIDI notes 12–23 (MIDI standard: C-1 = 0, C0 = 12, C4 = 60)

**Velocity mapping:**
- `a`–`z` → indices 0–25; `A`–`Z` → indices 26–51
- `velocity = Math.round(1 + (index / 51) * 126)` → range 1–127

**Step count:** Each row must have exactly 16 non-whitespace characters. Fewer → pad with rests; more → throw `BounceError` describing which row and how many steps were found.

**`pat()` function:** Added to globals in `src/renderer/namespaces/globals.ts`:
```typescript
pat: (notation: string): Pattern => {
    const compiled = parsePattern(notation);
    return new Pattern(notation, compiled);
}
```

#### `src/renderer/bounce-api.ts`

```typescript
import { buildTransportNamespace } from "./namespaces/transport-namespace";

// in buildBounceApi():
const { transport } = buildTransportNamespace(namespaceDeps);

const api = {
  sn, env, vis, proj, corpus, fs, inst, mx, midi, transport, ...globals
};
```

#### `src/renderer/bounce-globals.d.ts`

```typescript
declare const transport: import('./namespaces/transport-namespace').TransportNamespace;
declare function pat(notation: string): import('./results/pattern').Pattern;
```

### Terminal UI Changes

No visual changes to the canvas or status bar for this PoC. The `transport-tick` event is received in the renderer for future use (e.g., beat indicators), but no UI is added in this spec.

### REPL Interface Contract

#### `transport` namespace

| Expression | Terminal Output |
|---|---|
| `transport.help()` | Full API reference with BPM range, start/stop, examples |
| `transport.bpm(120)` | `Transport  bpm: 120  (was: 90)` |
| `transport.bpm()` | `Transport  bpm: 120  running: false` |
| `transport.start()` | `Transport started  bpm: 120` |
| `transport.stop()` | `Transport stopped  bar: 3  beat: 2  step: 7` |

#### `pat()` function return value (`Pattern`)

```
Pattern  steps: 16  notes: 3
  c4  . a . A . . E . . . . . . . .
  e4  a . . . E . . . a . . . E . .
  g4  . . . . . . . . a . . . . . .
play: p.play(1)   stop: p.stop()   help: p.help()
```

| Expression | Terminal Output |
|---|---|
| `p.play(1)` | `Pattern playing on channel 1  bar: next` |
| `p.stop()` | `Pattern stopped` |
| `p.help()` | API reference + notation guide + velocity table |

#### REPL Contract Checklist

- [x] `transport` namespace exposes `help()`
- [x] `Pattern` result type exposes `help()`
- [x] `TransportResult` (returned by bpm/start/stop) shows BPM + running state
- [x] `Pattern.toString()` renders ASCII grid with note labels and step characters
- [x] Unit tests planned for parser (`src/pattern-parser.test.ts`)
- [x] Unit tests planned for `transport` help() text and `Pattern` display
- [x] Playwright test planned for end-to-end transport + pattern playback

### Configuration/Build Changes

`binding.gyp` — no changes needed; the new C++ code is in existing source files.

`tsconfig.electron.json` / `tsconfig.renderer.json` — no changes needed; new files are in already-included paths.

## Testing Strategy

### Unit Tests

**`src/pattern-parser.test.ts`** (run via `npx tsx`):
- `parsePattern` — valid single-row notation, all 52 velocity characters, rests
- `parsePattern` — multi-row notation, correct step grouping per MIDI note
- `parsePattern` — whitespace-only lines are ignored
- `parsePattern` — fewer than 16 steps: pads with rests, no error
- `parsePattern` — more than 16 steps: throws with descriptive message
- `parseMidiNote` — c0→12, c4→60, c'4→61, a4→69, b9→131 (validate range 0-127)
- `parseMidiNote` — invalid name throws
- `velocityFromChar` — 'a'→1, 'Z'→127, 'n'→midpoint (~51)
- `Pattern.toString()` — snapshot test of ASCII grid output
- `transport.help()` — contains expected key terms

**`src/transport-namespace.test.ts`**:
- `transport.bpm(120)` returns result mentioning "120"
- `transport.bpm(-1)` returns error mentioning BPM range
- `transport.bpm(401)` returns error mentioning BPM range

### E2E Tests

**`tests/transport-pattern.spec.ts`**:

```typescript
test("transport start/stop works", async ({ page }) => {
    await evaluate(page, "transport.bpm(240)");
    await evaluate(page, "transport.start()");
    await page.waitForTimeout(500);
    await evaluate(page, "transport.stop()");
    // verify no error output in terminal
});

test("pattern plays on channel with attached instrument", async ({ page }) => {
    // create sampler, attach to channel 1
    await evaluate(page, "const s = inst.sampler({ name: 'tp-test' })");
    await evaluate(page, "mx.ch(1).attach(s)");
    // define pattern
    await evaluate(page, "const p = pat(`c4 = a . . . a . . . a . . . a . . .`)");
    await evaluate(page, "transport.bpm(240)");
    await evaluate(page, "transport.start()");
    await evaluate(page, "p.play(1)");
    await page.waitForTimeout(2000);  // let it run 8 bars at 240 BPM
    await evaluate(page, "p.stop()");
    await evaluate(page, "transport.stop()");
    // verify no error output
});

test("transport tick telemetry arrives in renderer", async ({ page }) => {
    // subscribe to transport-tick and verify it fires
    await page.evaluate(() => {
        (window as any).__tickCount = 0;
        window.electron.onTransportTick(() => { (window as any).__tickCount++; });
    });
    await evaluate(page, "transport.bpm(240)");
    await evaluate(page, "transport.start()");
    await page.waitForTimeout(1000);  // at 240 BPM, ~16 ticks/sec × 1s = ~16 ticks
    await evaluate(page, "transport.stop()");
    const count = await page.evaluate(() => (window as any).__tickCount);
    expect(count).toBeGreaterThan(10);
});

test("pat() displays ASCII grid in terminal", async ({ page }) => {
    const output = await evaluate(page, "pat(`c4 = a . . . . . . . . . . . . . . .`)");
    expect(output).toContain("c4");
    expect(output).toContain("Pattern");
});
```

### Manual Testing

- Set BPM to 60, start transport, verify pattern fires once per second
- Change BPM mid-pattern via `transport.bpm(120)` — verify tempo change takes effect
- Call `pat(...)` with invalid notation — verify descriptive error in terminal
- Attach instrument to channel and verify audio output when pattern fires
- `transport.stop()` while pattern is playing — verify no hanging notes

## Success Criteria

1. `transport.bpm(120).start()` starts the clock with no errors
2. `pat(notation).play(1)` queues the pattern and it fires at the next bar boundary
3. Audio is heard from the instrument attached to the target channel
4. `transport.stop()` halts the clock cleanly with no hanging notes
5. Tick telemetry arrives in the renderer (verified by E2E test)
6. Parser rejects invalid notation with helpful error messages
7. All existing Playwright tests continue to pass
8. `npm run lint` passes
9. `npm run build:electron` passes

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| `pendingNoteOffs_` grows unbounded if transport stops mid-note | `TransportStop` op drains all pending note-offs before clearing the vector |
| JSON parsing in NAPI binding (C++ side) adds a dependency | Use a minimal header-only JSON parser (nlohmann/json is already common in C++ projects; alternatively, parse a simple flat format instead of JSON — see below) |
| Tick telemetry rate too high (~8 ticks/sec at 120 BPM) saturates ring buffer | At 120 BPM, 8 ticks/sec; ring has 1024 slots drained at ~60 Hz → no saturation risk |
| BPM change mid-bar causes click or missed step | BPM changes are applied at the next block boundary; minor tempo jitter for one block is acceptable for PoC |
| No instrument attached to target channel when pattern fires | `fireNoteOn` silently skips if no instrument found — no crash |
| `std::map::erase` in audio thread (TransportClearPattern) can allocate | Use `std::unordered_map` with reserved capacity, or keep a `bool active` flag on PatternData and skip in scheduler loop to avoid deallocation in audio thread |

**Note on JSON in NAPI:** To avoid adding a JSON library, we can serialize `PatternData` as a compact binary-compatible format: `channelIndex:int | stepsJson:string` where the string is a flat base64-like encoding. Alternatively, we can parse the step data in TypeScript and send a compact array of bytes. The simplest approach: serialize as a flat array `number[]` where each step is a fixed-width block. Final decision deferred to IMPL phase.

## Implementation Order

1. **Phase 1: C++ Transport Core** — Add `Transport` struct, `TransportStart/Stop/SetBpm` ControlMsg ops, tick detection in `processBlock()`, tick telemetry emission. Build clean.

2. **Phase 2: C++ Pattern Scheduler** — Add `PatternData`, `PatternStep`, `TransportSetPattern/ClearPattern` ops, `fireNoteOn`/`fireNoteOff` helpers, `pendingNoteOffs_` drain logic. Build clean.

3. **Phase 3: C++ Tick Telemetry** — Add `Tick` to `TelemetryEvent::Kind`, extend telemetry thread drain loop, add `onTransportTick` callback + member. Build clean.

4. **Phase 4: NAPI Bindings** — Add 6 new NAPI methods to `AudioEngineWrapper`, register in `DefineClass`, implement `tickTsfn_` ThreadSafeFunction. Build clean.

5. **Phase 5: IPC Plumbing** — Add IpcChannel values, IpcSendContract entries, ElectronAPI methods, preload sends/listener, `transport-handlers.ts`, utility process switch cases + callback, `TransportTickData` type. TypeScript builds clean.

6. **Phase 6: X0X Parser** — `src/renderer/pattern-parser.ts`, unit tests in `src/pattern-parser.test.ts`. All parser unit tests pass.

7. **Phase 7: REPL Layer** — `transport-namespace.ts`, `results/pattern.ts`, `pat()` in globals, register `transport` in `bounce-api.ts`, update `bounce-globals.d.ts`. TypeScript builds clean.

8. **Phase 8: Tests & Verification** — `tests/transport-pattern.spec.ts` E2E tests, `src/transport-namespace.test.ts` unit tests, run `./build.sh`.

## Estimated Scope

**Large** — 8 phases, spans C++ audio engine, NAPI bindings, 6+ TypeScript files, new IPC channels, new REPL namespace and result type, unit tests, and E2E tests.

## Plan Consistency Checklist

- [x] All sections agree: patterns are ephemeral (no DB persistence in this spec)
- [x] All sections agree: one pattern per channel, replaced at next bar
- [x] All sections agree: note-off fires at next tick start (100% gate)
- [x] All sections agree: `pat().play(n)` uses 1-indexed channel numbers (1–8) for consistency with `mx.ch(n)`
- [x] REPL-facing changes: `transport` has `help()`, `Pattern` has `help()`, both have useful terminal summaries
- [x] Testing strategy: `src/pattern-parser.test.ts` (parser), `src/transport-namespace.test.ts` (REPL help/display), `tests/transport-pattern.spec.ts` (E2E tick + playback)
- [x] No contradictory constraints between sections
- [x] JSON vs. flat-buffer serialization decision deferred to IMPL phase (see Risks)
