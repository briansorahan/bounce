interface StoreRecordingResult {
  status: "ok" | "exists";
  hash?: string;
  id?: number;
  sampleRate?: number;
  channels?: number;
  duration?: number;
  filePath?: string;
}

interface InstrumentDbRecord {
  id: number;
  project_id: number;
  name: string;
  kind: string;
  config_json: string | null;
  created_at: string;
}

interface InstrumentSampleDbRecord {
  instrument_id: number;
  sample_hash: string;
  note_number: number;
  loop: number;
  loop_start: number;
  loop_end: number;
}


interface AudioFileData {
  channelData: Float32Array;
  sampleRate: number;
  duration: number;
  hash: string;
  filePath: string;
}

interface FeatureData {
  id: number;
  sample_hash: string;
  feature_hash: string;
  feature_type: string;
  feature_data: string;
  options: string | null;
}

interface SampleData {
  id: number;
  hash: string;
  file_path: string | null;
  audio_data: Buffer;
  sample_rate: number;
  channels: number;
  duration: number;
}

interface SampleListData {
  id: number;
  hash: string;
  file_path: string | null;
  sample_rate: number;
  channels: number;
  duration: number;
  data_size: number;
  created_at: string;
}

interface SampleFeatureLinkData {
  sample_hash: string;
  source_hash: string;
  feature_hash: string;
  index_order: number;
}

interface DerivedSampleSummaryData {
  source_hash: string;
  source_file_path: string | null;
  feature_hash: string;
  feature_type: string;
  derived_count: number;
}

interface FeatureListData {
  sample_hash: string;
  feature_type: string;
  file_path: string | null;
  options: string | null;
  feature_count: number;
  feature_hash: string;
}

interface ProjectData {
  id: number;
  name: string;
  created_at: string;
  sample_count: number;
  feature_count: number;
  command_count: number;
  current: boolean;
}

interface RemoveProjectResultData {
  removedName: string;
  currentProject: ProjectData;
}

interface OnsetSliceOptions {
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  frameDelta?: number;
  metric?: number;
}

interface BufNMFOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  seed?: number;
}

interface FeatureOptions {
  threshold?: number;
  [key: string]: unknown;
}

interface DebugLogEntry {
  id: number;
  level: string;
  message: string;
  data: string | null;
  timestamp: number;
  created_at: string;
}

interface NMFVisualizationData {
  sampleHash: string;
  nmfData: {
    components: number;
    basis: number[][];
    activations: number[][];
  };
  featureHash: string;
}

interface FsLsEntry {
  name: string;
  path: string;
  type: string;
  isAudio: boolean;
}

interface FsLsResult {
  entries: FsLsEntry[];
  total: number;
  truncated: boolean;
}

interface FsWalkEntry {
  path: string;
  type: string;
}

interface FsWalkResult {
  entries: FsWalkEntry[];
  truncated: boolean;
}

interface Window {
  electron: {
    version: string;
    readAudioFile: (path: string) => Promise<AudioFileData>;
    analyzeOnsetSlice: (
      audioData: Float32Array,
      options?: OnsetSliceOptions,
    ) => Promise<number[]>;
    analyzeBufNMF: (
      audioData: Float32Array,
      sampleRate: number,
      options?: BufNMFOptions,
    ) => Promise<{
      components: number;
      iterations: number;
      converged: boolean;
      bases: number[][];
      activations: number[][];
    }>;
    analyzeMFCC: (
      audioData: Float32Array,
      options?: MFCCOptions,
    ) => Promise<number[][]>;
    saveCommand: (command: string) => Promise<void>;
    sendCommand: (command: string, args: string[]) => Promise<void>;
    getCurrentProject: () => Promise<ProjectData | null>;
    listProjects: () => Promise<ProjectData[]>;
    loadProject: (name: string) => Promise<ProjectData>;
    removeProject: (name: string) => Promise<RemoveProjectResultData>;
    getCommandHistory: (limit?: number) => Promise<string[]>;
    clearCommandHistory: () => Promise<void>;
    dedupeCommandHistory: () => Promise<{ removed: number }>;
    debugLog: (
      level: string,
      message: string,
      data?: Record<string, unknown>,
    ) => Promise<void>;
    getDebugLogs: (limit?: number) => Promise<DebugLogEntry[]>;
    clearDebugLogs: () => Promise<void>;
    storeFeature: (
      sampleHash: string,
      featureType: string,
      featureData: number[],
      options?: FeatureOptions,
    ) => Promise<number>;
    getMostRecentFeature: (
      sampleHash?: string,
      featureType?: string,
    ) => Promise<FeatureData | null>;
    createSliceSamples: (
      sampleHash: string,
      featureHash: string,
    ) => Promise<{ hash: string; index: number }[]>;
    getDerivedSamples: (
      sourceHash: string,
      featureHash: string,
    ) => Promise<SampleFeatureLinkData[]>;
    getDerivedSampleByIndex: (
      sourceHash: string,
      featureHash: string,
      index: number,
    ) => Promise<SampleData | null>;
    listDerivedSamplesSummary: () => Promise<DerivedSampleSummaryData[]>;
    listSamples: () => Promise<SampleListData[]>;
    listFeatures: () => Promise<FeatureListData[]>;
    getSampleByHash: (hash: string) => Promise<SampleData | null>;
    analyzeNMF: (
      args: string[],
    ) => Promise<{ success: boolean; message: string }>;
    visualizeNMF: (sampleHash: string) => Promise<string>;
    sep: (args: string[]) => Promise<{ success: boolean; message: string }>;
    nx: (args: string[]) => Promise<{ success: boolean; message: string }>;
    onOverlayNMF: (callback: (data: NMFVisualizationData) => void) => void;
    transpileTypeScript: (source: string) => Promise<string>;
    granularizeSample: (
      sourceHash: string,
      options?: GranularizeOptions,
    ) => Promise<{
      grainHashes: Array<string | null>;
      featureHash: string;
      sampleRate: number;
      grainDuration: number;
    }>;
    corpusBuild: (
      sourceHash: string,
      featureHash: string,
    ) => Promise<{ segmentCount: number; featureDims: number }>;
    corpusQuery: (
      segmentIndex: number,
      k?: number,
    ) => Promise<Array<{ id: string; index: number; distance: number }>>;
    corpusResynthesize: (
      indices: number[],
    ) => Promise<{ audio: Float32Array; sampleRate: number }>;
    fsLs: (dirPath?: string) => Promise<FsLsResult>;
    fsLa: (dirPath?: string) => Promise<FsLsResult>;
    fsCd: (dirPath: string) => Promise<string>;
    fsPwd: () => Promise<string>;
    fsCompletePath: (
      method: "ls" | "la" | "cd" | "walk",
      inputPath: string,
    ) => Promise<string[]>;
    fsGlob: (pattern: string) => Promise<string[]>;
    fsWalk: (dirPath: string) => Promise<FsWalkResult>;
    saveReplEnv: (
      entries: Array<{ name: string; kind: "json" | "function"; value: string }>,
    ) => Promise<void>;
    getReplEnv: () => Promise<
      Array<{
        project_id: number;
        name: string;
        kind: "json" | "function";
        value: string;
        created_at: string;
      }>
    >;
    getSampleByName: (name: string) => Promise<SampleData | null>;
    storeRecording: (
      name: string,
      audioData: number[],
      sampleRate: number,
      channels: number,
      duration: number,
      overwrite: boolean,
    ) => Promise<StoreRecordingResult>;
    playSample: (hash: string, loop: boolean) => void;
    stopSample: (hash?: string) => void;
    // Instrument API
    defineInstrument: (instrumentId: string, kind: string, polyphony: number) => void;
    freeInstrument: (instrumentId: string) => void;
    loadInstrumentSample: (instrumentId: string, note: number, sampleHash: string, loop?: boolean, loopStart?: number, loopEnd?: number) => void;
    instrumentNoteOn: (instrumentId: string, note: number, velocity: number) => void;
    instrumentNoteOff: (instrumentId: string, note: number) => void;
    instrumentStopAll: (instrumentId: string) => void;
    setInstrumentParam: (instrumentId: string, paramId: number, value: number) => void;
    subscribeInstrumentTelemetry: (instrumentId: string) => void;
    unsubscribeInstrumentTelemetry: (instrumentId: string) => void;
    // Instrument DB persistence
    createDbInstrument: (name: string, kind: string, config?: Record<string, unknown>) => Promise<InstrumentDbRecord>;
    deleteDbInstrument: (name: string) => Promise<boolean>;
    addDbInstrumentSample: (instrumentName: string, sampleHash: string, noteNumber: number, loop?: boolean, loopStart?: number, loopEnd?: number) => Promise<void>;
    removeDbInstrumentSample: (instrumentName: string, sampleHash: string, noteNumber: number) => Promise<boolean>;
    listDbInstruments: () => Promise<InstrumentDbRecord[]>;
    getDbInstrumentSamples: (instrumentName: string) => Promise<InstrumentSampleDbRecord[]>;
    onPlaybackPosition: (callback: (hash: string, positionInSamples: number) => void) => void;
    onPlaybackEnded: (callback: (hash: string) => void) => void;
    onPlaybackError: (callback: (data: { sampleHash?: string; code: string; message: string }) => void) => void;
  };
}
