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

interface SliceData {
  id: number;
  sample_hash: string;
  feature_id: number;
  slice_index: number;
  start_sample: number;
  end_sample: number;
}

interface SampleListData {
  id: number;
  hash: string;
  file_path: string;
  sample_rate: number;
  channels: number;
  duration: number;
  data_size: number;
  created_at: string;
}

interface SampleData {
  id: number;
  hash: string;
  file_path: string;
  audio_data: Buffer;
  sample_rate: number;
  channels: number;
  duration: number;
}

interface FeatureListData {
  id: number;
  sample_hash: string;
  feature_hash: string;
  feature_type: string;
  slice_count: number;
  options: string | null;
  created_at: string;
}

interface SlicesSummary {
  sample_hash: string;
  file_path: string;
  feature_id: number;
  slice_count: number;
  min_slice_id: number;
  max_slice_id: number;
}

interface ComponentData {
  id: number;
  sample_hash: string;
  feature_id: number;
  component_index: number;
  audio_data: Buffer;
}

interface ComponentsSummary {
  sample_hash: string;
  file_path: string;
  feature_id: number;
  component_count: number;
  min_component_id: number;
  max_component_id: number;
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
    saveCommand: (command: string) => Promise<void>;
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
    createSlices: (
      sampleHash: string,
      featureId: number,
      slicePositions: number[],
    ) => Promise<number[]>;
    getSlicesByFeature: (featureId: number) => Promise<SliceData[]>;
    getSlice: (sliceId: number) => Promise<SliceData | null>;
    getComponentsByFeature: (featureId: number) => Promise<ComponentData[]>;
    getComponent: (componentId: number) => Promise<ComponentData | null>;
    getComponentByIndex: (
      sampleHash: string,
      featureId: number,
      componentIndex: number,
    ) => Promise<ComponentData | null>;
    listSamples: () => Promise<SampleListData[]>;
    listFeatures: () => Promise<FeatureListData[]>;
    getSampleByHash: (hash: string) => Promise<SampleData | null>;
    listSlicesSummary: () => Promise<SlicesSummary[]>;
    listComponentsSummary: () => Promise<ComponentsSummary[]>;
    analyzeNMF: (
      args: string[],
    ) => Promise<{ success: boolean; message: string }>;
    visualizeNMF: (sampleHash: string) => Promise<string>;
    sep: (args: string[]) => Promise<{ success: boolean; message: string }>;
    onOverlayNMF: (callback: (data: NMFVisualizationData) => void) => void;
  };
}
