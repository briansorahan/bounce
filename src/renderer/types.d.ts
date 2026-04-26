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
  sample_type: string;
  sample_rate: number;
  channels: number;
  duration: number;
  display_name?: string | null;
  audio_data?: Buffer;
}

interface SampleListData {
  id: number;
  hash: string;
  sample_type: string;
  sample_rate: number;
  channels: number;
  duration: number;
  display_name: string | null;
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
  source_display_name: string | null;
  feature_hash: string;
  feature_type: string;
  derived_count: number;
}

interface FeatureListData {
  sample_hash: string;
  feature_type: string;
  display_name: string | null;
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

interface AmpSliceOptions {
  fastRampUp?: number;
  fastRampDown?: number;
  slowRampUp?: number;
  slowRampDown?: number;
  onThreshold?: number;
  offThreshold?: number;
  floor?: number;
  minSliceLength?: number;
  highPassFreq?: number;
}

interface NoveltySliceOptions {
  kernelSize?: number;
  threshold?: number;
  filterSize?: number;
  minSliceLength?: number;
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
}

interface TransientSliceOptions {
  order?: number;
  blockSize?: number;
  padSize?: number;
  skew?: number;
  threshFwd?: number;
  threshBack?: number;
  windowSize?: number;
  clumpLength?: number;
  minSliceLength?: number;
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

interface BackgroundErrorRecord {
  id: number;
  source: string;
  code: string;
  message: string;
  dismissed: number;
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
    analyzeAmpSlice: (
      audioData: Float32Array,
      options?: AmpSliceOptions,
    ) => Promise<number[]>;
    analyzeNoveltySlice: (
      audioData: Float32Array,
      options?: NoveltySliceOptions,
    ) => Promise<number[]>;
    analyzeTransientSlice: (
      audioData: Float32Array,
      options?: TransientSliceOptions,
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
    completeSampleHash: (prefix: string) => Promise<Array<{ hash: string; filePath: string | null }>>;
    analyzeNMF: (
      args: string[],
    ) => Promise<{ success: boolean; message: string }>;
    visualizeNMF: (sampleHash: string) => Promise<string>;
    sep: (args: string[]) => Promise<{ success: boolean; message: string }>;
    nx: (args: string[]) => Promise<{ success: boolean; message: string }>;
    onOverlayNMF: (callback: (data: NMFVisualizationData) => void) => void;
    transpileTypeScript: (source: string) => Promise<string>;
    grainsSample: (
      sourceHash: string,
      options?: GrainsOptions,
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
      method: "ls" | "la" | "cd" | "walk" | "read",
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
    playSample: (hash: string, loop: boolean, loopStart?: number, loopEnd?: number) => void;
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
    // Mixer
    mixerSetChannelGain: (channelIndex: number, gainDb: number) => void;
    mixerSetChannelPan: (channelIndex: number, pan: number) => void;
    mixerSetChannelMute: (channelIndex: number, mute: boolean) => void;
    mixerSetChannelSolo: (channelIndex: number, solo: boolean) => void;
    mixerAttachInstrument: (channelIndex: number, instrumentId: string) => void;
    mixerDetachChannel: (channelIndex: number) => void;
    mixerSetMasterGain: (gainDb: number) => void;
    mixerSetMasterMute: (mute: boolean) => void;
    mixerGetState: () => Promise<{ channels: Array<{ channel_idx: number; gain_db: number; pan: number; mute: number; solo: number; instrument_name: string | null }>; master: { gain_db: number; mute: number } | null } | null>;
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
    onMixerLevels: (callback: (data: { channelPeaksL: number[]; channelPeaksR: number[]; masterPeakL: number; masterPeakR: number }) => void) => void;
    // Background errors
    getBackgroundErrors: () => Promise<BackgroundErrorRecord[]>;
    dismissBackgroundError: (id: number) => Promise<boolean>;
    dismissAllBackgroundErrors: () => Promise<number>;
    // MIDI
    midiListInputs: () => Promise<Array<{ index: number; name: string }>>;
    midiOpenInput: (index: number) => Promise<{ name: string }>;
    midiCloseInput: () => Promise<void>;
    midiInjectEvent: (status: number, data1: number, data2: number) => Promise<void>;
    midiStartRecording: (instrumentId: string) => Promise<void>;
    midiStopRecording: () => Promise<Array<{ timestampMs: number; type: string; channel: number; note?: number; velocity?: number; ccNumber?: number; ccValue?: number }>>;
    midiSaveSequence: (name: string, events: unknown[], durationMs: number) => Promise<{ id: number; name: string; project_id: number; duration_ms: number; event_count: number; created_at: string }>;
    midiLoadSequence: (id: number) => Promise<{ id: number; name: string; project_id: number; duration_ms: number; event_count: number; created_at: string; events: unknown[] } | null>;
    midiListSequences: () => Promise<Array<{ id: number; name: string; project_id: number; duration_ms: number; event_count: number; created_at: string }>>;
    midiDeleteSequence: (id: number) => Promise<void>;
    midiLoadFile: (filePath: string) => Promise<{ events: unknown[]; durationMs: number; smfType: number }>;
    midiStartPlayback: (sequenceId: number, instrumentId: string) => Promise<void>;
    midiStopPlayback: () => Promise<void>;
    onMidiInputEvent: (callback: (event: unknown) => void) => void;
    onMidiPlaybackEnded: (callback: (data: { sequenceId: number }) => void) => void;
    // Transport
    transportStart(): void;
    transportStop(): void;
    transportSetBpm(bpm: number): void;
    transportSetPattern(channelIndex: number, stepsJson: string): void;
    transportClearPattern(channelIndex: number): void;
    onTransportTick(cb: (data: import('../shared/ipc-contract').TransportTickData) => void): void;
    onAudioDeviceInfo(cb: (data: import('../shared/ipc-contract').AudioDeviceInfoData) => void): void;
    // Recording (native audio engine)
    listAudioInputs(): Promise<Array<{ index: number; name: string; deviceId: string }>>;
    startRecording(deviceIndex: number, sampleRate?: number): Promise<void>;
    stopRecording(name: string, sampleRate: number, channels: number, overwrite?: boolean): Promise<
      | { status: "ok"; hash: string; id?: number; sampleRate: number; channels: number; duration: number; filePath: string }
      | { status: "exists" }
    >;
  };
}
