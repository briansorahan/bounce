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

interface Window {
  electron: {
    version: string;
    readAudioFile: (path: string) => Promise<AudioFileData>;
    analyzeOnsetSlice: (audioData: Float32Array, options?: any) => Promise<number[]>;
    saveCommand: (command: string) => Promise<void>;
    getCommandHistory: (limit?: number) => Promise<string[]>;
    clearCommandHistory: () => Promise<void>;
    dedupeCommandHistory: () => Promise<{ removed: number }>;
    debugLog: (level: string, message: string, data?: any) => Promise<void>;
    getDebugLogs: (limit?: number) => Promise<any[]>;
    clearDebugLogs: () => Promise<void>;
    storeFeature: (sampleHash: string, featureType: string, featureData: number[], options?: any) => Promise<number>;
    getMostRecentFeature: (sampleHash?: string, featureType?: string) => Promise<FeatureData | null>;
    createSlices: (sampleHash: string, featureId: number, slicePositions: number[]) => Promise<number[]>;
    getSlicesByFeature: (featureId: number) => Promise<SliceData[]>;
    getSlice: (sliceId: number) => Promise<SliceData | null>;
    listSamples: () => Promise<SampleListData[]>;
    listFeatures: () => Promise<FeatureListData[]>;
    getSampleByHash: (hash: string) => Promise<SampleData | null>;
    listSlicesSummary: () => Promise<SlicesSummary[]>;
  };
}
