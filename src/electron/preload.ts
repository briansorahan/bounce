import { contextBridge, ipcRenderer } from 'electron';

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

interface NMFVisualizationData {
  sampleHash: string;
  nmfData: {
    components: number;
    basis: number[][];
    activations: number[][];
  };
  featureHash: string;
}

contextBridge.exposeInMainWorld('electron', {
  version: process.versions.electron,
  readAudioFile: (path: string) => ipcRenderer.invoke('read-audio-file', path),
  analyzeOnsetSlice: (audioData: Float32Array, options?: OnsetSliceOptions) => 
    ipcRenderer.invoke('analyze-onset-slice', audioData, options),
  analyzeBufNMF: (audioData: Float32Array, sampleRate: number, options?: BufNMFOptions) => 
    ipcRenderer.invoke('analyze-buf-nmf', audioData, sampleRate, options),
  saveCommand: (command: string) => ipcRenderer.invoke('save-command', command),
  getCommandHistory: (limit?: number) => ipcRenderer.invoke('get-command-history', limit),
  clearCommandHistory: () => ipcRenderer.invoke('clear-command-history'),
  dedupeCommandHistory: () => ipcRenderer.invoke('dedupe-command-history'),
  debugLog: (level: string, message: string, data?: Record<string, unknown>) => ipcRenderer.invoke('debug-log', level, message, data),
  getDebugLogs: (limit?: number) => ipcRenderer.invoke('get-debug-logs', limit),
  clearDebugLogs: () => ipcRenderer.invoke('clear-debug-logs'),
  storeFeature: (sampleHash: string, featureType: string, featureData: number[], options?: FeatureOptions) => 
    ipcRenderer.invoke('store-feature', sampleHash, featureType, featureData, options),
  getMostRecentFeature: (sampleHash?: string, featureType?: string) => 
    ipcRenderer.invoke('get-most-recent-feature', sampleHash, featureType),
  createSlices: (sampleHash: string, featureId: number, slicePositions: number[]) => 
    ipcRenderer.invoke('create-slices', sampleHash, featureId, slicePositions),
  getSlicesByFeature: (featureId: number) => ipcRenderer.invoke('get-slices-by-feature', featureId),
  getSlice: (sliceId: number) => ipcRenderer.invoke('get-slice', sliceId),
  listSamples: () => ipcRenderer.invoke('list-samples'),
  listFeatures: () => ipcRenderer.invoke('list-features'),
  getSampleByHash: (hash: string) => ipcRenderer.invoke('get-sample-by-hash', hash),
  listSlicesSummary: () => ipcRenderer.invoke('list-slices-summary'),
  sendCommand: (command: string, args: string[]) => ipcRenderer.invoke('send-command', command, args),
  analyzeNMF: (args: string[]) => ipcRenderer.invoke('analyze-nmf', args),
  visualizeNMF: (sampleHash: string) => ipcRenderer.invoke('visualize-nmf', sampleHash),
  onOverlayNMF: (callback: (data: NMFVisualizationData) => void) => {
    ipcRenderer.on('overlay-nmf-visualization', (_event, data) => callback(data));
  }
});
