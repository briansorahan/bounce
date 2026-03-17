# Plan: Audio Recording

**Spec:** specs/audio-recording  
**Created:** 2026-03-17  
**Status:** In Progress

## Context

The existing `sn` namespace supports file-based sample loading only. We're adding a recording pipeline using the Web Audio / `MediaDevices` / `MediaRecorder` APIs available in Electron's renderer — no new native modules. The DB already stores raw PCM in `samples.audio_data BLOB` with a nullable `file_path`, so recordings drop in as first-class `Sample` objects with zero schema changes. Playback already has a hash-based DB path and requires no changes.

## Approach Summary

1. Add a `session.setPermissionRequestHandler` in `main.ts` to approve `media` requests.
2. Add two new IPC channels (`store-recording`, `get-sample-by-name`).
3. Add `InputsResult`, `AudioDevice`, and `RecordingHandle` classes to `bounce-result.ts`.
4. Add `sn.inputs()` and `sn.dev()` to `SampleNamespace` in `bounce-api.ts`.
5. The recording pipeline runs entirely in the renderer: `getUserMedia` → `MediaRecorder` → WebM blob → `audio-decode` → Float32 PCM → IPC to store in DB → `SamplePromise`.

All audio capture, decoding, and device enumeration happen in the renderer process using browser APIs. IPC is only needed to cross into the main process for SQLite DB operations.

## Architecture Changes

Three new renderer classes following existing `BounceResult` / thenable patterns:

- **`InputsResult`** — `BounceResult` subclass returned by `sn.inputs()`. Holds `MediaDeviceInfo[]`, renders a numbered table.
- **`AudioDevice`** — `BounceResult` subclass returned by `sn.dev(index)`. Stores device info, exposes `record()`.
- **`RecordingHandle`** — `BounceResult` subclass + `PromiseLike<Sample>`. Returned immediately by `record()`. Resolves to `Sample` when recording stops.

The SAMPLE_ID string a user passes to `record()` is stored as `file_path` in the DB. This means `sn.read("my-take")` will find a recording by name through the existing path-based lookup — consistent with file-based samples.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/electron/main.ts`
- Add `session.defaultSession.setPermissionRequestHandler` to approve `'media'` permission requests (required for `getUserMedia` to work in renderer).
- Add IPC handler `store-recording`: receive `{name, audioData, sampleRate, channels, duration, overwrite}`, check if `getSampleByPath(name)` already exists — if it does and `overwrite` is false, return `{status: 'exists'}`; otherwise compute SHA256 hash of PCM data, call `dbManager.storeSample(...)`, return `{status: 'ok', hash, id, sampleRate, channels, duration, filePath: name}`.
- Add IPC handler `get-sample-by-name`: call `dbManager.getSampleByPath(name)`, return sample record or `null`. Used by `record()` to check existence *before* opening the mic, so the user can be informed upfront.

#### `src/electron/database.ts`
- Verify `storeSample()` accepts `null` for `file_path` (existing migration 002 made it nullable — confirm no NOT NULL constraint in the call site).
- No schema migration required.

#### `src/electron/preload.ts`
- Expose two new IPC channels via `contextBridge.exposeInMainWorld`:
  - `storeRecording(name, audioData, sampleRate, channels, duration, overwrite): Promise<StoreRecordingResult>`
  - `getSampleByName(name): Promise<SampleRecord | null>`
  - `confirmOverwriteDialog(name): Promise<boolean>`

#### `src/renderer/bounce-result.ts`
Add three new classes:

**`InputsResult extends BounceResult`**
```
toString() →
  Available audio inputs:
    [0]  Built-in Microphone    · 1ch
    [1]  Focusrite USB Audio    · 2ch
```
- Constructor takes `MediaDeviceInfo[]`
- `help()` → returns `BounceResult` explaining `sn.dev(index)` usage

**`AudioDevice extends BounceResult`**
```
toString() →
  AudioDevice [0]: Built-in Microphone
    record(sampleId)           – start recording
    record(sampleId, {duration: N})  – record for N seconds
```
- Constructor: `index: number, deviceId: string, label: string, channels: number`
- `record(sampleId: string, opts?: { duration?: number }): RecordingHandle`
- `help()` → returns `BounceResult` with full usage including stop mechanic

**`RecordingHandle extends BounceResult implements PromiseLike<Sample>`**
```
toString() →
  ⏺ Recording · Built-in Microphone · in progress
    h.stop() to finish  ·  resolves to Sample
```
- Constructor: `deviceLabel: string, promise: Promise<Sample>`
- `then(onfulfilled, onrejected)` → delegates to underlying `Promise<Sample>` (makes it thenable / auto-awaitable)
- `stop(): SamplePromise` — stops the `MediaRecorder`, returns a `SamplePromise` that resolves when the blob is decoded and stored
- `help()` → returns `BounceResult` explaining stop() and duration option

#### `src/renderer/bounce-api.ts`
Add to `SampleNamespace`:

**`sn.inputs(): Promise<InputsResult>`**
- Calls internal `getAudioInputs()` helper (see below)
- Returns `InputsResult`
- Attach `sn.inputs.help()` with usage docs

**`sn.dev(index: number): Promise<AudioDevice>`**
- Calls internal `getAudioInputs()` to get current device list (handles permission + enumeration)
- Validates index is in range; throws descriptive error if not
- Returns `AudioDevice` instance
- Attach `sn.dev.help()` with usage docs

**Internal `getAudioInputs()` helper (not REPL-exposed)**
```typescript
async function getAudioInputs(): Promise<MediaDeviceInfo[]> {
  // Trigger permission grant by opening and immediately closing a stream
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach(t => t.stop());
  // Now enumerate with labels populated
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'audioinput');
}
```

**`AudioDevice.record()` implementation (inside `bounce-api.ts` or a new `recording.ts`)**
```
1. Call window.electron.getSampleByName(sampleId)
2. If exists and no { overwrite: true } opt:
   → throw Error("Sample 'id' already exists. Use mic.record('id', { overwrite: true }) to replace it.")
3. Call getUserMedia({ audio: { deviceId: this.deviceId, echoCancellation: false } })
4. Create MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
5. Collect chunks via recorder.ondataavailable
6. Create RecordingHandle with a Promise that resolves when recorder.onstop fires:
   a. Combine chunks into single Blob
   b. Convert to ArrayBuffer
   c. Decode via audio-decode → AudioBuffer
   d. Extract Float32Array PCM (interleaved for multi-channel)
   e. Call window.electron.storeRecording(sampleId, pcmData, sampleRate, channels, duration, overwrite)
   f. If result.status === 'exists' (race condition guard) → throw Error with same message
   g. Construct and return Sample from stored record
7. recorder.start()
8. If opts.duration: setTimeout(() => recorder.stop(), opts.duration * 1000)
9. Return RecordingHandle immediately
```

#### `src/renderer/tab-completion.ts`
No changes expected — `getCallablePropertyNames` already handles any object with enumerable methods. `AudioDevice` and `RecordingHandle` will complete automatically. Verify during implementation.

### Terminal UI Changes

- `sn.inputs()` result: numbered table of inputs with channel count (see `InputsResult.toString()` above)
- `sn.dev(0)` result: compact `AudioDevice` summary with `record()` hint
- `mic.record("take")` result (when assigned to variable): `RecordingHandle` shows "⏺ Recording in progress" on next REPL print. When the handle is the direct result of a bare expression with `{duration: N}`, the REPL auto-awaits it and displays the resolved `Sample` summary after N seconds.
- `h.stop()` as bare expression: REPL auto-awaits the returned `SamplePromise` and displays the `Sample` summary.

### REPL Interface Contract

| Expression | Returns | REPL display |
|---|---|---|
| `sn.inputs()` | `InputsResult` | Numbered input device table |
| `sn.dev(0)` | `AudioDevice` | Device summary + record() hint |
| `mic.record("take")` (assigned) | `RecordingHandle` | "⏺ Recording · in progress" |
| `mic.record("take", {duration:5})` (bare) | `RecordingHandle` → auto-awaited → `Sample` | Sample summary after 5s |
| `h.stop()` (bare) | `SamplePromise` → auto-awaited → `Sample` | Sample summary |
| `sn.inputs.help()` | `BounceResult` | Usage doc |
| `sn.dev.help()` | `BounceResult` | Usage doc |
| `mic.help()` | `BounceResult` | `AudioDevice` usage doc |
| `h.help()` | `BounceResult` | `RecordingHandle` usage doc |

#### REPL Contract Checklist

- [ ] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [ ] Every returned custom REPL type defines a useful terminal summary
- [ ] The summary highlights workflow-relevant properties, not raw internal structure
- [ ] Unit tests and/or Playwright tests are identified for `help()` output
- [ ] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

- **macOS distribution only:** Add `NSMicrophoneUsageDescription` to `Info.plist` and `com.apple.security.device.microphone` entitlement to the entitlements file. Not required for development or Linux/Windows.
- No `package.json` dependency changes.
- No `tsconfig` changes.
- No `binding.gyp` changes.

## Testing Strategy

### Unit Tests

Add to `src/bounce-api.test.ts` (run manually with `npx tsx src/bounce-api.test.ts`):
- `sn.inputs.help()` returns a string containing "sn.inputs()" and "sn.dev"
- `sn.dev.help()` returns a string containing "record(" and "stop()"
- `InputsResult.toString()` with mock devices renders a numbered table with labels and channel counts
- `AudioDevice.toString()` renders device index, label, and record() hint
- `AudioDevice.help()` contains "record(", "stop()", and "duration"
- `RecordingHandle.toString()` contains "Recording" and device label
- `RecordingHandle.help()` contains "stop()" and "duration"

### E2E Tests

Add `tests/recording.spec.ts`. Since `MediaRecorder` requires real media hardware in Electron, use Electron's `--use-fake-device-for-media-stream` flag (or `app.commandLine.appendSwitch`) in the Playwright test setup to provide a synthetic audio source. This gives a real `MediaRecorder` flow with fake audio data, allowing end-to-end path coverage without a physical microphone.

Tests:
- `sn.inputs()` output contains `[0]` and at least one device label
- `sn.dev(0)` REPL output contains "AudioDevice [0]"
- `const h = mic.record("test-recording")` → terminal shows "⏺ Recording"
- `h.stop()` → terminal shows `Sample:` summary line with correct hash/duration
- `mic.record("test-recording", { duration: 0.5 })` as bare expression → auto-awaits → shows Sample summary
- Overwrite: after first recording, `mic.record("test-recording")` throws an error with instructions; `mic.record("test-recording", { overwrite: true })` succeeds and replaces the sample
- After successful recording, `sn.read("test-recording")` finds and returns the sample

### Manual Testing

- Verify on macOS that the OS permission dialog appears on first `sn.inputs()` call and does not appear again on subsequent app launches.
- Verify recording from a real microphone produces playable audio.
- Verify `recording.onsets()`, `recording.nmf()` etc. work identically to file-based samples.

## Success Criteria

- `sn.inputs()` lists real system audio inputs with labels and channel counts.
- `sn.dev(index)` returns a usable `AudioDevice` with correct terminal display.
- `mic.record("id")` starts recording and returns a `RecordingHandle` immediately.
- `h.stop()` or `{duration: N}` stops recording and resolves to a `Sample`.
- The `Sample` produced by recording is identical in API shape to one from `sn.read()`.
- All FluCoMa analysis methods (`onsets`, `nmf`, `mfcc`, etc.) work on recordings.
- `sn.read("recording-name")` retrieves the recording by name in a subsequent session.
- Overwrite is gated behind a native confirmation dialog.
- All `help()` methods return formatted usage docs.
- `InputsResult`, `AudioDevice`, `RecordingHandle` all have useful `toString()` output.
- Automated tests cover all `help()` outputs and REPL display strings.

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| `MediaRecorder` not available in test Electron env | Use `--use-fake-device-for-media-stream` Chromium flag in test setup |
| `audio-decode` can't decode Opus/WebM in all Electron versions | Test during implementation; fall back to `AudioWorkletNode` raw PCM capture if needed |
| Recording duration from decoded blob is inaccurate | Compute from `Float32Array.length / sampleRate` after decoding, not from metadata |
| Multi-channel interleaving mismatch with DB storage format | Confirm existing `storeSample` channel format during implementation; document expected layout |
| macOS mic permission not granted in Docker CI | Playwright tests use fake device stream, no real permission dialog needed in CI |

## Implementation Order

1. **Permission handler** — add `setPermissionRequestHandler` in `main.ts` (tiny, unblocks all local testing)
2. **IPC channels** — `store-recording`, `get-sample-by-name`, `confirm-overwrite-dialog` in `main.ts` + `preload.ts`
3. **`InputsResult` class** — add to `bounce-result.ts`, write unit tests for `toString()` and `help()`
4. **`AudioDevice` class** — add to `bounce-result.ts`, write unit tests
5. **`RecordingHandle` class** — add to `bounce-result.ts`, write unit tests
6. **`getAudioInputs()` helper + `sn.inputs()` + `sn.dev()`** — add to `bounce-api.ts`, write unit tests for `help()` outputs
7. **`AudioDevice.record()` pipeline** — `getUserMedia` → `MediaRecorder` → decode → IPC store → `SamplePromise`
8. **Overwrite dialog flow** — integrate `confirmOverwriteDialog` IPC into `record()`
9. **Playwright test setup** — add fake device flag to test Electron launch config
10. **`tests/recording.spec.ts`** — full E2E coverage
11. **macOS entitlements** — add `NSMicrophoneUsageDescription` and entitlement key

## Estimated Scope

Medium-Large

