# Architecture

Bounce is an Electron desktop application with three OS-level processes that communicate over IPC. This document describes the process model, data flows, persistence layer, and native addon boundaries.

## Process Model

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           Electron Main Process                            │
│                                                                            │
│  Lifecycle · IPC Router · Database (SQLite) · Settings Store               │
│  Native analysis (flucoma_native) · Audio file decoding                    │
│  REPL Intelligence Layer · LanguageServiceManager                          │
│                                                                            │
│    ▲ ipcMain.handle / .on      ▲ MessagePort         ▲ MessagePort         │
│    │                           │                     │                     │
│    ▼                           ▼                     ▼                     │
│  ┌──────────────────┐  ┌───────────────────┐  ┌────────────────────────┐  │
│  │ Renderer Process │  │  Audio Engine     │  │  Language Service      │  │
│  │                  │  │  Utility Process  │  │  Utility Process       │  │
│  │  xterm.js REPL   │  │                   │  │                        │  │
│  │  Canvas overlays │  │  Native playback  │  │  TypeScript compiler   │  │
│  │  Bounce API / NS │  │  (audio_engine_   │  │  Virtual REPL project  │  │
│  │  Web Audio       │  │  native)          │  │  Type-aware completion │  │
│  │  Tab completion  │  │  Instrument mgmt  │  │  (language-service-    │  │
│  │  Ghost text      │  │  Playback telem.  │  │  process.ts)           │  │
│  └──────────────────┘  └───────────────────┘  └────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Renderer Process

**Entry point:** `src/renderer/main.ts` → `BounceApp.mount()`

Responsibilities:

- Terminal UI via xterm.js (input handling, display, history, tab completion)
- REPL evaluation — parses user input, auto-awaits promises, formats results
- Canvas-based visualization overlays (waveforms, onset markers, NMF heatmaps)
- Audio recording via Web Audio MediaRecorder API
- Namespace objects that translate user commands into IPC calls
- Tab completion via debounced `completion:request` IPC calls — renders ghost text only (no completion menu)

The renderer never touches the filesystem, database, or native audio engine directly. All such operations go through IPC to the main process. The renderer is also unaware of the language service — completion flows through main.

### Main Process

**Entry point:** `src/electron/main.ts`

Responsibilities:

- App lifecycle (window creation, quit handling)
- IPC router — organized into domain handler modules in `src/electron/ipc/`
- SQLite database management (better-sqlite3) with versioned migrations
- Settings persistence (JSON file)
- Audio file decoding (audio-decode)
- FluCoMa analysis via flucoma_native addon (onset detection, NMF, MFCC, spectral shape)
- Spawning and managing the audio engine utility process
- Relaying playback telemetry from utility process to renderer
- **REPL Intelligence Layer** — receives `CompletionContext` from the language service and dispatches to 6 completer types (identifier, property, file path, sample hash, options, typed value)
- **LanguageServiceManager** — spawns and supervises the language service utility process; implements crash-loop prevention (3 crashes in 60s → incremental restore → clean-slate → disabled)
- **Session persistence** — on startup, restores the language service session from command history; on project switch or history clear, resets the session

### Audio Engine Utility Process

**Entry point:** `src/utility/audio-engine-process.ts`

Spawned by the main process via `Electron.utilityProcess.fork()`. Communicates with main over a `MessagePort`.

Responsibilities:

- Real-time audio playback via audio_engine_native addon (built on miniaudio)
- Sample playback with loop support
- Polyphonic instrument voice allocation (note on/off, parameter control)
- Sending playback telemetry (position, ended, error) back to main

This process exists so that audio I/O never blocks the main or renderer processes.

### Language Service Utility Process

**Entry point:** `src/utility/language-service-process.ts`

Spawned by the main process via `Electron.utilityProcess.fork()`. Communicates with main over a `MessagePort`. Initializes lazily — the TypeScript language service (`ts.createLanguageService()`) is created on the first `langservice:parse` request; `langservice:ready` is sent once it is ready.

Responsibilities:

- Maintains a virtual TypeScript project representing the current REPL session
- Parses REPL input buffers and cursor positions to produce a structured `CompletionContext`
- Resolves variable types for type-aware completion (user-defined variables, return types of Bounce API calls)
- Appends evaluated commands to the virtual project as they are executed
- Reports health metrics (memory, parse latency, error count) to main

The language service is intentionally thin — no business logic, no database access. All filtering, visibility decisions, and result assembly happen in the main process intelligence layer.

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
| `history-handlers.ts` | History & logging | `save-command`, `get-command-history`, `clear-command-history`, `debug-log` |
| `repl-handlers.ts` | REPL persistence | `save-repl-env`, `get-repl-env`, `transpile-typescript` |
| `filesystem-handlers.ts` | Filesystem | `fs-ls`, `fs-cd`, `fs-pwd`, `fs-glob`, `fs-walk` |
| `corpus-handlers.ts` | Corpus analysis | `corpus-build`, `corpus-query`, `corpus-resynthesize` |
| `nmf-handlers.ts` | NMF commands | `analyze-nmf`, `visualize-nmf`, `sep`, `nx` |
| `mixer-handlers.ts` | Mixer state | `get-mixer-state`, `save-mixer-channel`, `save-mixer-master` |
| `midi-handlers.ts` | MIDI sequences | `save-midi-sequence`, `get-midi-sequence`, `list-midi-sequences`, `delete-midi-sequence` |
| `transport-handlers.ts` | Transport control | `transport-set-bpm`, `transport-start`, `transport-stop` |
| `error-handlers.ts` | Background errors | `get-background-errors`, `dismiss-background-error`, `dismiss-all-background-errors` |
| `completion-handlers.ts` | Tab completion | `completion:request` |

All handler modules receive a shared `HandlerDeps` interface providing access to `dbManager`, `settingsStore`, `corpusManager`, `languageServiceManager`, `getAudioEnginePort()`, and `getMainWindow()`. These deps use lazy getters — handler code must access them inside callbacks, not at registration time.

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

### MessagePort (main ↔ audio engine utility process)

Defined in `src/shared/audio-engine-protocol.ts`. The main process creates a `MessageChannelMain` and passes one port to the utility process. Messages are typed unions:

**Commands (main → utility):** `play`, `stop`, `stop-all`, `define-instrument`, `free-instrument`, `load-instrument-sample`, `instrument-note-on`, `instrument-note-off`, `instrument-stop-all`, `set-instrument-param`, `subscribe-instrument-telemetry`, `unsubscribe-instrument-telemetry`, `mixer-set-channel-gain`, `mixer-set-channel-pan`, `mixer-set-channel-mute`, `mixer-set-channel-solo`, `mixer-attach-instrument`, `mixer-detach-channel`, `mixer-set-master-gain`, `mixer-set-master-mute`

**Telemetry (utility → main):** `position`, `ended`, `error`, `mixer-levels`

The main process relays telemetry from the utility process to the renderer via `webContents.send()`.

### MessagePort (main ↔ language service utility process)

A separate `MessageChannelMain` connects the main process to the language service utility process. All messages are plain JSON objects. `LanguageServiceManager` (`src/electron/language-service-manager.ts`) owns this port.

**Main → Language Service:**

| Message type | Purpose |
|---|---|
| `langservice:parse` | Parse buffer + cursor position → CompletionContext |
| `langservice:session-append` | Add one evaluated command to the virtual session |
| `langservice:session-restore` | Bulk-replay command array on startup or after crash |
| `langservice:session-reset` | Clear virtual session (project switch or history clear) |
| `langservice:status` | Poll readiness before the service signals ready |

**Language Service → Main:**

| Message type | Purpose |
|---|---|
| `langservice:ready` | Service is initialized and ready to accept parse requests |
| `langservice:parse:response` | CompletionContext result for a previous parse request |
| `langservice:health` | Periodic health metrics (memory, parse latency, error count) |

**Tab completion flow:**

```
Renderer  ──completion:request──▶  Main (completion-handlers.ts)
                                     │
                                     ├── languageServiceManager.parse(buffer, cursor)
                                     │      └──langservice:parse──▶ Language Service
                                     │      └──langservice:parse:response──▶ Main
                                     │
                                     └── ReplIntelligence.predict(context)
                                            ├── IdentifierCompleter
                                            ├── PropertyCompleter
                                            ├── FilePathCompleter
                                            ├── SampleHashCompleter
                                            ├── OptionsCompleter
                                            └── TypedValueCompleter
                                     │
                                     └──PredictionResult[]──▶ Renderer (ghost text)
```

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
| `projects` | Named workspaces. Includes `session_start_timestamp` — Unix ms timestamp marking the start of the current language service session for this project. Updated on `clear-command-history` and `load-project`. |
| `samples` | Audio PCM data (BLOB) + metadata (hash, sample rate, channels, duration) |
| `features` | Cached analysis results (JSON). Unique per (project, sample_hash, feature_hash) |
| `samples_features` | Links derived samples back to source sample + feature |
| `command_history` | REPL command history for replay. Commands added after `session_start_timestamp` are replayed into the language service on startup. |
| `repl_env` | Persisted REPL variables and functions (JSON or function source) |
| `instruments` | Named instrument definitions with config |
| `instrument_samples` | MIDI note → sample mapping per instrument |
| `mixer_channels` | Per-project mixer channel state (gain, pan, mute, solo, attached instrument) |
| `mixer_master` | Per-project master bus state (gain, mute) |
| `midi_sequences` | Named MIDI sequences (duration, event count) |
| `midi_events` | Individual MIDI events (type, channel, note, velocity, CC) ordered by timestamp |
| `background_errors` | Non-fatal errors from main/utility processes for user visibility via `errors()` |

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

The Bounce API is built in `src/renderer/bounce-api.ts` and provides 11 namespaces plus globals, each defined in `src/renderer/namespaces/`:

| REPL name | Module | Purpose |
|---|---|---|
| `sn` | `sample-namespace.ts` | Sample loading, listing, audio device access, recording |
| `vis` | `vis-namespace.ts` | Visualization scene creation and rendering |
| `proj` | `project-namespace.ts` | Project management |
| `env` | `env-namespace.ts` | REPL scope inspection, persistence, dev-mode toggle |
| `corpus` | `corpus-namespace.ts` | Concatenative synthesis |
| `fs` | `fs-namespace.ts` | Filesystem navigation |
| `inst` | `instrument-namespace.ts` | Instrument creation, sample mapping, note events |
| `mx` | `mixer-namespace.ts` | 8-channel mixer: gain, pan, mute, solo, instrument routing |
| `midi` | `midi-namespace.ts` | MIDI input devices, sequence recording and playback |
| `transport` | `transport-namespace.ts` | BPM, start/stop, transport clock |
| `pat` | `pat-namespace.ts` | Pattern sequencing |
| *(globals)* | `globals.ts` | `help()`, `clear()`, `debug()`, `errors()` top-level utilities |

All namespace classes are decorated with `@namespace` (from `src/shared/repl-registry.ts`) which injects a `help()` method and registers descriptors used by the REPL Intelligence Layer for tab completion and help rendering.

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

## Application State Taxonomy

Bounce maintains several distinct layers of state with different persistence and restore semantics:

### Durable Project State (SQLite, persists across restarts)

| State | Table | Restored on |
|---|---|---|
| Audio samples (hash, metadata) | `samples`, `samples_*_metadata` | On demand (hash lookups) |
| Analysis features | `features`, `samples_features` | On demand |
| REPL variables and functions | `repl_env` | App startup (`get-repl-env`) |
| Command history | `command_history` | App startup (`get-command-history`) |
| Instruments and sample maps | `instruments`, `instrument_samples` | On demand |
| Mixer channel state | `mixer_channels`, `mixer_master` | App startup (mixer panel) |
| MIDI sequences | `midi_sequences`, `midi_events` | On demand |
| Background errors | `background_errors` | On demand (`errors()`) |

### Session State (SQLite + in-memory, bounded lifetime)

The **language service session** is the set of REPL commands executed since the last `session_start_timestamp`. It gives the TypeScript language service enough context to resolve variable types for completion.

- `projects.session_start_timestamp` — Unix ms timestamp stored in SQLite. Commands in `command_history` with `timestamp > session_start_timestamp` form the session source.
- Reset on: `clear-command-history` IPC, `load-project` IPC (project switch)
- Restored to language service on: app startup (after `langservice:ready`), after language service crash (via `LanguageServiceManager.restoreSession()`)

### Ephemeral REPL State (in-memory only, lost on restart)

- Active JavaScript scope variables (`ReplEvaluator.scopeVars`)
- Terminal screen contents and scroll position
- Command buffer and cursor position
- Tab completion candidates
- Visualization overlays (waveform canvases, playhead positions)
- Active playback handles

### Settings (JSON file, persists across restarts)

`<userData>/settings.json` stores:
- `cwd` — current working directory for filesystem operations
- `currentProjectName` — last active project name

## REPL Intelligence Layer

The intelligence layer provides type-aware tab completion by combining two components:

### Decorator Registration System

All REPL-exposed namespaces and porcelain result types are classes decorated with `@namespace` or `@replType` (from `src/shared/repl-registry.ts`). Every public method carries `@describe` and zero or more `@param` decorators:

```ts
@namespace("sn", { summary: "Sample namespace" })
class SampleNamespace {
  @describe({ summary: "Load an audio file.", returns: "SamplePromise" })
  @param("filePath", { summary: "Path to audio file.", kind: "filePath" })
  read(filePath: string): SamplePromise { ... }
}
```

At build time, `scripts/generate-repl-artifacts.ts` scans all decorated classes and emits:
- `src/shared/repl-registry.generated.ts` — flat registry of method metadata (summary, visibility, param kinds) imported by the intelligence layer
- `src/shared/repl-environment.d.ts` — TypeScript ambient declarations for the REPL global scope, imported by the language service virtual project

At runtime, the `@namespace`/`@replType` decorators also register `NamespaceDescriptor` / `TypeDescriptor` objects into an in-memory registry (`src/shared/repl-registration.ts`), used by the help system.

### Completer Dispatch

`ReplIntelligence` (`src/electron/repl-intelligence.ts`) receives a `CompletionContext` from the language service and dispatches to one of six completers:

| Completer | Triggered by | Produces |
|---|---|---|
| `IdentifierCompleter` | Identifier position | Namespace names, global names |
| `PropertyCompleter` | Property access (`.`) | Method names for a known type |
| `FilePathCompleter` | `@param kind: "filePath"` | Filesystem paths |
| `SampleHashCompleter` | `@param kind: "sampleHash"` | Sample hash prefixes from DB |
| `OptionsCompleter` | Object literal key position | Option object keys for a method |
| `TypedValueCompleter` | `@param kind: "typed"` | Session variables matching expected type |

Visibility is controlled by `devMode` (toggled via `env.dev(true/false)`): plumbing-visibility items are hidden by default and shown only when dev mode is on.

### Porcelain / Plumbing Visibility

Every method has a `visibility` field (default: `"porcelain"`). Plumbing methods are infrastructure-level operations not intended for casual users. Both levels require full `@describe`/`@param` documentation — visibility is a display filter, not a documentation gate.

```
env.dev()        → shows current mode
env.dev(true)    → enables dev mode (plumbing visible in help and completions)
env.dev(false)   → disables dev mode
```

## Configuration

### Settings Store

JSON file at `<userData>/settings.json`:

- `cwd` — current working directory for filesystem operations
- `currentProjectName` — last active project name

### Environment Variables

- `BOUNCE_USER_DATA_PATH` — override the default app data directory (useful for test isolation)
- `BOUNCE_NULL_AUDIO` — set to `1` to use miniaudio's null backend (no hardware audio device required); used in CI/Docker test environments

### Analysis Options

All analysis functions accept option objects with sensible defaults:

- `OnsetSliceOptions` — threshold, minSliceLength, filterSize, frameDelta, etc.
- `BufNMFOptions` — components, iterations, fftSize, hopSize, windowSize
- `MFCCOptions` — numCoeffs, numBands, freqRange, window parameters
- `GranularizeOptions` — grainSize, hopSize, jitter, timespan
