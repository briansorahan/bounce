# Plan: Transport Clock & Pattern DSL

**Spec:** specs/transport-pattern-dsl  
**Created:** 2026-03-25  
**Status:** In Progress

## Context

The audio engine has no transport clock. Adding one enables sample-accurate beat-synced scheduling. To test the transport interactively, we pair it with a minimal X0X-style live-coding DSL: a multi-line string notation where each line is a 16-step row for one MIDI note, and letters encode velocity. Patterns are compiled in TypeScript, sent to the C++ audio thread, and play back sample-accurately on the instrument attached to the target mixer channel, quantized to the next bar boundary.

See RESEARCH.md for full analysis of the existing architecture and all design decisions.

## Approach Summary

1. Add a `Transport` struct and `PatternData` struct to the C++ audio engine
2. Add a dedicated **scheduler thread** that reads pattern state, precomputes events with an 8–10 block lookahead, and writes `ScheduledEvent` records into a wait-free SPSC ring buffer for the audio thread to consume sample-accurately
3. `processBlock()` only drains the scheduler ring — it does not compute pattern logic itself, keeping the real-time audio path minimal
4. Expose transport and pattern control through the standard NAPI → IPC → utility process → native call chain
5. Write a TypeScript X0X parser that compiles the mini-notation to `CompiledPattern` JSON (format confirmed: JSON string over IPC)
6. Add `transport` REPL namespace and `pat` namespace with `pat.xox(notation)` method returning a `Pattern` result type
7. Extend the existing status bar to show BPM, current bar/beat, sample rate, and buffer size

## Architecture Changes

The transport and scheduler live in the C++ audio engine. A new **scheduler thread** is added alongside the existing telemetry thread. No new processes or IPC channels beyond what's listed below are introduced.

```
Renderer: transport.bpm(120) / transport.start() / pat.xox(...).play(1)
  ↓ window.electron.transportSetBpm / transportStart / transportSetPattern
  ↓ ipcRenderer.send
Main process: ipcMain.on("transport-*") → port.postMessage(...)
Utility process: message switch → engine.transportStart() / engine.transportSetPattern(...)

  Audio Engine (C++ — 3 threads):
  ┌─────────────────────────────────────────────────────────┐
  │  Audio thread (miniaudio callback ~86 Hz)               │
  │  - Drains ControlMsg queue (transport start/stop/bpm,   │
  │    pattern set/clear) — updates schedulerData_ copy     │
  │  - Drains schedRing_ (SPSC ← scheduler thread)          │
  │    fires noteOn/noteOff at exact frame offset           │
  │  - Writes sampleCounter_ atomic                         │
  │  - Writes Tick events to telemetry ring                 │
  │  - Renders instruments → mix → output                   │
  ├─────────────────────────────────────────────────────────┤
  │  Scheduler thread (new, wakes every ~4 blocks)          │
  │  - Reads sampleCounter_ + schedulerData_ (mutex copy)   │
  │  - Computes events for [scheduledUpTo_, +10 blocks)     │
  │  - Writes ScheduledEvent into schedRing_ (SPSC)         │
  │  - Updates scheduledUpTo_ atomic                        │
  ├─────────────────────────────────────────────────────────┤
  │  Telemetry thread (existing, ~60 Hz)                    │
  │  - Drains telemetry ring → fires position/ended/tick    │
  │    callbacks → ThreadSafeFunction → utility process     │
  └─────────────────────────────────────────────────────────┘

Utility process → port.postMessage({type:"transport-tick",...})
Main process → webContents.send("transport-tick", {...})
Renderer: ipcRenderer.on("transport-tick") → status bar update (BPM, bar/beat)
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
    int scheduledBar;       // bar at which to start playing (-1 = immediate on transport start)
    std::array<PatternStep, 16> steps;
};

struct Transport {
    bool running = false;
    double bpm = 120.0;
    uint64_t startSampleCount = 0;  // value of sampleCounter_ when transport last started
};

struct ScheduledEvent {
    uint64_t samplePosition;        // absolute sample count when event fires
    enum class Type { NoteOn, NoteOff } type;
    int channelIndex;
    uint8_t note;
    float velocity;
};

// Snapshot of transport state owned entirely by the scheduler thread.
// Written only by the scheduler thread when it drains transportControlQueue_.
// Never touched by the audio thread.
struct SchedulerData {
    bool running = false;
    double bpm = 120.0;
    uint64_t startSampleCount = 0;
    std::map<int, std::shared_ptr<PatternData>> activePatterns; // channelIndex → pattern
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

**New `TelemetryEvent` fields:**
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
void onDeviceInfo(std::function<void(int sampleRate, int bufferSize)> cb);
```

These methods enqueue to `transportControlQueue_` (consumed by the **scheduler thread**), **not** `controlQueue_` (consumed by the audio thread). Transport `ControlMsg::Op` values are not in the audio thread's switch. **The audio thread never acquires any lock.**

**New private members:**
```cpp
// ── Audio control (unchanged) ────────────────────────────────────────────────
// controlQueue_ / controlMutex_ — existing; audio thread drains it.
// Transport ops are NOT routed here.

// ── Transport control queue ──────────────────────────────────────────────────
// JS thread enqueues; scheduler thread drains. Audio thread never touches this.
std::vector<ControlMsg> transportControlQueue_;
std::mutex transportMutex_;

// ── SchedulerData ─────────────────────────────────────────────────────────────
// Owned exclusively by the scheduler thread.
// No mutex needed — only the scheduler thread reads/writes it.
SchedulerData schedulerData_;

// ── Scheduler → audio SPSC ring (wait-free) ──────────────────────────────────
static constexpr int kSchedRingSize = 4096;
std::array<ScheduledEvent, kSchedRingSize> schedRing_;
std::atomic<uint32_t> schedWritePos_{0};
std::atomic<uint32_t> schedReadPos_{0};

// ── Cross-thread atomics ──────────────────────────────────────────────────────
// Written by audio thread each block; read by scheduler thread.
std::atomic<uint64_t> sampleCounter_{0};
// Written by scheduler thread; read by scheduler thread only.
std::atomic<uint64_t> scheduledUpTo_{0};

// Lock-free transport state for audio thread tick telemetry.
// Written by scheduler thread after draining transportControlQueue_.
// Read by audio thread without any lock.
std::atomic<bool>     transportRunning_{false};
std::atomic<uint64_t> transportStartSample_{0};
// BPM as fixed-point uint64_t (bpm * 1000) — guaranteed lock-free on all platforms.
std::atomic<uint64_t> transportBpmFixed_{120000};  // default 120.000 BPM

// ── Scheduler thread ──────────────────────────────────────────────────────────
std::thread schedulerThread_;
std::atomic<bool> schedulerRunning_{false};

// ── Telemetry callbacks ───────────────────────────────────────────────────────
std::function<void(int, int, int, int)> tickCb_;
std::function<void(int, int)> deviceInfoCb_;
```

#### `native/src/audio-engine.cpp`

**New public methods** (enqueue to `transportControlQueue_`, NOT `controlQueue_`):
```cpp
void AudioEngine::transportStart() {
    ControlMsg msg; msg.op = Op::TransportStart;
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}
void AudioEngine::transportStop() {
    ControlMsg msg; msg.op = Op::TransportStop;
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}
void AudioEngine::transportSetBpm(double bpm) {
    ControlMsg msg; msg.op = Op::TransportSetBpm; msg.transportBpm = bpm;
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}
void AudioEngine::transportSetPattern(std::shared_ptr<PatternData> pattern) {
    ControlMsg msg; msg.op = Op::TransportSetPattern; msg.patternData = std::move(pattern);
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}
void AudioEngine::transportClearPattern(int channelIndex) {
    ControlMsg msg; msg.op = Op::TransportClearPattern; msg.channelIndex = channelIndex;
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}
```

**No transport cases in the audio thread ControlMsg switch.** `TransportStart/Stop/SetBpm/SetPattern/ClearPattern` are processed exclusively by `schedulerLoop()`.

**Audio thread additions to `processBlock()`** (after existing ControlMsg drain, before rendering):
```cpp
const uint64_t blockStart = sampleCounter_.load(std::memory_order_relaxed);
const uint64_t blockEnd   = blockStart + frameCount;

// Drain scheduled events for this block (lock-free SPSC — no mutex)
{
    uint32_t r = schedReadPos_.load(std::memory_order_acquire);
    uint32_t w = schedWritePos_.load(std::memory_order_acquire);
    while (r != w) {
        const ScheduledEvent& ev = schedRing_[r % kSchedRingSize];
        if (ev.samplePosition >= blockEnd) break;
        if (ev.samplePosition >= blockStart) {
            if (ev.type == ScheduledEvent::Type::NoteOn)
                fireNoteOn(ev.channelIndex, ev.note, ev.velocity);
            else
                fireNoteOff(ev.channelIndex, ev.note);
        }
        ++r;
        schedReadPos_.store(r, std::memory_order_release);
    }
}
sampleCounter_.store(blockEnd, std::memory_order_release);

// Emit tick telemetry — reads only lock-free atomics, zero mutex involvement
if (transportRunning_.load(std::memory_order_acquire)) {
    const uint64_t startSample = transportStartSample_.load(std::memory_order_relaxed);
    const double bpm = transportBpmFixed_.load(std::memory_order_relaxed) / 1000.0;
    const double spt = sampleRate_ * 60.0 / bpm / 4.0;
    const uint64_t elapsed   = blockStart - startSample;
    const uint64_t tickBefore = (uint64_t)(elapsed / spt);
    const uint64_t tickAfter  = (uint64_t)((elapsed + frameCount) / spt);
    if (tickAfter > tickBefore) {
        const uint64_t t = tickBefore + 1;
        TelemetryEvent tev;
        tev.kind = TelemetryEvent::Kind::Tick;
        tev.absoluteTick = (int)t;
        tev.bar  = (int)(t / 16);
        tev.beat = (int)((t % 16) / 4);
        tev.step = (int)(t % 16);
        int w2 = ringWritePos_.load(std::memory_order_relaxed);
        ring_[w2 % kRingSize] = std::move(tev);
        ringWritePos_.store(w2 + 1, std::memory_order_release);
    }
}
```

**Scheduler thread** (`schedulerLoop()`):

The scheduler thread is the **sole owner of `SchedulerData`** and the **sole consumer of `transportControlQueue_`**. It first drains the transport queue to update its private state, then publishes lock-free atomics for the audio thread, then computes events for the lookahead window.

```cpp
void AudioEngine::schedulerLoop() {
    constexpr int kLookaheadBlocks = 10;
    constexpr int kNominalBlockSize = 512;

    while (schedulerRunning_.load(std::memory_order_acquire)) {
        std::this_thread::sleep_for(
            std::chrono::microseconds((int)(4.0 * kNominalBlockSize / sampleRate_ * 1e6)));

        // Step 1: drain transport control queue.
        // The scheduler thread is the sole consumer; audio thread never touches this queue.
        {
            std::vector<ControlMsg> incoming;
            {
                std::lock_guard<std::mutex> lk(transportMutex_);
                incoming.swap(transportControlQueue_);
            }
            for (auto& msg : incoming) {
                switch (msg.op) {
                case Op::TransportStart:
                    schedulerData_.startSampleCount =
                        sampleCounter_.load(std::memory_order_acquire);
                    schedulerData_.running = true;
                    scheduledUpTo_.store(schedulerData_.startSampleCount,
                                         std::memory_order_release);
                    for (auto& [ch, pd] : schedulerData_.activePatterns)
                        if (pd->scheduledBar < 0) pd->scheduledBar = 0;
                    // Publish to audio thread atomics (lock-free writes)
                    transportStartSample_.store(schedulerData_.startSampleCount,
                                                 std::memory_order_release);
                    transportBpmFixed_.store((uint64_t)(schedulerData_.bpm * 1000),
                                              std::memory_order_release);
                    transportRunning_.store(true, std::memory_order_release);
                    break;

                case Op::TransportStop:
                    schedulerData_.running = false;
                    transportRunning_.store(false, std::memory_order_release);
                    // Queued NoteOffs in schedRing_ will play out naturally —
                    // they are in the near future and cause no harm.
                    break;

                case Op::TransportSetBpm:
                    schedulerData_.bpm = msg.transportBpm;
                    transportBpmFixed_.store((uint64_t)(msg.transportBpm * 1000),
                                              std::memory_order_release);
                    scheduledUpTo_.store(sampleCounter_.load(std::memory_order_acquire),
                                          std::memory_order_release);
                    break;

                case Op::TransportSetPattern: {
                    auto pd = msg.patternData;
                    if (schedulerData_.running) {
                        const double spt = sampleRate_ * 60.0 / schedulerData_.bpm / 4.0;
                        const uint64_t elapsed =
                            sampleCounter_.load(std::memory_order_relaxed)
                            - schedulerData_.startSampleCount;
                        pd->scheduledBar = (int)(elapsed / (spt * 16)) + 1; // next bar
                    } else {
                        pd->scheduledBar = 0;
                    }
                    schedulerData_.activePatterns[pd->channelIndex] = pd;
                    scheduledUpTo_.store(sampleCounter_.load(std::memory_order_acquire),
                                          std::memory_order_release);
                    break;
                }

                case Op::TransportClearPattern:
                    schedulerData_.activePatterns.erase(msg.channelIndex);
                    break;

                default: break;
                }
            }
        }

        // Step 2: compute scheduled events for the lookahead window.
        if (!schedulerData_.running || schedulerData_.activePatterns.empty()) continue;

        const double spt = sampleRate_ * 60.0 / schedulerData_.bpm / 4.0;
        const uint64_t now          = sampleCounter_.load(std::memory_order_acquire);
        const uint64_t lookaheadEnd = now + (uint64_t)(kLookaheadBlocks * kNominalBlockSize);
        const uint64_t upTo         = scheduledUpTo_.load(std::memory_order_relaxed);
        if (lookaheadEnd <= upTo) continue;

        const uint64_t startSample = schedulerData_.startSampleCount;
        const uint64_t startTick =
            (uint64_t)((upTo > startSample ? upTo - startSample : 0) / spt);
        const uint64_t endTick = (uint64_t)((lookaheadEnd - startSample) / spt);

        for (uint64_t tick = startTick; tick <= endTick; ++tick) {
            const int step = (int)(tick % 16);
            const int bar  = (int)(tick / 16);
            const uint64_t tickSample = startSample + (uint64_t)(tick * spt);

            for (auto& [ch, pd] : schedulerData_.activePatterns) {
                if (bar < pd->scheduledBar) continue;
                const int patStep =
                    (int)((tick - (uint64_t)(pd->scheduledBar * 16)) % 16);
                for (auto& [note, vel] : pd->steps[patStep].events) {
                    uint32_t sw = schedWritePos_.load(std::memory_order_relaxed);
                    schedRing_[sw % kSchedRingSize] = {
                        tickSample, ScheduledEvent::Type::NoteOn, ch, note, vel / 127.f};
                    schedWritePos_.store(sw + 1, std::memory_order_release);

                    const uint64_t offSample = startSample + (uint64_t)((tick + 1) * spt);
                    sw = schedWritePos_.load(std::memory_order_relaxed);
                    schedRing_[sw % kSchedRingSize] = {
                        offSample, ScheduledEvent::Type::NoteOff, ch, note, 0.f};
                    schedWritePos_.store(sw + 1, std::memory_order_release);
                }
            }
        }
        scheduledUpTo_.store(lookaheadEnd, std::memory_order_release);
    }
}
```

**`start()` / `stop()` additions:**
```cpp
// In start(), after device init:
schedulerRunning_.store(true, std::memory_order_release);
schedulerThread_ = std::thread([this] { schedulerLoop(); });
if (deviceInfoCb_) deviceInfoCb_(device_.sampleRate,
                                  device_.playback.internalPeriodSizeInFrames);

// In stop():
schedulerRunning_.store(false, std::memory_order_release);
if (schedulerThread_.joinable()) schedulerThread_.join();
```

**Private helpers:**
```cpp
void AudioEngine::fireNoteOn(int channelIndex, uint8_t note, float velocity) {
    for (auto& inst : instruments_)
        if (channels_[channelIndex].attachedInstrumentId == inst->id())
            { inst->noteOn((int)note, velocity); return; }
}
void AudioEngine::fireNoteOff(int channelIndex, uint8_t note) {
    for (auto& inst : instruments_)
        if (channels_[channelIndex].attachedInstrumentId == inst->id())
            { inst->noteOff((int)note); return; }
}
```

**Telemetry thread drain loop extension:**
```cpp
case TelemetryEvent::Kind::Tick:
    if (tickCb_) tickCb_(ev.absoluteTick, ev.bar, ev.beat, ev.step);
    break;
```

#### `native/src/audio-engine-binding.cpp`

**New NAPI methods** (registered via `InstanceMethod` in `DefineClass`):
```
transportStart, transportStop, transportSetBpm,
transportSetPattern, transportClearPattern,
onTransportTick, onDeviceInfo
```

`TransportSetPattern` uses **nlohmann/json** (single-header, added to `third_party/nlohmann/json.hpp`) to parse the JSON string passed from TypeScript:
```cpp
#include "../../third_party/nlohmann/json.hpp"

Napi::Value AudioEngineWrapper::TransportSetPattern(const Napi::CallbackInfo& info) {
    int channelIndex = info[0].As<Napi::Number>().Int32Value();
    std::string stepsJson = info[1].As<Napi::String>().Utf8Value();

    auto pd = std::make_shared<PatternData>();
    pd->channelIndex = channelIndex;
    pd->scheduledBar = -1;  // engine computes the actual bar at drain time

    auto j = nlohmann::json::parse(stepsJson);  // array of 16 step objects
    for (int i = 0; i < 16 && i < (int)j.size(); ++i) {
        for (auto& ev : j[i]["events"])
            pd->steps[i].events.push_back({(uint8_t)ev["note"], (uint8_t)ev["velocity"]});
    }
    engine_->transportSetPattern(pd);
    return info.Env().Undefined();
}
```

JSON format sent from TypeScript:
```json
[
  {"events": [{"note": 60, "velocity": 64}, {"note": 64, "velocity": 80}]},
  {"events": []},
  ...16 entries total
]
```

`OnTransportTick` follows the existing `onPosition` ThreadSafeFunction pattern:
```cpp
engine_->onTransportTick([this](int abs, int bar, int beat, int step) {
    struct D { int abs, bar, beat, step; };
    auto* d = new D{abs, bar, beat, step};
    tickTsfn_.NonBlockingCall(d, [](Napi::Env env, Napi::Function cb, D* data) {
        cb.Call({ Napi::Number::New(env, data->abs), Napi::Number::New(env, data->bar),
                  Napi::Number::New(env, data->beat), Napi::Number::New(env, data->step) });
        delete data;
    });
});
```

`OnDeviceInfo` fires once after `start()`:
```cpp
engine_->onDeviceInfo([this](int sr, int bs) {
    struct D { int sr, bs; };
    auto* d = new D{sr, bs};
    deviceInfoTsfn_.NonBlockingCall(d, [](Napi::Env env, Napi::Function cb, D* data) {
        cb.Call({ Napi::Number::New(env, data->sr), Napi::Number::New(env, data->bs) });
        delete data;
    });
});
```

**`binding.gyp`**: No structural changes; `nlohmann/json.hpp` is header-only so no new source files or include paths are needed beyond adding the header to `third_party/nlohmann/`.

### TypeScript Changes

#### `src/shared/ipc-contract.ts`

**New `IpcChannel` enum values:**
```typescript
TransportStart:       "transport-start",
TransportStop:        "transport-stop",
TransportSetBpm:      "transport-set-bpm",
TransportSetPattern:  "transport-set-pattern",
TransportClearPattern:"transport-clear-pattern",
TransportTick:        "transport-tick",   // telemetry (main → renderer)
AudioDeviceInfo:      "audio-device-info", // telemetry (main → renderer, fires once at startup)
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
onAudioDeviceInfo(cb: (data: AudioDeviceInfoData) => void): void
```

**New shared types:**
```typescript
export interface TransportTickData {
  absoluteTick: number;
  bar: number;
  beat: number;
  step: number;
}

export interface AudioDeviceInfoData {
  sampleRate: number;
  bufferSize: number;
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
onAudioDeviceInfo: (cb) =>
    ipcRenderer.on("audio-device-info", (_event, data: AudioDeviceInfoData) => cb(data)),
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

**Utility process additions** — device info callback at startup:
```typescript
engine.onDeviceInfo((sampleRate: number, bufferSize: number) => {
    port?.postMessage({ type: "audio-device-info", sampleRate, bufferSize });
});
```

Main process forwards `audio-device-info` to renderer via `webContents.send` (same pattern as `mixer-levels`).

#### `src/renderer/types.d.ts`

Add to `Window.electron`:
```typescript
transportStart(): void;
transportStop(): void;
transportSetBpm(bpm: number): void;
transportSetPattern(channelIndex: number, stepsJson: string, scheduledBar: number): void;
transportClearPattern(channelIndex: number): void;
onTransportTick(cb: (data: import('../shared/ipc-contract').TransportTickData) => void): void;
onAudioDeviceInfo(cb: (data: import('../shared/ipc-contract').AudioDeviceInfoData) => void): void;
```

#### `src/renderer/namespaces/pat-namespace.ts` (new file)

`pat` is a namespace object (not a bare function) so future pattern creators (e.g. `pat.euclid(...)`) can be added without a naming conflict.

```typescript
import type { NamespaceDeps } from "../bounce-api";
import { BounceResult } from "../bounce-result";
import { parsePattern } from "../pattern-parser";
import { Pattern } from "../results/pattern";

export interface PatNamespace {
  xox(notation: string): Pattern;
  help(): BounceResult;
}

export function buildPatNamespace(_deps: NamespaceDeps): { pat: PatNamespace } {
    const pat: PatNamespace = {
        xox(notation: string): Pattern {
            const compiled = parsePattern(notation);
            return new Pattern(notation, compiled);
        },
        help(): BounceResult { /* ... */ }
    };
    return { pat };
}
```

#### `src/renderer/bounce-api.ts`

```typescript
import { buildTransportNamespace } from "./namespaces/transport-namespace";
import { buildPatNamespace } from "./namespaces/pat-namespace";

// in buildBounceApi():
const { transport } = buildTransportNamespace(namespaceDeps);
const { pat } = buildPatNamespace(namespaceDeps);

const api = {
  sn, env, vis, proj, corpus, fs, inst, mx, midi, transport, pat, ...globals
};
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
  channelIndex: number;   // set later by .play(); -1 = unassigned
  steps: CompiledStep[];  // always 16
}

export function parsePattern(notation: string): CompiledPattern { ... }
export function parseMidiNote(name: string): number { ... }
export function velocityFromChar(ch: string): number { ... }
```

**Note name format:** `[a-gA-G]'?[0-9]`
- `c4` → MIDI 60, `c'4` → MIDI 61, `a4` → MIDI 69, `b'3` → MIDI 58
- Octave uses MIDI standard: C-1 = 0, C0 = 12, C4 = 60

**Velocity mapping:** `a`–`z` → indices 0–25; `A`–`Z` → indices 26–51 → velocity = `Math.round(1 + (index/51)*126)` → range 1–127

**Step count:** Each row must have exactly 16 non-whitespace characters. Fewer → pad with rests; more → throw `BounceError` describing the row and count found.

#### `src/renderer/namespaces/transport-namespace.ts` (new file)

```typescript
export interface TransportNamespace {
  bpm(value?: number): BounceResult;
  start(): BounceResult;
  stop(): BounceResult;
  help(): BounceResult;
}
```

Terminal display for `TransportResult`: `Transport  bpm: 120  running: true`

#### `src/renderer/bounce-globals.d.ts`

```typescript
declare const transport: import('./namespaces/transport-namespace').TransportNamespace;
declare const pat: import('./namespaces/pat-namespace').PatNamespace;
```

### Terminal UI Changes

The existing `#status-line` DOM element (24px, `src/renderer/status-line.ts`, `src/renderer/index.html`) currently shows only a green/red error indicator. This spec extends it to also display transport and audio engine info.

**Status bar layout** (left → right):
```
● Ready   |   120 BPM  bar: 3  beat: 2   |   44100 Hz  512 buf
```

- Left zone: existing error indicator (unchanged)
- Middle zone: transport info — updated on each `transport-tick` IPC event; shows `--- BPM` and `bar: -  beat: -` when transport is stopped
- Right zone: audio device info — populated once on `audio-device-info` IPC event; shows `- Hz  - buf` until received

**`StatusLine` class changes** (`src/renderer/status-line.ts`):
- Add `updateTransport(data: TransportTickData | null, bpm: number)` — updates the middle zone text
- Add `updateDeviceInfo(sampleRate: number, bufferSize: number)` — populates the right zone once
- Called from `app.ts` when `onTransportTick` and `onAudioDeviceInfo` events arrive

**`index.html` changes:**
- Add `.status-transport` and `.status-device` `<span>` elements inside `#status-line`
- Minimal CSS: monospace, same height as existing status text, separated by `|` dividers

### REPL Interface Contract

#### `transport` namespace

| Expression | Terminal Output |
|---|---|
| `transport.help()` | Full API reference with BPM range, start/stop, examples |
| `transport.bpm(120)` | `Transport  bpm: 120  (was: 90)` |
| `transport.bpm()` | `Transport  bpm: 120  running: false` |
| `transport.start()` | `Transport started  bpm: 120` |
| `transport.stop()` | `Transport stopped  bar: 3  beat: 2  step: 7` |

#### `pat` namespace and `pat.xox()` return value (`Pattern`)

```
Pattern  steps: 16  notes: 3
  c4  . a . A . . E . . . . . . . .
  e4  a . . . E . . . a . . . E . .
  g4  . . . . . . . . a . . . . . .
play: p.play(1)   stop: p.stop()   help: p.help()
```

| Expression | Terminal Output |
|---|---|
| `pat.help()` | API reference for the `pat` namespace and all creators |
| `pat.xox(notation)` | Returns `Pattern` — ASCII grid display above |
| `p.play(1)` | `Pattern playing on channel 1  bar: next` |
| `p.stop()` | `Pattern stopped` |
| `p.help()` | API reference + notation guide + velocity table |

#### REPL Contract Checklist

- [x] `transport` namespace exposes `help()`
- [x] `pat` namespace exposes `help()`
- [x] `Pattern` result type exposes `help()`
- [x] `TransportResult` (returned by bpm/start/stop) shows BPM + running state
- [x] `Pattern.toString()` renders ASCII grid with note labels and step characters
- [x] Unit tests planned for parser (`src/pattern-parser.test.ts`)
- [x] Unit tests planned for `transport` and `pat` help() text and `Pattern` display
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
    // define pattern via pat.xox()
    await evaluate(page, "const p = pat.xox(`c4 = a . . . a . . . a . . . a . . .`)");
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

test("pat.xox() displays ASCII grid in terminal", async ({ page }) => {
    const output = await evaluate(page, "pat.xox(`c4 = a . . . . . . . . . . . . . . .`)");
    expect(output).toContain("c4");
    expect(output).toContain("Pattern");
});
```

### Manual Testing

- Set BPM to 60, start transport, verify pattern fires once per second
- Change BPM mid-pattern via `transport.bpm(120)` — verify tempo change takes effect
- Call `pat.xox(...)` with invalid notation — verify descriptive error in terminal
- Attach instrument to channel and verify audio output when pattern fires
- `transport.stop()` while pattern is playing — verify no hanging notes

## Success Criteria

1. `transport.bpm(120).start()` starts the clock with no errors
2. `pat.xox(notation).play(1)` queues the pattern and it fires at the next bar boundary
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
| Audio thread acquires a lock | **Eliminated by design.** The audio thread reads only lock-free SPSC ring and 3 atomics. `transportControlQueue_` and `SchedulerData` are never touched by the audio thread. |
| `schedRing_` overflow | Ring size 4096; at 120 BPM with 2 events/step × 8 channels × 10-block lookahead = 160 events maximum — far below capacity |
| Scheduler sees stale `startSampleCount` after `TransportStart` | The scheduler thread writes `startSampleCount` itself (reads `sampleCounter_` at drain time) — no stale data issue |
| BPM change mid-bar leaves stale precomputed events in `schedRing_` | `TransportSetBpm` resets `scheduledUpTo_` so scheduler recomputes from current position; stale NoteOffs in ring are harmless |
| `TransportClearPattern` doesn't remove already-queued events | Note-ons/offs for the cleared channel that are already in the ring will fire once — the pattern simply won't repeat |
| JSON parsing in NAPI binding adds a C++ dependency | Use nlohmann/json single-header (`third_party/nlohmann/json.hpp`) — no build changes needed |
| Tick telemetry rate (~8 ticks/sec at 120 BPM) saturates telemetry ring | At 120 BPM, 8 ticks/sec; ring has 1024 slots drained at ~60 Hz → no saturation risk |
| No instrument attached to target channel when pattern fires | `fireNoteOn` silently skips if no instrument found — no crash |

**Note on JSON serialization:** Confirmed — TypeScript compiles `CompiledPattern` steps to a JSON string and passes it to `engine.transportSetPattern()`. C++ parses this with nlohmann/json. Format: `[{"events":[{"note":60,"velocity":64}]},{"events":[]},...]` (16 entries).

## Implementation Order

1. **Phase 1: C++ Transport Core** — `Transport` struct, `TransportStart/Stop/SetBpm` ControlMsg ops, `sampleCounter_` advance in `processBlock()`, tick telemetry emission, `onDeviceInfo` callback. Build clean.

2. **Phase 2: C++ Scheduler Thread** — `SchedulerData`, `ScheduledEvent`, `schedRing_` SPSC, `schedulerLoop()`, `PatternData/PatternStep`, `TransportSetPattern/ClearPattern` ControlMsg ops, `fireNoteOn`/`fireNoteOff` helpers. Build clean.

3. **Phase 3: C++ Tick Telemetry** — Add `Tick` to `TelemetryEvent::Kind`, extend telemetry thread drain loop, add `onTransportTick` callback + `tickCb_`. Build clean.

4. **Phase 4: NAPI Bindings** — Add 7 new NAPI methods (`transportStart`, `transportStop`, `transportSetBpm`, `transportSetPattern`, `transportClearPattern`, `onTransportTick`, `onDeviceInfo`), register in `DefineClass`, implement `tickTsfn_` and `deviceInfoTsfn_` ThreadSafeFunctions, add `third_party/nlohmann/json.hpp`. Build clean.

5. **Phase 5: IPC Plumbing** — Add `IpcChannel` values, `IpcSendContract` entries, `ElectronAPI` methods, `AudioDeviceInfoData` type, preload sends/listeners, `transport-handlers.ts`, main process forwarding for `audio-device-info`, utility process switch cases + callbacks, `types.d.ts` updates. TypeScript builds clean.

6. **Phase 6: X0X Parser** — `src/renderer/pattern-parser.ts` with `parsePattern`, `parseMidiNote`, `velocityFromChar`. Unit tests in `src/pattern-parser.test.ts`. All parser tests pass.

7. **Phase 7: REPL Layer** — `transport-namespace.ts`, `pat-namespace.ts`, `results/pattern.ts`, register `transport` + `pat` in `bounce-api.ts`, update `bounce-globals.d.ts`. TypeScript builds clean.

8. **Phase 8: Status Bar** — Extend `#status-line` HTML/CSS with `.status-transport` and `.status-device` zones; update `StatusLine` class with `updateTransport()` and `updateDeviceInfo()`; wire up `onTransportTick` and `onAudioDeviceInfo` listeners in `app.ts`. TypeScript builds clean.

9. **Phase 9: Tests & Verification** — `tests/transport-pattern.spec.ts` E2E tests, `src/transport-namespace.test.ts` unit tests, run `./build.sh`.

## Estimated Scope

**Large** — 9 phases, spans 3 C++ threads (scheduler + telemetry + audio), NAPI bindings, 7+ TypeScript files, new IPC channels, two new REPL namespaces, new result type, status bar extension, unit tests, and E2E tests.

## Plan Consistency Checklist

- [x] All sections agree: patterns are ephemeral (no DB persistence in this spec)
- [x] All sections agree: one pattern per channel, replaced at next bar
- [x] All sections agree: note-off fires at next tick start (100% gate), scheduled by scheduler thread
- [x] All sections agree: `pat.xox(notation).play(n)` uses 1-indexed channel numbers (1–8) for consistency with `mx.ch(n)`
- [x] All sections agree: JSON string serialization confirmed for `PatternData` over IPC, parsed in C++ with nlohmann/json
- [x] All sections agree: dedicated scheduler thread with 8-10 block lookahead writes to SPSC ring; audio thread only drains ring and reads 3 lock-free atomics — **audio thread never acquires any lock**
- [x] REPL-facing changes: `transport` has `help()`, `pat` has `help()`, `Pattern` has `help()`, all have useful terminal summaries
- [x] Status bar extended with transport and device info zones
- [x] Testing strategy: `src/pattern-parser.test.ts` (parser), `src/transport-namespace.test.ts` (REPL help/display), `tests/transport-pattern.spec.ts` (E2E tick + playback + status bar)
- [x] No contradictory constraints between sections
