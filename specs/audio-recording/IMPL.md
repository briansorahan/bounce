# Implementation: Audio Recording

**Spec:** specs/audio-recording  
**Created:** 2026-03-17  
**Status:** Complete

## Completed Changes

### `src/electron/main.ts`
- Imported `session` from electron.
- Added `session.defaultSession.setPermissionRequestHandler` and `setPermissionCheckHandler` in `app.whenReady()` to grant `media` permission requests from the renderer.
- Added `get-sample-by-name` IPC handler (delegates to `dbManager.getSampleByPath`).
- Added `store-recording` IPC handler: accepts PCM Float32 data, computes SHA256 hash, stores via `dbManager.storeSample` with the user-supplied name as `file_path`.

### `src/electron/preload.ts`
- Exposed `getSampleByName` and `storeRecording` IPC channels via `contextBridge.exposeInMainWorld`.

### `src/renderer/types.d.ts`
- Added `StoreRecordingResult` interface.
- Added `getSampleByName` and `storeRecording` to the `Window.electron` type.

### `src/renderer/bounce-result.ts`
- Added `AudioInputDevice`, `RecordOptions`, `AudioDeviceBindings` interfaces.
- Added `InputsResult` class — numbered table of audio inputs with `help()`.
- Added `AudioDevice` class — holds device info, exposes `record()`, `help()`, `toString()`.
- Added `RecordingHandle` class — non-PromiseLike wrapper for an active recording; `stop()` returns `SamplePromise`.
- Extended `SampleNamespaceBindings` with `inputs` and `dev` bindings.
- Extended `SampleNamespace` with `inputs()` and `dev()` methods.

### `src/renderer/bounce-api.ts`
- Imported and re-exported `InputsResult`, `AudioDevice`, `RecordingHandle`.
- Added `getAudioInputs()` helper — triggers permission grant, enumerates `audioinput` devices.
- Added `recordSample()` — full recording pipeline: `getUserMedia` → `MediaRecorder` → WebM chunks → `AudioContext.decodeAudioData` → Float32 PCM → `window.electron.storeRecording` → `SamplePromise`. Supports `{ duration: N }` (returns `SamplePromise`) and interactive stop (returns `Promise<RecordingHandle>`).
- Updated `SampleNamespace` creation to include `inputs` and `dev` bindings with `help()` methods.
- Updated `sn` toString and `help()` to advertise recording commands.

### `tests/recording.spec.ts` (new)
- E2E Playwright tests: `sn.inputs()`, `sn.dev(0)`, record/stop flow, duration auto-stop, overwrite error + success, `sn.read()` retrieval after recording.
- Uses `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream` Chromium flags for CI without real hardware.

### `src/bounce-api.test.ts`
- Added `getSampleByName` and `storeRecording` to `mockElectron`.
- Imported `InputsResult`, `AudioDevice`, `RecordingHandle`.
- Added unit tests for `InputsResult.toString()` / `.help()`, `AudioDevice.toString()` / `.help()`, `RecordingHandle.toString()` / `.help()` / `.stop()`, and `sn.inputs.help()` / `sn.dev.help()`.

## Notes
- macOS distribution will require `NSMicrophoneUsageDescription` in `Info.plist` and `com.apple.security.device.microphone` entitlement — no packaging config exists yet.
- The recording pipeline decodes WebM/Opus blobs using the renderer's `AudioContext.decodeAudioData` (no new dependencies).
- Recordings are stored with `file_path = sampleId` so `sn.read("name")` retrieves them identically to file-based samples.
