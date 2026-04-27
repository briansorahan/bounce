# Architecture

Bounce is an Electron desktop application. This document describes the process model, the
service-oriented architecture that is being built, the current transition state, the workflow
test infrastructure, and the native addon boundaries.

---

## Process Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Electron Main Process                             │
│                                                                             │
│  ProcessManagerService · EventBus · PersistenceService · QueryService       │
│  Services (AudioFile, Filesystem, Project, Instrument, Midi, Mixer, …)      │
│  IPC bridge layer (ipc/) · LanguageServiceManager · CorpusManager          │
│                                                                             │
│    ▲ ipcMain.handle / .on      ▲ MessagePort         ▲ MessagePort          │
│    │ (bridge layer)            │                     │                      │
│    ▼                           ▼                     ▼                      │
│  ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────────────┐ │
│  │ Renderer Process │  │  Audio Engine     │  │  Analysis Utility        │ │
│  │                  │  │  Utility Process  │  │  Process                 │ │
│  │  xterm.js REPL   │  │                   │  │                          │ │
│  │  Canvas overlays │  │  miniaudio        │  │  FluCoMa native addon    │ │
│  │  Bounce API / NS │  │  Instruments      │  │  CPU-intensive DSP       │ │
│  │  Tab completion  │  │  Mixer            │  │  (onset, NMF, MFCC…)     │ │
│  └──────────────────┘  └───────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

Three OS-level processes, always running:

- **Main process** — owns all services, the SQLite database, the event bus, and the IPC bridge
  to the renderer. CPU-intensive DSP is offloaded to the analysis utility process.
- **Renderer process** — hosts the xterm.js REPL and canvas visualizations. Calls the main
  process via the Electron IPC bridge. Never touches the filesystem, database, or native
  audio directly.
- **Audio engine utility process** — real-time audio playback via miniaudio. Communicates
  with main over a dedicated MessagePort.

One additional utility process spawned on demand:

- **Analysis utility process** — runs FluCoMa DSP algorithms (`flucoma_native` addon)
  synchronously without blocking the main process event loop.

---

## Service-Oriented Architecture

Bounce is being built around a graph of services. Each service has one clearly stated
responsibility, exposes its functionality over a typed JSON-RPC contract, and communicates
with other services only through those contracts or through the shared event bus.

### Services

Services live in `src/electron/services/{name}/`. Each service is a TypeScript class that:

- Implements a `*Handlers` interface generated from its RPC contract
- Accepts only typed service clients or the event bus as constructor dependencies
- Has zero Electron imports (no `ipcMain`, no `BrowserWindow`, no `utilityProcess`)
- Exposes a `listen(connection: MessageConnection)` method to bind to a JSON-RPC transport

Current services:

| Service | Location | Responsibility |
|---------|----------|----------------|
| `AudioFileService` | `services/audio-file/` | Decode audio files, compute hashes, emit `SampleLoaded` |
| `AnalysisService` | `services/analysis/` | FluCoMa DSP (onset, NMF, MFCC) via utility process |
| `FilesystemService` | `services/filesystem/` | Directory listing, cwd management, glob |
| `ProjectService` | `services/project/` | Project CRUD, current project tracking |
| `InstrumentService` | `services/instrument/` | Instrument and sample-map persistence |
| `MidiService` | `services/midi/` | MIDI sequence storage and retrieval |
| `MixerService` | `services/mixer/` | Mixer channel and master state |
| `ReplEnvService` | `services/repl-env/` | REPL variable and function persistence |
| `GrainsService` | `services/granularize/` | Granular synthesis parameters |
| `PersistenceService` | `services/persistence/` | Event bus subscriber → SQLite writes |
| `QueryService` | `services/query/` | All SQLite read operations |
| `ProcessManagerService` | `services/process-manager/` | Dependency graph, start/stop ordering |

### RPC Contracts

Each service's public API is defined in `src/shared/rpc/{name}.rpc.ts`. A contract file
contains:

- The `*Rpc` interface extending `RpcContract` — maps method names to `{ params, result }`
- `RequestType` objects (vscode-jsonrpc) — one per method
- The `*Handlers` interface — implemented by the service class
- `register*Handlers()` — binds a handlers implementation to a `MessageConnection`
- `create*Client()` — wraps a `MessageConnection` as a typed client

```typescript
// Usage pattern
const pair = createInProcessPair();
const service = new AudioFileService(bus, sampleQuery, cwdQuery);
service.listen(pair.server);
pair.server.listen();
pair.client.listen();
const client = createAudioFileClient(pair.client);
const result = await client.invoke("readAudioFile", { filePathOrHash: "kick.wav" });
```

### Event Bus

`EventBus` (`src/shared/event-bus.ts`) is a synchronous, in-process pub/sub channel for
domain events. Services emit events when state changes; `PersistenceService` subscribes and
writes them to SQLite in batched transactions.

Domain events:

| Event | Emitted by | Effect |
|-------|-----------|--------|
| `SampleLoaded` | `AudioFileService` | Persists sample + metadata to DB |
| `RecordingStored` | `AudioFileService` | Persists recording as sample |
| `CwdChanged` | `FilesystemService` | Updates settings store |
| `InstrumentCreated/Deleted` | `InstrumentService` | Persists instrument record |
| `InstrumentSampleAdded` | `InstrumentService` | Persists MIDI note mapping |
| `MidiSequenceSaved/Deleted` | `MidiService` | Persists MIDI sequence |
| `MixerChannelUpdated` | `MixerService` | Persists mixer channel state |
| `MixerMasterUpdated` | `MixerService` | Persists master bus state |
| `ReplEnvSaved` | `ReplEnvService` | Persists REPL variables |

`ProjectLoaded` and `ProjectRemoved` are emitted for notification only — `ProjectService`
writes those synchronously for strong consistency.

### Query Interfaces

Read operations use narrow per-domain query interfaces defined in
`src/shared/query-interfaces.ts`. Each service declares only the interface it needs:

```
ISampleQuery    getSampleByHash, listSamples, getRawMetadata, getSampleByRecordingName
ICwdQuery       getCwd
IProjectQuery   getCurrentProject, listProjects
IInstrumentQuery  getInstrument, listInstruments, getInstrumentSamples
IMidiQuery      getMidiSequence, listMidiSequences
IMixerQuery     getMixerState
IReplEnvQuery   getReplEnv
IQueryService   extends all of the above (full read access)
```

In production, `QueryService` implements `IQueryService` against SQLite.
In workflow tests, `InMemoryQueryService` implements it against `InMemoryStore`.

### ProcessManagerService

`ProcessManagerService` (`services/process-manager/`) owns the service dependency graph.
Services register a `ServiceDescriptor` declaring their name, dependencies, and
start/stop/isReady callbacks. The manager topologically sorts the graph (Kahn's algorithm)
and calls start/stop in the correct order.

**Future**: a compile-time code-generation script will parse each service's constructor
parameters using the TypeScript compiler API, extract `ServiceClient<SomeRpc>` dependencies,
and emit the registration calls automatically — eliminating the hand-maintained list.

---

## Transition State

The service-oriented architecture is **actively being built**. The old Electron IPC handler
layer (`src/electron/ipc/`) still exists and remains in production. The two layers coexist:

| Layer | Location | Status |
|-------|----------|--------|
| New service layer | `src/electron/services/` + `src/shared/rpc/` | Active development |
| Old IPC handler layer | `src/electron/ipc/` + `src/electron/preload.ts` | Legacy, being migrated |

**The renderer still uses the old pattern.** `preload.ts` exposes `ipcRenderer.invoke` calls
via `contextBridge`; the renderer calls `window.electron.*`. Migrating the renderer to talk
directly to services is a future architectural goal.

**When adding new features**: use the service pattern. Add a service in `src/electron/services/`,
define its RPC contract in `src/shared/rpc/`, and wire it through the existing IPC bridge
layer only as needed until the renderer is migrated. Do not add new handlers to the old
`ipc/` layer.

---

## In-Process Transport and Workflow Tests

### In-Process Transport

`createInProcessPair()` (`src/shared/rpc/connection.ts`) creates a paired
`(client, server) MessageConnection` backed by a Node `EventEmitter`. No I/O, no
serialization overhead, no Electron required. Used by workflow tests and by any code that
needs two services to communicate in the same process.

### Workflow Test Infrastructure

`tests/workflows/` contains vitest workflow tests. Each test file exercises a multi-service
scenario end-to-end at the JSON-RPC boundary.

**`tests/workflows/helpers.ts`** provides `bootServices()`, which instantiates all services
with in-process JSON-RPC pairs, in-memory storage, and a mock audio engine:

- `InMemoryStore` + `InMemoryPersistenceService` + `InMemoryQueryService` — mirrors the
  SQLite schema in Maps; no native deps
- `MockAudioEngineService` — pure TypeScript mock; no `audio_engine_native` addon
- All real service implementations connected via `createInProcessPair()`

`bootServices()` returns typed clients for every service and a `cleanup()` function.

```typescript
const { ctx, cleanup } = bootServices();
await ctx.audioFileClient.invoke("readAudioFile", { filePathOrHash: "/tmp/test.wav" });
cleanup();
```

**When a spec adds a new service**, it must be wired into `bootServices()` in `helpers.ts`
and given a corresponding mock or real implementation that works without native deps.

---

## IPC Bridge Layer (Legacy)

The IPC bridge in `src/electron/ipc/` connects the renderer to main process services via
Electron's `ipcMain.handle` / `ipcMain.on`. Handlers in this layer are being progressively
refactored to delegate to services rather than accessing the database directly.

The bridge receives a `HandlerDeps` object providing access to `DatabaseManager`,
`SettingsStore`, `CorpusManager`, `LanguageServiceManager`, and ports to the audio engine and
main window. New handler code should call service clients rather than `DatabaseManager`
directly.

---

## Audio Engine Utility Process

**Entry point:** `src/utility/audio-engine-process.ts`

Spawned by the main process via `utilityProcess.fork()`. Communicates with main over a
`MessagePort`.

Responsibilities:
- Real-time audio playback via `audio_engine_native` (miniaudio)
- Polyphonic instrument voice management (note on/off, sample mapping)
- Mixer: 9 channels (0–7 user, 8 preview), constant-power pan, solo-in-place
- Playback telemetry (position, ended, error) and mixer peak levels (~60 Hz) back to main

The main process relays telemetry to the renderer via `webContents.send()`.

RPC contract: `src/shared/rpc/audio-engine.rpc.ts`.
Mock for tests: `tests/workflows/mock-audio-engine.ts`.

---

## Analysis Utility Process

**Entry point:** `src/electron/services/analysis/process.ts`

Spawned by `AnalysisService` (`services/analysis/index.ts`) via `utilityProcess.fork()`.
Communicates with the main process over a `MessagePort` using a simple
`{ id, method, params }` / `{ id, result | error }` protocol.

Purpose: run FluCoMa DSP algorithms (`flucoma_native`) synchronously without blocking the
main process event loop. Handles one request at a time (the Promise-based supervisor
serialises requests automatically).

RPC contract: `src/shared/rpc/analysis.rpc.ts`.
For workflow tests, `AnalysisService` (`services/analysis/service.ts`) provides a
`vscode-jsonrpc`-compatible variant that does not spawn a utility process.

---

## Language Service Utility Process

**Entry point:** `src/utility/language-service-process.ts`

Spawned by `LanguageServiceManager` (`src/electron/language-service-manager.ts`).
Communicates with main over a `MessagePort`. Initializes lazily on the first parse request.

Responsibilities:
- Maintains a virtual TypeScript project representing the current REPL session
- Parses REPL input + cursor position → `CompletionContext`
- Resolves variable types for type-aware completion
- Reports health metrics (memory, parse latency, error count)

`LanguageServiceManager` implements crash-loop prevention: 3 crashes in 60 s → incremental
restore → clean-slate → disabled.

---

## REPL Intelligence Layer

The intelligence layer provides type-aware tab completion by combining two components:

### Decorator Registration System

All REPL-exposed namespaces and result types use decorators from `src/shared/repl-registry.ts`:

```typescript
@namespace("sn", { summary: "Sample namespace" })
class SampleNamespace {
  @describe({ summary: "Load an audio file.", returns: "SamplePromise" })
  @param("filePath", { summary: "Path to audio file.", kind: "filePath" })
  read(filePath: string): SamplePromise { ... }
}
```

At build time, `scripts/generate-repl-artifacts.ts` emits:
- `src/shared/repl-registry.generated.ts` — flat registry of method metadata
- `src/shared/repl-environment.d.ts` — ambient TypeScript declarations for the REPL scope

### Completer Dispatch

`ReplIntelligence` (`src/electron/repl-intelligence.ts`) receives a `CompletionContext` and
dispatches to one of six completers:

| Completer | Triggered by | Produces |
|-----------|-------------|---------|
| `IdentifierCompleter` | Identifier position | Namespace and global names |
| `PropertyCompleter` | Property access (`.`) | Method names for a known type |
| `FilePathCompleter` | `@param kind: "filePath"` | Filesystem paths |
| `SampleHashCompleter` | `@param kind: "sampleHash"` | Hash prefixes from DB |
| `OptionsCompleter` | Object literal key | Option keys for a method |
| `TypedValueCompleter` | `@param kind: "typed"` | Session variables of matching type |

---

## Native Addons

Two C++ native addons built via node-gyp (`binding.gyp`). Source in `native/`.

### `flucoma_native`

Loaded by the analysis utility process. FluCoMa audio analysis algorithms (all header-only
from `third_party/flucoma-core/`):

| Export | Algorithm |
|--------|-----------|
| `onsetSlice` | Onset detection |
| `ampSlice` | Amplitude-based slicing |
| `noveltySlice` | Novelty-based slicing |
| `transientSlice` | Transient-based slicing |
| `bufNMF` | Non-negative Matrix Factorization |
| `mfcc` | Mel-frequency cepstral coefficients |
| `spectralShape` | Centroid, spread, skewness, kurtosis, rolloff, flatness, crest |
| `normalize` | Feature normalization |
| `kdTree` | K-dimensional tree for nearest-neighbor queries |

Dependencies: FluCoMa core, Eigen, HISSTools FFT, Accelerate (macOS) / BLAS (Linux).

### `audio_engine_native`

Loaded by the audio engine utility process only.

| Export | Purpose |
|--------|---------|
| `play` / `stop` / `stopAll` | Sample playback |
| `defineInstrument` / `freeInstrument` | Polyphonic instrument allocation |
| `loadInstrumentSample` | MIDI note → sample buffer mapping |
| `instrumentNoteOn/Off/StopAll` | Voice triggering |
| `setInstrumentParam` | Instrument parameter control |
| `mixer*` | Gain, pan, mute, solo, routing |
| `onMixerLevels` | Peak meter callback (~60 Hz) |

Dependencies: miniaudio, AudioToolbox/CoreAudio (macOS), ALSA (Linux).

---

## Database

SQLite via better-sqlite3. Stored in the platform app data directory; overridable with
`BOUNCE_USER_DATA_PATH` (used for test isolation).

All data tables are project-scoped (foreign key to `projects.id` with CASCADE delete).

| Table | Purpose |
|-------|---------|
| `schema_versions` | Migration tracking |
| `projects` | Named workspaces with `session_start_timestamp` |
| `samples` | Audio PCM (BLOB) + metadata (hash, sample rate, channels, duration) |
| `raw_sample_metadata` | Original file path per hash |
| `features` | Cached analysis results (JSON), unique per (project, sample_hash, feature_hash) |
| `samples_features` | Links derived samples back to source sample + feature |
| `command_history` | REPL command history for language service session restore |
| `repl_env` | Persisted REPL variables and functions |
| `instruments` | Named instrument definitions |
| `instrument_samples` | MIDI note → sample mapping per instrument |
| `mixer_channels` | Per-project mixer channel state |
| `mixer_master` | Per-project master bus state |
| `midi_sequences` | Named MIDI sequences |
| `midi_events` | Individual MIDI events ordered by timestamp |
| `background_errors` | Non-fatal errors for user visibility via `errors()` |

Schema changes require a versioned migration. See `.github/skills/add-database-migration/SKILL.md`.

---

## Renderer Architecture

### REPL

`BounceApp` (`src/renderer/app.ts`) manages the terminal:

- xterm.js input handling, history navigation, reverse search (Ctrl+R)
- `ReplEvaluator` auto-awaits top-level expressions and assignments
- Tab completion via debounced `completion:request` IPC — renders ghost text only
- Canvas-based visualization overlays (waveforms, onset markers, NMF heatmaps)

### Namespaces

The Bounce API (`src/renderer/bounce-api.ts`) exposes 11 namespaces via `@namespace`
decorators, each in `src/renderer/namespaces/`:

| REPL name | Module | Purpose |
|-----------|--------|---------|
| `sn` | `sample-namespace.ts` | Sample loading, listing, recording |
| `vis` | `vis-namespace.ts` | Visualization scenes |
| `proj` | `project-namespace.ts` | Project management |
| `env` | `env-namespace.ts` | REPL scope, dev mode |
| `corpus` | `corpus-namespace.ts` | Concatenative synthesis |
| `fs` | `fs-namespace.ts` | Filesystem navigation |
| `inst` | `instrument-namespace.ts` | Instruments, note events |
| `mx` | `mixer-namespace.ts` | Mixer channels |
| `midi` | `midi-namespace.ts` | MIDI input, sequences |
| `transport` | `transport-namespace.ts` | BPM, start/stop |
| `pat` | `pat-namespace.ts` | Pattern sequencing |
| *(globals)* | `globals.ts` | `help()`, `clear()`, `debug()`, `errors()` |

### Result Types

Custom result objects in `src/renderer/results/` extend `BounceResult`. Thenable wrappers
(`SamplePromise`, `OnsetFeaturePromise`, etc.) enable chaining without explicit `await`.
Each type prints a concise terminal summary emphasizing workflow-relevant properties.

---

## Application State

| Layer | Storage | Restored on |
|-------|---------|-------------|
| Audio samples + metadata | SQLite | On demand |
| Analysis features | SQLite | On demand |
| REPL variables and functions | SQLite (`repl_env`) | App startup |
| Command history | SQLite | App startup (language service replay) |
| Instruments + sample maps | SQLite | On demand |
| Mixer state | SQLite | App startup |
| MIDI sequences | SQLite | On demand |
| Language service session | In-memory (rebuilt from history) | After `langservice:ready` |
| Active REPL scope variables | In-memory | Lost on restart |
| Terminal screen / visualizations | In-memory | Lost on restart |
| CWD + current project name | `settings.json` | App startup |

---

## Configuration

**Settings file:** `<userData>/settings.json` — `cwd` and `currentProjectName`.

**Environment variables:**
- `BOUNCE_USER_DATA_PATH` — override app data directory (test isolation)
- `BOUNCE_NULL_AUDIO` — set to `1` for miniaudio null backend (CI/Docker)
