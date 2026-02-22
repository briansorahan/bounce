export interface ElectronAPI {
  version: string;
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
