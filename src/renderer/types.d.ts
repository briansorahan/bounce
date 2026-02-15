export interface ElectronAPI {
  version: string;
  readAudioFile: (path: string) => Promise<{
    channelData: Float32Array;
    sampleRate: number;
    duration: number;
  }>;
  analyzeOnsetSlice: (audioData: Float32Array, options?: {
    function?: number;
    threshold?: number;
    minSliceLength?: number;
    filterSize?: number;
    windowSize?: number;
    fftSize?: number;
    hopSize?: number;
  }) => Promise<number[]>;
  saveCommand: (command: string) => Promise<void>;
  getCommandHistory: () => Promise<string[]>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
