# Architecture

Bounce is an Electron desktop application with three OS-level processes that communicate over IPC. This document describes the process model, data flows, persistence layer, and native addon boundaries.

## Process Model

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                     │
│                                                                  │
│  Lifecycle · IPC Router · Database (SQLite) · Settings Store     │
│  Native analysis (flucoma_native) · Audio file decoding          │
│                                                                  │
│         ▲ ipcMain.handle / .on          ▲ MessagePort            │
│         │                               │                        │
│         ▼                               ▼                        │
│  ┌─────────────────────┐   ┌───────────────────────────────┐     │
│  │   Renderer Process  │   │  Audio Engine Utility Process │     │
│  │                     │   │                               │     │
│  │  xterm.js REPL      │   │  Native playback              │     │
│  │  Canvas overlays    │   │  (audio_engine_native)        │     │
│  │  Bounce API / NS    │   │  Instrument voice mgmt        │     │
│  │  Web Audio (record) │   │  Playback telemetry           │     │
│  └─────────────────────┘   └───────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### Renderer Process

**Entry point:** `src/renderer/main.ts` → `BounceApp.mount()`

Responsibilities:

- Terminal UI via xterm.js (input handling, display, history, tab completion)
- REPL evaluation — parses user input, auto-awaits promises, formats results
- Canvas-based visualization overlays (waveforms, onset markers, NMF heatmaps)
- Audio recording via Web Audio MediaRecorder API
- Namespace objects (`sn`, `vis`, `proj`, `env`, `corpus`, `fs`, `inst`) that translate user commands into IPC calls

The renderer never touches the filesystem, database, or native audio engine directly. All such operations go through IPC to the main process.

### Main Process

**Entry point:** `src/electron/main.ts`

Responsibilities:

- App lifecycle (window creation, quit handling)
- IPC router — ~60 channels organized into domain handler modules in `src/electron/ipc/`
- SQLite database management (better-sqlite3) with versioned migrations
- Settings persistence (JSON file)
- Audio file decoding (audio-decode)
- FluCoMa analysis via flucoma_native addon (onset detection, NMF, MFCC, spectral shape)
- Spawning and managing the audio engine utility process
- Relaying playback telemetry from utility process to renderer

### Audio Engine Utility Process

**Entry point:** `src/utility/audio-engine-process.ts`

Spawned by the main process via `Electron.utilityProcess.fork()`. Communicates with main over a `MessagePort`.

Responsibilities:

- Real-time audio playback via audio_engine_native addon (built on miniaudio)
- Sample playback with loop support
- Polyphonic instrument voice allocation (note on/off, parameter control)
- Sending playback telemetry (position, ended, error) back to main

This process exists so that audio I/O never blocks the main or renderer processes.

## IPC Communication

Three IPC patterns are used, each defined in `src/shared/ipc-contract.ts`:

### Invoke / Handle (request-response)

Used for operations that return data. The renderer calls `window.electron.<method>()` (exposed via preload script and `contextBridge`), which maps to `ipcRenderer.invoke(channel, ...args)`. The main process handles with `ipcMain.handle(channel, handler)`.

Domains and their handler modules (`src/electron/ipc/`):

| Handler file | Domain | Key channels |
|---|---|---|
| `audio-handlers.ts` | Audio file I/O | `read-audio-file` |
| `analysis-handlers.ts` | DSP analysis | `analyze-onset-slice`, `analyze-buf-nmf`, `analyze-mfcc` |
| `feature-handlers.ts` | Feature storage | `store-feature`, `get-most-recent-feature`, `create-slice-samples` |
| `sample-handlers.ts` | Sample management | `list-samples`, `get-sample-by-hash`, `store-recording`, `granularize-sample` |
| `project-handlers.ts` | Projects | `get-current-project`, `list-projects`, `load-project`, `remove-project` |
| `history-handlers.ts` | History & logging | `save-command`, `get-command-history`, `debug-log` |
| `repl-handlers.ts` | REPL persistence | `save-repl-env`, `get-repl-env`, `transpile-typescript` |
| `filesystem-handlers.ts` | Filesystem | `fs-ls`, `fs-cd`, `fs-pwd`, `fs-glob`, `fs-walk` |
| `corpus-handlers.ts` | Corpus analysis | `corpus-build`, `corpus-query`, `corpus-resynthesize` |
| `nmf-handlers.ts` | NMF commands | `analyze-nmf`, `visualize-nmf`, `sep`, `nx` |

All handler modules receive a shared `HandlerDeps` interface providing access to `dbManager`, `settingsStore`, `corpusManager`, `getAudioEnginePort()`, and `getMainWindow()`. These deps use lazy getters — handler code must access them inside callbacks, not at registration time.

### Send / On (fire-and-forget, renderer → main)

Used for commands where the renderer does not need a response, primarily playback, instrument, and mixer control:

- `play-sample`, `stop-sample`
- `define-instrument`, `free-instrument`, `load-instrument-sample`
- `instrument-note-on`, `instrument-note-off`, `instrument-stop-all`
- `set-instrument-param`, `subscribe-instrument-telemetry`
- `mixer-set-channel-gain`, `mixer-set-channel-pan`, `mixer-set-channel-mute`, `mixer-set-channel-solo`
- `mixer-attach-instrument`, `mixer-detach-channel`
- `mixer-set-master-gain`, `mixer-set-master-mute`

The main process receives these and forwards the relevant commands to the audio engine utility process via `MessagePort.postMessage()`. Mixer commands are also persisted to the DB via `mixer_channels` / `mixer_master` tables.

### Push Events (main → renderer)

The main process pushes telemetry events to the renderer via `webContents.send()`:

- `playback-position` — current playback position (samples), used for animated playheads
- `playback-ended` — playback completed
- `playback-error` — audio engine error
- `overlay-nmf-visualization` — NMF analysis results for visualization
- `mixer-levels` — per-channel and master peak levels (~60 Hz), used for status bar meters

### MessagePort (main ↔ utility process)

Defined in `src/shared/audio-engine-protocol.ts`. The main process creates a `MessageChannelMain` and passes one port to the utility process. Messages are typed unions:

**Commands (main → utility):** `play`, `stop`, `stop-all`, `define-instrument`, `free-instrument`, `load-instrument-sample`, `instrument-note-on`, `instrument-note-off`, `instrument-stop-all`, `set-instrument-param`, `subscribe-instrument-telemetry`, `unsubscribe-instrument-telemetry`, `mixer-set-channel-gain`, `mixer-set-channel-pan`, `mixer-set-channel-mute`, `mixer-set-channel-solo`, `mixer-attach-instrument`, `mixer-detach-channel`, `mixer-set-master-gain`, `mixer-set-master-mute`

**Telemetry (utility → main):** `position`, `ended`, `error`, `mixer-levels`

The main process relays telemetry from the utility process to the renderer via `webContents.send()`.

## Data Flows

### Loading a Sample

```
User: sn.read("kick.wav")
  → Renderer: sn.read() calls window.electron.readAudioFile("kick.wav")
    → Main: audio-handlers decodes file with audio-decode
    → Main: computes SHA-256 hash of audio data
    → Main: stores in SQLite (samples table, project-scoped)
    → Main: returns { hash, sampleRate, channels, duration, audioData }
  → Renderer: wraps result in Sample object with play(), onsets(), etc.
  → REPL: displays sample summary (duration, channels, sample rate)
```

### Playing Audio

```
User: sample.play()
  → Renderer: calls window.electron.playSample(hash, loop, ...)
    → Main: receives on ipcMain.on("play-sample")
    → Main: loads PCM from database, converts to Float32Array
    → Main: posts { type: "play", pcm, sampleRate, ... } to AudioEnginePort
      → Utility: audio_engine_native.play() starts miniaudio playback
      → Utility: posts { type: "position", positionInSamples } at regular intervals
    → Main: relays position to renderer via webContents.send("playback-position")
  → Renderer: updates animated playhead on waveform canvas
      → Utility: posts { type: "ended" } when playback completes
    → Main: relays to renderer via webContents.send("playback-ended")
  → Renderer: removes playhead, cleans up playback state
```

### Running an Analysis (Onsets)

```
User: sample.onsets()
  → Renderer: calls window.electron.analyzeOnsetSlice(audioData, options)
    → Main: analysis-handlers calls flucoma_native.onsetSlice(audioData, options)
    → Main: returns array of onset frame positions
  → Renderer: computes feature hash, calls window.electron.storeFeature(...)
    → Main: persists to features table in SQLite
  → Renderer: wraps in OnsetFeature object with slice(), play(), etc.
  → REPL: displays onset count and feature summary
```

### Recording Audio

```
User: sn.dev(0).record("take1")
  → Renderer: uses Web Audio getUserMedia + MediaRecorder
  → Renderer: collects audio chunks into Blob
  → User: recording.stop()
  → Renderer: decodes Blob with audio-decode
  → Renderer: calls window.electron.storeRecording(name, audioData, ...)
    → Main: computes hash, stores in samples table
  → Renderer: wraps result as Sample object
```

### Instrument Playback

```
User: inst.new("keys", 8)
  → Renderer: calls window.electron.createDbInstrument("keys", "sampler", ...)
    → Main: persists to instruments table
  → Renderer: calls window.electron.defineInstrument(id, "sampler", 8)
    → Main: posts { type: "define-instrument" } to AudioEnginePort
      → Utility: allocates instrument with 8-voice polyphony

User: keys.loadSample(60, sample)
  → Renderer: calls window.electron.addDbInstrumentSample(...)
    → Main: persists to instrument_samples table
  → Renderer: calls window.electron.loadInstrumentSample(id, 60, hash, ...)
    → Main: loads PCM from database
    → Main: posts { type: "load-instrument-sample", pcm, ... } to AudioEnginePort
      → Utility: stores sample buffer for note 60

User: keys.noteOn(60, 100)
  → Renderer: calls window.electron.instrumentNoteOn(id, 60, 100)
    → Main: posts { type: "instrument-note-on" } to AudioEnginePort
      → Utility: audio_engine_native allocates voice, starts playback
```

## Database

SQLite via better-sqlite3, stored in the platform's app data directory. Location overridable with the `BOUNCE_USER_DATA_PATH` environment variable.

### Schema

All data tables are project-scoped (foreign key to `projects.id` with CASCADE delete).

| Table | Purpose |
|---|---|
| `schema_versions` | Migration tracking |
| `projects` | Named workspaces |
| `samples` | Audio PCM data (BLOB) + metadata (hash, sample rate, channels, duration) |
| `features` | Cached analysis results (JSON). Unique per (project, sample_hash, feature_hash) |
| `samples_features` | Links derived samples back to source sample + feature |
| `command_history` | REPL command history for replay |
| `repl_env` | Persisted REPL variables and functions (JSON or function source) |
| `instruments` | Named instrument definitions with config |
| `instrument_samples` | MIDI note → sample mapping per instrument |
| `mixer_channels` | Per-project mixer channel state (gain, pan, mute, solo, attached instrument) |
| `mixer_master` | Per-project master bus state (gain, mute) |

### Migrations

One versioned migration in `src/electron/database.ts` creates all tables, tracked by the `schema_versions` table. See `src/electron/database.ts` for full DDL.

Adding new migrations should follow the guide in `.github/skills/add-database-migration/SKILL.md`.

## Native Addons

Two native C++ addons are built via node-gyp (configured in `binding.gyp`). Source lives in `native/`.

### flucoma_native

Audio analysis algorithms from the FluCoMa toolkit. Loaded by the main process.

| Export | Algorithm |
|---|---|
| `onsetSlice` | Onset detection (frame positions) |
| `bufNMF` | Non-negative Matrix Factorization (source separation) |
| `mfcc` | Mel-frequency cepstral coefficients |
| `spectralShape` | Spectral shape descriptors |
| `normalize` | Feature normalization |
| `kdTree` | K-dimensional tree for nearest-neighbor corpus queries |

Dependencies: FluCoMa core, Eigen, HISSTools FFT, Accelerate (macOS).

### audio_engine_native

Real-time audio playback engine. Loaded by the utility process only.

| Export | Purpose |
|---|---|
| `play` | Start sample playback (with optional loop region) |
| `stop` | Stop playback of a specific sample |
| `stopAll` | Stop all active playback |
| `defineInstrument` | Create polyphonic instrument with voice count |
| `freeInstrument` | Destroy instrument and free voices |
| `loadInstrumentSample` | Map sample buffer to MIDI note |
| `instrumentNoteOn` | Trigger note with velocity |
| `instrumentNoteOff` | Release note |
| `instrumentStopAll` | Silence all voices on instrument |
| `setInstrumentParam` | Set instrument parameter |
| `mixerSetChannelGain` | Set channel gain (dB) |
| `mixerSetChannelPan` | Set channel pan (-1.0 L to +1.0 R, constant-power) |
| `mixerSetChannelMute` | Mute/unmute channel |
| `mixerSetChannelSolo` | Solo/unsolo channel (solo-in-place) |
| `mixerAttachInstrument` | Route instrument to a mixer channel |
| `mixerDetachChannel` | Remove instrument assignment from channel |
| `mixerSetMasterGain` | Set master bus gain (dB) |
| `mixerSetMasterMute` | Mute/unmute master bus |
| `onMixerLevels` | Register peak meter callback (~60 Hz, with peak-hold) |

**Mixer architecture:** 9 channels total (indices 0–7 = user channels, index 8 = preview). Unattached instruments and legacy processors render into the preview channel. User channels mix to the master bus with constant-power pan law. Solo-in-place silences non-soloed user channels; preview channel is always exempt.

Dependencies: miniaudio, AudioToolbox/CoreAudio (macOS).

## Renderer Architecture

### REPL

`BounceApp` (in `src/renderer/app.ts`) manages the terminal UI:

- Input buffer with cursor movement, history navigation, reverse search (Ctrl+R)
- Tab completion with nested property support
- Command parsing for built-in commands (help, clear, etc.)
- `ReplEvaluator` (in `src/renderer/repl-evaluator.ts`) that auto-awaits top-level expressions and assignments so users don't need explicit `await`

### Namespaces

The Bounce API is built in `src/renderer/bounce-api.ts` and provides 8 namespaces plus globals, each defined in `src/renderer/namespaces/`:

| REPL name | Module | Purpose |
|---|---|---|
| `sn` | `sample-namespace.ts` | Sample loading, listing, audio device access, recording |
| `vis` | `vis-namespace.ts` | Visualization scene creation and rendering |
| `proj` | `project-namespace.ts` | Project management |
| `env` | `env-namespace.ts` | REPL scope inspection and persistence |
| `corpus` | `corpus-namespace.ts` | Concatenative synthesis |
| `fs` | `fs-namespace.ts` | Filesystem navigation |
| `inst` | `instrument-namespace.ts` | Instrument creation, sample mapping, note events |
| `mx` | `mixer-namespace.ts` | 8-channel mixer: gain, pan, mute, solo, instrument routing |
| *(globals)* | `globals.ts` | `help()`, `clear()`, and other top-level utilities |

### Visualization

Canvas-based overlays rendered on top of the xterm.js terminal:

- `VisualizationSceneManager` manages stacked scenes
- Waveform rendering with animated playheads (per-sample tracking for concurrent playback)
- Onset slice markers overlaid on waveforms
- NMF component heatmaps

### Result Types

Custom result objects in `src/renderer/results/` and `src/renderer/bounce-result.ts`:

- All extend `BounceResult` for consistent terminal display formatting
- Thenable wrappers (`SamplePromise`, `OnsetFeaturePromise`, etc.) enable chaining without `await` in the REPL
- Each result type prints a concise summary emphasizing workflow-relevant properties

## Configuration

### Settings Store

JSON file at `<userData>/settings.json`:

- `cwd` — current working directory for filesystem operations
- `currentProjectName` — last active project name

### Environment Variables

- `BOUNCE_USER_DATA_PATH` — override the default app data directory (useful for test isolation)

### Analysis Options

All analysis functions accept option objects with sensible defaults:

- `OnsetSliceOptions` — threshold, minSliceLength, filterSize, frameDelta, etc.
- `BufNMFOptions` — components, iterations, fftSize, hopSize, windowSize
- `MFCCOptions` — numCoeffs, numBands, freqRange, window parameters
- `GranularizeOptions` — grainSize, hopSize, jitter, timespan
