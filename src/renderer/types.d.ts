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
  getCommandHistory: (limit?: number) => Promise<string[]>;
  clearCommandHistory: () => Promise<void>;
  dedupeCommandHistory: () => Promise<{ removed: number }>;
  debugLog: (level: string, message: string, data?: any) => Promise<void>;
  getDebugLogs: (limit?: number) => Promise<any[]>;
  clearDebugLogs: () => Promise<void>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
