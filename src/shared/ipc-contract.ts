// ---------------------------------------------------------------------------
// MIDI types
// ---------------------------------------------------------------------------

export interface MidiInputDevice {
  index: number;
  name: string;
}

export interface MidiEvent {
  timestampMs: number;
  type: "note_on" | "note_off" | "cc";
  channel: number;
  note?: number;      // 0-127 for note events
  velocity?: number;  // 0.0-1.0 for note_on/note_off
  ccNumber?: number;  // 0-127 for cc
  ccValue?: number;   // 0.0-1.0 for cc
}

export interface MidiSequenceRecord {
  id: number;
  name: string;
  project_id: number;
  duration_ms: number;
  event_count: number;
  created_at: string;
}

export interface MidiFileParseResult {
  events: MidiEvent[];
  durationMs: number;
  smfType: number;
}

// ---------------------------------------------------------------------------
// Analysis option types (mirrors src/electron/ipc-types.ts)
// ---------------------------------------------------------------------------

export interface OnsetSliceOptions {
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  frameDelta?: number;
  metric?: number;
}

export interface BufNMFOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  seed?: number;
}

export interface MFCCOptions {
  numCoeffs?: number;
  numBands?: number;
  minFreq?: number;
  maxFreq?: number;
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
  sampleRate?: number;
}

export interface NMFVisualizationData {
  sampleHash: string;
  nmfData: {
    components: number;
    basis: number[][];
    activations: number[][];
  };
  featureHash: string;
}

// ---------------------------------------------------------------------------
// Database record types (mirrors src/electron/database.ts)
// ---------------------------------------------------------------------------

export interface ProjectObject {
  id: number;
  name: string;
  created_at: string;
  sample_count: number;
  feature_count: number;
  command_count: number;
  current: boolean;
}

export interface ReplEnvRecord {
  project_id: number;
  name: string;
  kind: "json" | "function";
  value: string;
  created_at: string;
}

export interface DebugLogEntry {
  id: number;
  level: string;
  message: string;
  data: string | null;
  timestamp: number;
  created_at: string;
}

export interface FeatureRecord {
  id: number;
  sample_hash: string;
  feature_hash: string;
  feature_type: string;
  feature_data: string;
  options: string | null;
}

export interface SampleRecord {
  id: number;
  hash: string;
  sample_type: string;
  sample_rate: number;
  channels: number;
  duration: number;
}

export interface SampleListRecord {
  id: number;
  hash: string;
  sample_type: string;
  sample_rate: number;
  channels: number;
  duration: number;
  display_name: string | null;
  created_at: string;
}

export interface FeatureListRecord {
  sample_hash: string;
  feature_type: string;
  display_name: string | null;
  options: string | null;
  feature_count: number;
  feature_hash: string;
}

export interface SampleFeatureLink {
  sample_hash: string;
  source_hash: string;
  feature_hash: string;
  index_order: number;
}

export interface DerivedSampleSummary {
  source_hash: string;
  source_display_name: string | null;
  feature_hash: string;
  feature_type: string;
  derived_count: number;
}

export interface FeatureOptions {
  threshold?: number;
  [key: string]: unknown;
}

export interface GranularizeOptions {
  grainSize?: number;
  hopSize?: number;
  jitter?: number;
  startTime?: number;
  endTime?: number;
  normalize?: boolean;
  silenceThreshold?: number;
}

export interface InstrumentRecord {
  id: number;
  project_id: number;
  name: string;
  kind: string;
  config_json: string | null;
  created_at: string;
}

export interface InstrumentSampleRecord {
  instrument_id: number;
  sample_hash: string;
  note_number: number;
}

export interface BackgroundErrorRecord {
  id: number;
  source: string;
  code: string;
  message: string;
  dismissed: number;
  created_at: string;
}

export interface MixerChannelState {
  channel_idx: number;
  gain_db: number;
  pan: number;
  mute: number;
  solo: number;
  instrument_name: string | null;
}

export interface MixerMasterState {
  gain_db: number;
  mute: number;
}

export interface MixerStateResponse {
  channels: MixerChannelState[];
  master: MixerMasterState | null;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ReadAudioFileResult {
  channelData: number[];
  sampleRate: number;
  duration: number;
  hash: string;
  filePath: string | null;
}

export interface BufNMFResult {
  components: number;
  iterations: number;
  converged: boolean;
  bases: number[][];
  activations: number[][];
}

export interface GranularizeResult {
  grainHashes: Array<string | null>;
  featureHash: string;
  sampleRate: number;
  grainDuration: number;
}

export interface RemoveProjectResult {
  removedName: string;
  currentProject: ProjectObject;
}

export type StoreRecordingResult =
  | { status: "exists" }
  | {
      status: "ok";
      hash: string;
      id: number | undefined;
      sampleRate: number;
      channels: number;
      duration: number;
      filePath: string;
    };

export interface SampleByNameResult {
  id: number;
  hash: string;
  sample_type: string;
  sample_rate: number;
  channels: number;
  duration: number;
  display_name: string | null;
}

// ---------------------------------------------------------------------------
// Filesystem types (mirrors types in src/electron/main.ts)
// ---------------------------------------------------------------------------

export type FileType =
  | "file"
  | "directory"
  | "symlink"
  | "blockDevice"
  | "charDevice"
  | "fifo"
  | "socket"
  | "unknown";

export interface FsEntry {
  name: string;
  path: string;
  type: FileType;
  isAudio: boolean;
}

export interface WalkEntry {
  path: string;
  type: FileType;
}

export interface FsLsResult {
  entries: FsEntry[];
  total: number;
  truncated: boolean;
}

export interface FsWalkResult {
  entries: WalkEntry[];
  truncated: boolean;
}

export type FsCompletionMethod = "ls" | "la" | "cd" | "walk" | "read";

export interface SampleHashCompletion {
  hash: string;
  filePath: string | null;
}

// ---------------------------------------------------------------------------
// Channel name constants
// ---------------------------------------------------------------------------

export const IpcChannel = {
  // Audio
  ReadAudioFile: "read-audio-file",
  AnalyzeOnsetSlice: "analyze-onset-slice",
  AnalyzeBufNMF: "analyze-buf-nmf",
  AnalyzeMFCC: "analyze-mfcc",

  // Projects
  GetCurrentProject: "get-current-project",
  ListProjects: "list-projects",
  LoadProject: "load-project",
  RemoveProject: "remove-project",

  // Command history
  SaveCommand: "save-command",
  GetCommandHistory: "get-command-history",
  ClearCommandHistory: "clear-command-history",
  DedupeCommandHistory: "dedupe-command-history",

  // REPL environment
  SaveReplEnv: "save-repl-env",
  GetReplEnv: "get-repl-env",

  // Debug logging
  DebugLog: "debug-log",
  GetDebugLogs: "get-debug-logs",
  ClearDebugLogs: "clear-debug-logs",

  // Sample completion
  CompleteSampleHash: "complete-sample-hash",

  // Features & samples
  StoreFeature: "store-feature",
  GetMostRecentFeature: "get-most-recent-feature",
  CreateSliceSamples: "create-slice-samples",
  GetDerivedSamples: "get-derived-samples",
  GetDerivedSampleByIndex: "get-derived-sample-by-index",
  ListDerivedSamplesSummary: "list-derived-samples-summary",
  ListSamples: "list-samples",
  ListFeatures: "list-features",
  GetSampleByHash: "get-sample-by-hash",
  GetSampleByName: "get-sample-by-name",
  StoreRecording: "store-recording",
  GranularizeSample: "granularize-sample",

  // Commands
  SendCommand: "send-command",
  AnalyzeNMF: "analyze-nmf",
  VisualizeNMF: "visualize-nmf",
  Sep: "sep",
  Nx: "nx",

  // TypeScript
  TranspileTypeScript: "transpile-typescript",

  // Corpus
  CorpusBuild: "corpus-build",
  CorpusQuery: "corpus-query",
  CorpusResynthesize: "corpus-resynthesize",

  // Filesystem
  FsLs: "fs-ls",
  FsCd: "fs-cd",
  FsPwd: "fs-pwd",
  FsCompletePath: "fs-complete-path",
  FsGlob: "fs-glob",
  FsWalk: "fs-walk",

  // One-way renderer → main
  PlaySample: "play-sample",
  StopSample: "stop-sample",

  // Instruments (one-way renderer → main)
  DefineInstrument: "define-instrument",
  FreeInstrument: "free-instrument",
  LoadInstrumentSample: "load-instrument-sample",
  InstrumentNoteOn: "instrument-note-on",
  InstrumentNoteOff: "instrument-note-off",
  InstrumentStopAll: "instrument-stop-all",
  SetInstrumentParam: "set-instrument-param",
  SubscribeInstrumentTelemetry: "subscribe-instrument-telemetry",
  UnsubscribeInstrumentTelemetry: "unsubscribe-instrument-telemetry",

  // Mixer
  MixerSetChannelGain: "mixer-set-channel-gain",
  MixerSetChannelPan: "mixer-set-channel-pan",
  MixerSetChannelMute: "mixer-set-channel-mute",
  MixerSetChannelSolo: "mixer-set-channel-solo",
  MixerAttachInstrument: "mixer-attach-instrument",
  MixerDetachChannel: "mixer-detach-channel",
  MixerSetMasterGain: "mixer-set-master-gain",
  MixerSetMasterMute: "mixer-set-master-mute",
  MixerGetState: "mixer-get-state",

  // Background errors
  GetBackgroundErrors: "get-background-errors",
  DismissBackgroundError: "dismiss-background-error",
  DismissAllBackgroundErrors: "dismiss-all-background-errors",

  // One-way main → renderer
  PlaybackPosition: "playback-position",
  PlaybackEnded: "playback-ended",
  PlaybackError: "playback-error",
  OverlayNMFVisualization: "overlay-nmf-visualization",

  // MIDI
  MidiListInputs: "midi-list-inputs",
  MidiOpenInput: "midi-open-input",
  MidiCloseInput: "midi-close-input",
  MidiInjectEvent: "midi-inject-event",
  MidiStartRecording: "midi-start-recording",
  MidiStopRecording: "midi-stop-recording",
  MidiSaveSequence: "midi-save-sequence",
  MidiLoadSequence: "midi-load-sequence",
  MidiListSequences: "midi-list-sequences",
  MidiDeleteSequence: "midi-delete-sequence",
  MidiLoadFile: "midi-load-file",
  MidiStartPlayback: "midi-start-playback",
  MidiStopPlayback: "midi-stop-playback",
  // MIDI telemetry (main → renderer)
  MidiInputEvent: "midi-input-event",
  MidiPlaybackEnded: "midi-playback-ended",

  // Transport (renderer → main, one-way)
  TransportStart:        "transport-start",
  TransportStop:         "transport-stop",
  TransportSetBpm:       "transport-set-bpm",
  TransportSetPattern:   "transport-set-pattern",
  TransportClearPattern: "transport-clear-pattern",
  // Transport telemetry (main → renderer)
  TransportTick:         "transport-tick",
  AudioDeviceInfo:       "audio-device-info",
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

// ---------------------------------------------------------------------------
// Transport shared types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handle contract (ipcMain.handle / ipcRenderer.invoke)
// ---------------------------------------------------------------------------

export interface IpcHandleContract {
  "read-audio-file": {
    request: [filePathOrHash: string];
    response: ReadAudioFileResult;
  };
  "analyze-onset-slice": {
    request: [audioData: number[], options?: OnsetSliceOptions];
    response: number[];
  };
  "analyze-buf-nmf": {
    request: [audioData: number[], sampleRate: number, options?: BufNMFOptions];
    response: BufNMFResult;
  };
  "analyze-mfcc": {
    request: [audioData: number[], options?: MFCCOptions];
    response: unknown;
  };
  "get-current-project": {
    request: [];
    response: ProjectObject | null;
  };
  "list-projects": {
    request: [];
    response: ProjectObject[];
  };
  "load-project": {
    request: [name: string];
    response: ProjectObject;
  };
  "remove-project": {
    request: [name: string];
    response: RemoveProjectResult;
  };
  "save-command": {
    request: [command: string];
    response: void;
  };
  "get-command-history": {
    request: [limit?: number];
    response: string[];
  };
  "clear-command-history": {
    request: [];
    response: void;
  };
  "dedupe-command-history": {
    request: [];
    response: { removed: number };
  };
  "save-repl-env": {
    request: [entries: Array<{ name: string; kind: "json" | "function"; value: string }>];
    response: void;
  };
  "get-repl-env": {
    request: [];
    response: ReplEnvRecord[];
  };
  "debug-log": {
    request: [level: string, message: string, data?: Record<string, unknown>];
    response: void;
  };
  "get-debug-logs": {
    request: [limit?: number];
    response: DebugLogEntry[];
  };
  "clear-debug-logs": {
    request: [];
    response: void;
  };
  "store-feature": {
    request: [sampleHash: string, featureType: string, featureData: number[], options?: FeatureOptions];
    response: number;
  };
  "get-most-recent-feature": {
    request: [sampleHash?: string, featureType?: string];
    response: FeatureRecord | null;
  };
  "create-slice-samples": {
    request: [sampleHash: string, featureHash: string];
    response: Array<{ hash: string; index: number }>;
  };
  "get-derived-samples": {
    request: [sourceHash: string, featureHash: string];
    response: SampleFeatureLink[];
  };
  "get-derived-sample-by-index": {
    request: [sourceHash: string, featureHash: string, index: number];
    response: SampleRecord | null;
  };
  "list-derived-samples-summary": {
    request: [];
    response: DerivedSampleSummary[];
  };
  "list-samples": {
    request: [];
    response: SampleListRecord[];
  };
  "list-features": {
    request: [];
    response: FeatureListRecord[];
  };
  "get-sample-by-hash": {
    request: [hash: string];
    response: SampleRecord | null;
  };
  "complete-sample-hash": {
    request: [prefix: string];
    response: SampleHashCompletion[];
  };
  "get-sample-by-name": {
    request: [name: string];
    response: SampleByNameResult | null;
  };
  "store-recording": {
    request: [name: string, audioData: number[], sampleRate: number, channels: number, duration: number, overwrite: boolean];
    response: StoreRecordingResult;
  };
  "granularize-sample": {
    request: [sourceHash: string, options?: GranularizeOptions];
    response: GranularizeResult;
  };
  "send-command": {
    request: [commandName: string, args: string[]];
    response: string;
  };
  "analyze-nmf": {
    request: [args: string[]];
    response: unknown;
  };
  "visualize-nmf": {
    request: [sampleHash: string];
    response: unknown;
  };
  "sep": {
    request: [args: string[]];
    response: unknown;
  };
  "nx": {
    request: [args: string[]];
    response: unknown;
  };
  "transpile-typescript": {
    request: [source: string];
    response: string;
  };
  "corpus-build": {
    request: [sourceHash: string, featureHash: string];
    response: unknown;
  };
  "corpus-query": {
    request: [segmentIndex: number, k?: number];
    response: unknown;
  };
  "corpus-resynthesize": {
    request: [indices: number[]];
    response: unknown;
  };
  "fs-ls": {
    request: [dirPath: string | undefined, showHidden: boolean];
    response: FsLsResult;
  };
  "fs-cd": {
    request: [dirPath: string];
    response: string;
  };
  "fs-pwd": {
    request: [];
    response: string;
  };
  "fs-complete-path": {
    request: [method: FsCompletionMethod, inputPath: string];
    response: string[];
  };
  "fs-glob": {
    request: [pattern: string];
    response: string[];
  };
  "fs-walk": {
    request: [dirPath: string];
    response: FsWalkResult;
  };

  // Background errors
  "get-background-errors": {
    request: [];
    response: BackgroundErrorRecord[];
  };
  "dismiss-background-error": {
    request: [id: number];
    response: boolean;
  };
  "dismiss-all-background-errors": {
    request: [];
    response: number;
  };
  "mixer-get-state": {
    request: [];
    response: MixerStateResponse | null;
  };
  "midi-list-inputs": {
    request: [];
    response: MidiInputDevice[];
  };
  "midi-open-input": {
    request: [index: number];
    response: { name: string };
  };
  "midi-close-input": {
    request: [];
    response: void;
  };
  "midi-inject-event": {
    request: [status: number, data1: number, data2: number];
    response: void;
  };
  "midi-start-recording": {
    request: [instrumentId: string];
    response: void;
  };
  "midi-stop-recording": {
    request: [];
    response: MidiEvent[];
  };
  "midi-save-sequence": {
    request: [name: string, events: MidiEvent[], durationMs: number];
    response: MidiSequenceRecord;
  };
  "midi-load-sequence": {
    request: [id: number];
    response: (MidiSequenceRecord & { events: MidiEvent[] }) | null;
  };
  "midi-list-sequences": {
    request: [];
    response: MidiSequenceRecord[];
  };
  "midi-delete-sequence": {
    request: [id: number];
    response: void;
  };
  "midi-load-file": {
    request: [filePath: string];
    response: MidiFileParseResult;
  };
  "midi-start-playback": {
    request: [sequenceId: number, instrumentId: string];
    response: void;
  };
  "midi-stop-playback": {
    request: [];
    response: void;
  };
}

// ---------------------------------------------------------------------------
// One-way contracts
// ---------------------------------------------------------------------------

export interface IpcSendContract {
  "play-sample": {
    data: { hash: string; loop: boolean; loopStart?: number; loopEnd?: number };
  };
  "stop-sample": {
    data: { hash?: string } | undefined;
  };
  "define-instrument": {
    data: { instrumentId: string; kind: string; polyphony: number };
  };
  "free-instrument": {
    data: { instrumentId: string };
  };
  "load-instrument-sample": {
    data: { instrumentId: string; note: number; sampleHash: string; loop?: boolean; loopStart?: number; loopEnd?: number };
  };
  "instrument-note-on": {
    data: { instrumentId: string; note: number; velocity: number };
  };
  "instrument-note-off": {
    data: { instrumentId: string; note: number };
  };
  "instrument-stop-all": {
    data: { instrumentId: string };
  };
  "set-instrument-param": {
    data: { instrumentId: string; paramId: number; value: number };
  };
  "subscribe-instrument-telemetry": {
    data: { instrumentId: string };
  };
  "unsubscribe-instrument-telemetry": {
    data: { instrumentId: string };
  };
  // Mixer
  "mixer-set-channel-gain": {
    data: { channelIndex: number; gainDb: number };
  };
  "mixer-set-channel-pan": {
    data: { channelIndex: number; pan: number };
  };
  "mixer-set-channel-mute": {
    data: { channelIndex: number; mute: boolean };
  };
  "mixer-set-channel-solo": {
    data: { channelIndex: number; solo: boolean };
  };
  "mixer-attach-instrument": {
    data: { channelIndex: number; instrumentId: string };
  };
  "mixer-detach-channel": {
    data: { channelIndex: number };
  };
  "mixer-set-master-gain": {
    data: { gainDb: number };
  };
  "mixer-set-master-mute": {
    data: { mute: boolean };
  };
  // Transport (renderer → main, one-way)
  "transport-start": {
    data: void;
  };
  "transport-stop": {
    data: void;
  };
  "transport-set-bpm": {
    data: { bpm: number };
  };
  "transport-set-pattern": {
    data: { channelIndex: number; stepsJson: string };
  };
  "transport-clear-pattern": {
    data: { channelIndex: number };
  };
}

export interface IpcPushContract {
  "playback-position": {
    data: { hash: string; positionInSamples: number };
  };
  "playback-ended": {
    data: { hash: string };
  };
  "playback-error": {
    data: { sampleHash?: string; code: string; message: string };
  };
  "overlay-nmf-visualization": {
    data: NMFVisualizationData;
  };
  "mixer-levels": {
    data: {
      channelPeaksL: number[];
      channelPeaksR: number[];
      masterPeakL: number;
      masterPeakR: number;
    };
  };
  "midi-input-event": {
    data: MidiEvent;
  };
  "midi-playback-ended": {
    data: { sequenceId: number };
  };
  "transport-tick": {
    data: TransportTickData;
  };
  "audio-device-info": {
    data: AudioDeviceInfoData;
  };
}

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

export type HandleChannel = keyof IpcHandleContract;
export type SendChannel = keyof IpcSendContract;
export type PushChannel = keyof IpcPushContract;

export type InvokeArgs<C extends HandleChannel> = IpcHandleContract[C]["request"];
export type InvokeResult<C extends HandleChannel> = IpcHandleContract[C]["response"];

// ---------------------------------------------------------------------------
// ElectronAPI — the renderer-facing interface exposed via contextBridge
// ---------------------------------------------------------------------------

export interface ElectronAPI {
  version: string;

  // Audio
  readAudioFile: (path: string) => Promise<ReadAudioFileResult>;
  analyzeOnsetSlice: (audioData: Float32Array, options?: OnsetSliceOptions) => Promise<number[]>;
  analyzeBufNMF: (audioData: Float32Array, sampleRate: number, options?: BufNMFOptions) => Promise<BufNMFResult>;
  analyzeMFCC: (audioData: Float32Array, options?: MFCCOptions) => Promise<unknown>;

  // Projects
  getCurrentProject: () => Promise<ProjectObject | null>;
  listProjects: () => Promise<ProjectObject[]>;
  loadProject: (name: string) => Promise<ProjectObject>;
  removeProject: (name: string) => Promise<RemoveProjectResult>;

  // Command history
  saveCommand: (command: string) => Promise<void>;
  getCommandHistory: (limit?: number) => Promise<string[]>;
  clearCommandHistory: () => Promise<void>;
  dedupeCommandHistory: () => Promise<{ removed: number }>;

  // REPL environment
  saveReplEnv: (entries: Array<{ name: string; kind: "json" | "function"; value: string }>) => Promise<void>;
  getReplEnv: () => Promise<ReplEnvRecord[]>;

  // Debug logging
  debugLog: (level: string, message: string, data?: Record<string, unknown>) => Promise<void>;
  getDebugLogs: (limit?: number) => Promise<DebugLogEntry[]>;
  clearDebugLogs: () => Promise<void>;

  // Features & samples
  storeFeature: (sampleHash: string, featureType: string, featureData: number[], options?: FeatureOptions) => Promise<number>;
  getMostRecentFeature: (sampleHash?: string, featureType?: string) => Promise<FeatureRecord | null>;
  createSliceSamples: (sampleHash: string, featureHash: string) => Promise<Array<{ hash: string; index: number }>>;
  getDerivedSamples: (sourceHash: string, featureHash: string) => Promise<SampleFeatureLink[]>;
  getDerivedSampleByIndex: (sourceHash: string, featureHash: string, index: number) => Promise<SampleRecord | null>;
  listDerivedSamplesSummary: () => Promise<DerivedSampleSummary[]>;
  listSamples: () => Promise<SampleListRecord[]>;
  listFeatures: () => Promise<FeatureListRecord[]>;
  getSampleByHash: (hash: string) => Promise<SampleRecord | null>;
  completeSampleHash: (prefix: string) => Promise<SampleHashCompletion[]>;
  getSampleByName: (name: string) => Promise<SampleByNameResult | null>;
  storeRecording: (name: string, audioData: number[], sampleRate: number, channels: number, duration: number, overwrite: boolean) => Promise<StoreRecordingResult>;
  granularizeSample: (sourceHash: string, options?: GranularizeOptions) => Promise<GranularizeResult>;

  // Commands
  sendCommand: (command: string, args: string[]) => Promise<string>;
  analyzeNMF: (args: string[]) => Promise<unknown>;
  visualizeNMF: (sampleHash: string) => Promise<unknown>;
  sep: (args: string[]) => Promise<unknown>;
  nx: (args: string[]) => Promise<unknown>;

  // TypeScript
  transpileTypeScript: (source: string) => Promise<string>;

  // Corpus
  corpusBuild: (sourceHash: string, featureHash: string) => Promise<unknown>;
  corpusQuery: (segmentIndex: number, k?: number) => Promise<unknown>;
  corpusResynthesize: (indices: number[]) => Promise<unknown>;

  // Filesystem
  fsLs: (dirPath?: string) => Promise<FsLsResult>;
  fsLa: (dirPath?: string) => Promise<FsLsResult>;
  fsCd: (dirPath: string) => Promise<string>;
  fsPwd: () => Promise<string>;
  fsCompletePath: (method: FsCompletionMethod, inputPath: string) => Promise<string[]>;
  fsGlob: (pattern: string) => Promise<string[]>;
  fsWalk: (dirPath: string) => Promise<FsWalkResult>;

  // Playback (one-way renderer → main)
  playSample: (hash: string, loop: boolean, loopStart?: number, loopEnd?: number) => void;
  stopSample: (hash?: string) => void;

  // Instruments (one-way renderer → main)
  defineInstrument: (instrumentId: string, kind: string, polyphony: number) => void;
  freeInstrument: (instrumentId: string) => void;
  loadInstrumentSample: (instrumentId: string, note: number, sampleHash: string, loop?: boolean, loopStart?: number, loopEnd?: number) => void;
  instrumentNoteOn: (instrumentId: string, note: number, velocity: number) => void;
  instrumentNoteOff: (instrumentId: string, note: number) => void;
  instrumentStopAll: (instrumentId: string) => void;
  setInstrumentParam: (instrumentId: string, paramId: number, value: number) => void;
  subscribeInstrumentTelemetry: (instrumentId: string) => void;
  unsubscribeInstrumentTelemetry: (instrumentId: string) => void;

  // Mixer (one-way renderer → main)
  mixerSetChannelGain: (channelIndex: number, gainDb: number) => void;
  mixerSetChannelPan: (channelIndex: number, pan: number) => void;
  mixerSetChannelMute: (channelIndex: number, mute: boolean) => void;
  mixerSetChannelSolo: (channelIndex: number, solo: boolean) => void;
  mixerAttachInstrument: (channelIndex: number, instrumentId: string) => void;
  mixerDetachChannel: (channelIndex: number) => void;
  mixerSetMasterGain: (gainDb: number) => void;
  mixerSetMasterMute: (mute: boolean) => void;
  mixerGetState: () => Promise<MixerStateResponse | null>;

  // Instrument DB persistence
  createDbInstrument: (name: string, kind: string, config?: Record<string, unknown>) => Promise<InstrumentRecord>;
  deleteDbInstrument: (name: string) => Promise<boolean>;
  addDbInstrumentSample: (instrumentName: string, sampleHash: string, noteNumber: number, loop?: boolean, loopStart?: number, loopEnd?: number) => Promise<void>;
  removeDbInstrumentSample: (instrumentName: string, sampleHash: string, noteNumber: number) => Promise<boolean>;
  listDbInstruments: () => Promise<InstrumentRecord[]>;
  getDbInstrumentSamples: (instrumentName: string) => Promise<InstrumentSampleRecord[]>;

  // Background errors
  getBackgroundErrors: () => Promise<BackgroundErrorRecord[]>;
  dismissBackgroundError: (id: number) => Promise<boolean>;
  dismissAllBackgroundErrors: () => Promise<number>;

  // Event listeners (one-way main → renderer)
  onPlaybackPosition: (callback: (hash: string, positionInSamples: number) => void) => void;
  onPlaybackEnded: (callback: (hash: string) => void) => void;
  onPlaybackError: (callback: (data: { sampleHash?: string; code: string; message: string }) => void) => void;
  onOverlayNMF: (callback: (data: NMFVisualizationData) => void) => void;
  onMixerLevels: (callback: (data: { channelPeaksL: number[]; channelPeaksR: number[]; masterPeakL: number; masterPeakR: number }) => void) => void;

  // MIDI
  midiListInputs: () => Promise<MidiInputDevice[]>;
  midiOpenInput: (index: number) => Promise<{ name: string }>;
  midiCloseInput: () => Promise<void>;
  midiInjectEvent: (status: number, data1: number, data2: number) => Promise<void>;
  midiStartRecording: (instrumentId: string) => Promise<void>;
  midiStopRecording: () => Promise<MidiEvent[]>;
  midiSaveSequence: (name: string, events: MidiEvent[], durationMs: number) => Promise<MidiSequenceRecord>;
  midiLoadSequence: (id: number) => Promise<(MidiSequenceRecord & { events: MidiEvent[] }) | null>;
  midiListSequences: () => Promise<MidiSequenceRecord[]>;
  midiDeleteSequence: (id: number) => Promise<void>;
  midiLoadFile: (filePath: string) => Promise<MidiFileParseResult>;
  midiStartPlayback: (sequenceId: number, instrumentId: string) => Promise<void>;
  midiStopPlayback: () => Promise<void>;
  onMidiInputEvent: (callback: (event: MidiEvent) => void) => void;
  onMidiPlaybackEnded: (callback: (data: { sequenceId: number }) => void) => void;

  // Transport
  transportStart: () => void;
  transportStop: () => void;
  transportSetBpm: (bpm: number) => void;
  transportSetPattern: (channelIndex: number, stepsJson: string) => void;
  transportClearPattern: (channelIndex: number) => void;
  onTransportTick: (cb: (data: TransportTickData) => void) => void;
  onAudioDeviceInfo: (cb: (data: AudioDeviceInfoData) => void) => void;
}
