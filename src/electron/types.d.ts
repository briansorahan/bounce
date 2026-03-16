export interface ElectronAPI {
  version: string;
  getCurrentProject: () => Promise<{
    id: number;
    name: string;
    created_at: string;
    sample_count: number;
    feature_count: number;
    command_count: number;
    current: boolean;
  } | null>;
  listProjects: () => Promise<Array<{
    id: number;
    name: string;
    created_at: string;
    sample_count: number;
    feature_count: number;
    command_count: number;
    current: boolean;
  }>>;
  loadProject: (name: string) => Promise<{
    id: number;
    name: string;
    created_at: string;
    sample_count: number;
    feature_count: number;
    command_count: number;
    current: boolean;
  }>;
  removeProject: (name: string) => Promise<{
    removedName: string;
    currentProject: {
      id: number;
      name: string;
      created_at: string;
      sample_count: number;
      feature_count: number;
      command_count: number;
      current: boolean;
    };
  }>;
  readAudioFile: (path: string) => Promise<{
    channelData: Float32Array;
    sampleRate: number;
    duration: number;
  }>;
  analyzeOnsetSlice: (
    audioData: Float32Array,
    options?: {
      function?: number;
      threshold?: number;
      minSliceLength?: number;
      filterSize?: number;
      windowSize?: number;
      fftSize?: number;
      hopSize?: number;
    },
  ) => Promise<number[]>;
  analyzeBufNMF: (
    audioData: Float32Array,
    sampleRate: number,
    options?: {
      components?: number;
      iterations?: number;
      fftSize?: number;
      hopSize?: number;
      windowSize?: number;
      seed?: number;
    },
  ) => Promise<{
    components: number;
    iterations: number;
    converged: boolean;
    bases: number[][];
    activations: number[][];
  }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
