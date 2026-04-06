# AudioFileService — Lead Developer Agent

## Purpose
AudioFileService decodes audio files from the filesystem, computes their SHA-256 hash, and persists them via StateService. It is the entry point for all user-supplied audio into Bounce.

## Position in the Dependency Graph
- **Dependencies**: StateService (for sample storage and cwd resolution)
- **Dependents**: renderer IPC bridge (via `read-audio-file` channel), CorpusService

## RPC Contract
Defined in `src/shared/rpc/audio-file.rpc.ts`.

| Method | Purpose |
|---|---|
| `readAudioFile` | Decode a file path or hash → return PCM + store in DB |
| `listSamples` | Proxy to StateService.listSamples |

### `readAudioFile` — input forms
- **Absolute path**: `/Users/foo/kick.wav` — decoded directly.
- **Relative path**: `kick.wav` — resolved against `state.getCwd()`.
- **Hash prefix**: `a3f2b1c0` (8+ hex chars, no path separators) — re-decoded from the original file path stored in DB.

## Files
```
src/electron/services/audio-file/
  index.ts        AudioFileService implementation
  AGENT.md        This file
src/shared/rpc/audio-file.rpc.ts
  AudioFileRpc    Contract type + ReadAudioFileResult shape
```

## Key Invariants
- **Never touches SQLite directly**: all persistence goes through `ServiceClient<StateRpc>`.
- **No UI dialogs**: the service does not call `dialog.showOpenDialog()`. That belongs in the renderer or the IPC bridge layer. If the input has no audio extension, a `BounceError("SAMPLE_READ_FAILED")` is thrown.
- **Idempotent on hash**: calling `readAudioFile` twice on the same file returns the same hash and re-stores the sample (StateService's store is idempotent).
- **Channel data**: only channel 0 is decoded (mono/left). Multichannel support is a future roadmap item.

## Testing
AudioFileService is tested via `tests/workflows/read-audio-file.workflow.ts`. Because it has no Electron-specific code of its own (only its transitive dependency on StateService does), it can be tested in a headless Electron process:

```ts
const stateService = new StateService(tmpDir);
const audioFileService = new AudioFileService(stateService.asClient());
const client = audioFileService.asClient();
const result = await client.invoke("readAudioFile", { filePathOrHash: "/tmp/test.wav" });
```

## Adding New Methods
1. Add the signature to `src/shared/rpc/audio-file.rpc.ts`.
2. Implement in `index.ts` — remember to only call `this.state.invoke(...)`, never import DatabaseManager.
3. Add workflow checks in `tests/workflows/`.
4. Update the IPC bridge (`src/electron/ipc/audio-handlers.ts`) to delegate to the new method.

## Common Failure Modes
- **`SAMPLE_READ_FAILED` with "Unsupported file format"**: input has an extension not in `AUDIO_EXTENSIONS`. Check `src/electron/audio-extensions.ts`.
- **`SAMPLE_NOT_FOUND` on hash lookup**: the hash was from a different project or a different DB. Hashes are project-scoped in SQLite.
- **`audio-decode` throws**: the file exists but is not a valid audio file, or is a format `audio-decode` does not support (e.g. MP3 in some environments).
