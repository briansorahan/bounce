# Research: Audio Recording

**Spec:** specs/audio-recording  
**Created:** 2026-03-17  
**Status:** Complete

## Problem Statement

Bounce currently supports loading audio from files only. Users need the ability to record audio directly from system audio inputs (microphones, audio interfaces, etc.) and work with recordings as first-class `Sample` objects — enabling the same analysis and playback workflows already available for file-based samples.

## Background

The feature should feel native to the existing `sn` namespace:

```js
// List available input devices
sn.inputs()

// Open a device by index
const mic = sn.dev(0)

// Record and get a Sample
const recording = mic.record("my-take")

// Use it like any other sample
recording.onsets()
recording.play()
```

The `record()` return value must be a `Sample` (or `SamplePromise` thenable), identical in shape to what `sn.read()` returns, so the full analysis/playback API is immediately available.

## Related Work / Prior Art

- **Audacity / DAW recording:** Record from system input → waveform appears on timeline.
- **Web Audio API (`MediaRecorder`):** Browser-native recording pipeline; available in Electron renderer.
- **Electron media access:** Electron exposes `navigator.mediaDevices` in the renderer and requires `session.setPermissionRequestHandler` or `session.setPermissionCheckHandler` in the main process to grant `media` permissions.
- **Existing `sn.read()` pattern:** Returns `SamplePromise` thenable that resolves to a `Sample`; recording should produce the same shape.

## FluCoMa Algorithm Details

Not applicable to the recording capture itself. Once a recording is stored as a `Sample`, all existing FluCoMa analysis methods (`onsets()`, `nmf()`, `mfcc()`, etc.) apply identically.

## Technical Constraints

### Audio APIs in Electron

**Renderer process (preferred):**
- `navigator.mediaDevices.enumerateDevices()` — lists all media devices; filter by `kind === 'audioinput'`
- `navigator.mediaDevices.getUserMedia({ audio: { deviceId } })` — open a specific device
- `MediaRecorder` — records a `MediaStream` to `Blob` chunks (WebM/Opus or PCM depending on codec support)
- All three are available in Electron's renderer without additional native modules

**Main process alternative (not preferred):**
- Would require a third-party native audio library (e.g., `naudiodon`, `node-portaudio`)
- Adds a native dependency, complicates cross-platform builds, and increases maintenance burden
- Should be avoided unless renderer API proves insufficient

### Device Identification

`MediaDeviceInfo` objects have three relevant properties:
- `deviceId` — opaque string UUID, **not stable across sessions** (changes after permission revoke/re-grant)
- `groupId` — groups related devices (e.g., mic + speaker on same hardware)
- `label` — human-readable name (e.g., `"Built-in Microphone"`) — **only populated after permission is granted**

The user chose **numeric index** from an `sn.inputs()` listing. The internal implementation should map the index to the `deviceId` string when opening the device, but the user only ever deals with the integer index. Labels must be shown in the `sn.inputs()` output to make the index meaningful.

### Recording Output Format

`MediaRecorder` produces `Blob` chunks in a container format (WebM by default in Chromium). The resulting blob must be decoded into raw PCM and saved to a `.wav` file (or equivalent format the existing audio pipeline understands) so it can flow through the same `readAudioFile` / `audio-decode` path as any other sample.

Alternatively, the Web Audio API's `ScriptProcessorNode` or `AudioWorkletNode` can capture raw PCM float32 directly — no container decoding step needed — but this approach is more complex.

**Recommended path:** `MediaRecorder` → `Blob` → `ArrayBuffer` → decode via `audio-decode` (already in the project) → write `.wav` via `wav-decoder`/`audiobuffer-to-wav` → hand off to existing `readAudioFile` IPC channel.

### Permissions

Electron requires explicit microphone permission handling:
- In development: `app.commandLine.appendSwitch('use-fake-ui-for-media-stream')` can bypass for testing
- In production: `session.defaultSession.setPermissionRequestHandler` must approve `'media'` requests
- macOS also requires `NSMicrophoneUsageDescription` in `Info.plist` for distribution builds

## Audio Processing Considerations

- **Sample rate:** The recording should capture at the device's native rate (or a user-specified rate). The captured `Sample` should report its actual sample rate, just like file-based samples.
- **Channels:** Mono (1ch) for typical mic input; stereo possible for audio interfaces. Should preserve the actual channel count of the recording.
- **Buffer size / latency:** Not critical — this is post-hoc analysis, not real-time. `MediaRecorder` buffering is acceptable.
- **Duration limit:** `record()` should be a blocking/streaming operation. The user needs a way to stop recording. Options:
  - `mic.record("id")` starts recording and returns a handle with a `.stop()` method
  - `mic.record("id", { duration: 5 })` auto-stops after N seconds
  - Both should ultimately yield a `SamplePromise` that resolves when recording stops
- **Storage:** Recordings should be stored in the same sample database as file-loaded samples, keyed by hash. `SAMPLE_ID` is the user-visible name (like a filename stem) — it maps to a path in the bounce data directory.

## Terminal UI Considerations

### `sn.inputs()` return value
Should display a formatted table of available audio inputs:
```
Available audio inputs:
  [0]  Built-in Microphone       · 2ch
  [1]  Focusrite USB Audio       · 2ch
```
Return type could be a `BounceResult` subclass with a useful `toString()`.

### `sn.dev(index)` return value — `AudioDevice` class
Instance should display on REPL eval:
```
AudioDevice [0]: Built-in Microphone
  deviceId  abc123...  · 2ch · 44100Hz
  record(sampleId)  –  start recording
```

Must implement:
- `help()` — usage instructions for `record()`, how to stop, etc.
- `toString()` — compact summary shown when instance is the result of an eval

### `record()` return value
While recording is active, the REPL should indicate that recording is in progress. When stopped (or auto-stopped), it resolves to a `SamplePromise`, displaying the same summary as any `Sample`.

A `RecordingHandle` intermediary class may be needed if the user calls `.stop()` interactively:
```js
const h = mic.record("take1")  // starts recording, returns handle
h.stop()                        // stops recording, h resolves to Sample
```
`RecordingHandle` would also need `help()` and a useful `toString()` ("Recording in progress…").

### Tab completion
`sn.dev(...)` return value should offer tab completion for its methods (`record`, `help`). The existing `getCallablePropertyNames` mechanism should handle this automatically if `AudioDevice` is a plain object or class instance with enumerable methods.

## Cross-Platform Considerations

| Platform | Notes |
|---|---|
| macOS | Requires `NSMicrophoneUsageDescription` in `Info.plist` for App Store / notarized builds. Permissions dialog on first use. |
| Linux | ALSA/PulseAudio/PipeWire exposed via the browser media stack in Electron. No special permission UI needed in most desktop environments. |
| Windows | Windows Security popup on first use. `getUserMedia` works via WASAPI under Chromium. |

All three platforms expose audio inputs through `navigator.mediaDevices` in Electron's renderer, so no platform-specific code paths should be needed for the capture itself. The main process permission handler does need to handle the `'media'` permission type.

## Open Questions

~~1. **Stop mechanic:** Should `record()` return a `RecordingHandle` with `.stop()`, or should there be a `sn.stopRecording()` / `mic.stop()` command? The handle approach is more ergonomic but adds a new thenable wrapper class.~~
~~2. **Duration param:** Should `record("id", { duration: 5 })` be supported for fixed-length recordings?~~
~~3. **Overwrite behavior:** What if a sample with the given `SAMPLE_ID` already exists? Error, overwrite, or auto-rename?~~
~~5. **Permission grant flow:** If the user hasn't granted microphone permission yet, what should happen at `sn.inputs()` time vs `sn.dev()` time vs `mic.record()` time?~~
~~6. **`sn.inputs()` before permission grant:** `label` fields are empty strings until permission is granted. Should `sn.inputs()` trigger a permission request, or should it show `[unlabeled]` and let the user proceed?~~

## Resolved Questions

1. **Stop mechanic:** Both approaches supported. `mic.record("id")` returns a `RecordingHandle` with a `.stop()` method. `mic.record("id", { duration: 5 })` auto-stops after N seconds. In both cases the handle resolves to a `SamplePromise` when recording ends.

2. **Duration param:** Yes — `{ duration: N }` option supported for fixed-length recordings.

3. **Overwrite behavior:** Prompt the user to confirm before overwriting an existing sample with the same ID. If confirmed, overwrite. If not, abort with a message.

4. **Permission timing:** `sn.inputs()` triggers the permission request. This is the right UX — the user is explicitly asking about audio devices, so it's the natural moment to request mic access. Labels are empty before permission is granted, so permission must be in hand before listing.

5. **Permission persistence:** Confirmed — the **OS** (not Electron) owns permission state. On macOS and Windows, once the user grants mic access, it is remembered permanently across app restarts until the user explicitly revokes it in OS settings. On Linux (non-sandboxed), mic access is typically granted by default with no prompt. **No Bounce-side persistence logic is needed.** Required extras for macOS distribution: `com.apple.security.device.microphone` entitlement and `NSMicrophoneUsageDescription` in `Info.plist`.

6. **Sample storage:** Recordings are stored as raw PCM blobs directly in the `samples.audio_data` DB column — no WAV file written to disk. `file_path` will be `NULL`. A future export API can write WAV files on demand.

## Research Findings

1. **No native module needed.** The Web Audio / `MediaRecorder` / `MediaDevices` APIs are fully available in Electron's renderer process. Recording can be implemented entirely in TypeScript.
2. **The existing DB already supports this.** The `samples` table has an `audio_data BLOB NOT NULL` column (added in migration 005) and `file_path` is already nullable (migration 002). Recordings with `file_path = NULL` and raw PCM in `audio_data` are a first-class DB pattern.
3. **Playback requires zero changes.** The `read-audio-file` IPC handler already has a hash-based branch that loads `audio_data` from the DB and returns a `Float32Array` — the playback pipeline never touches the file system for DB-backed samples.
4. **Device index approach is sound.** The renderer enumerates `audioinput` devices at runtime and exposes them by index. The opaque `deviceId` string is used internally; users never see it.
5. **Permission handling is required.** The main process must register a permission handler for `'media'`. This is a small but mandatory change in `src/electron/main.ts`.
6. **`MediaRecorder` codec caveat.** Chromium supports `audio/webm;codecs=opus`. Raw PCM recording (`audio/wav`) is **not** natively supported by `MediaRecorder` in Chromium — the WebM blob must be decoded to Float32 PCM before storing in the DB. `audio-decode` (already in the project) handles this.
7. **Migration needed.** No schema change is required for storing recordings — the table already has the right columns. However, a new `storeSample` call path that accepts `null` for `file_path` and a user-provided name/ID needs to be confirmed against the current `UNIQUE(project_id, hash)` constraint (the hash of the recording will be computed from PCM content).
8. **REPL interface pattern is clear.** `AudioDevice` and `RecordingHandle` should follow the `BounceResult` / thenable wrapper conventions already in `bounce-result.ts`. `SamplePromise` is the target resolved type for `record()`.
9. **Migration system is in `database.ts`.** All migrations are private methods (`migrate001_baseTables()` … `migrate006_replEnv()`) in `DatabaseManager`. A new migration is only needed if the schema changes — which it does not for this feature.

## Next Steps

1. Write `PLAN.md` covering: IPC channel design, `AudioDevice` and `RecordingHandle` class shapes, permission handler addition, recording pipeline (capture → WebM blob → `audio-decode` → Float32 PCM → DB insert), REPL contract, overwrite-prompt UX, and test strategy. All open questions are resolved.
