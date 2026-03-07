import { contextBridge, ipcRenderer } from "electron";
import type { TranspileOptions } from "typescript";

// Lazily loaded on first call to avoid slowing app startup
let _ts: typeof import("typescript") | null = null;
function getTs(): typeof import("typescript") {
  if (!_ts) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _ts = require("typescript") as typeof import("typescript");
  }
  return _ts;
}

const replTsOptions: TranspileOptions = {
  compilerOptions: {
    // Use ESNext features (async/await, etc.) without downleveling
    target: 99 /* ScriptTarget.ESNext */,
    // CommonJS so require() works in the AsyncFunction execution context
    module: 1 /* ModuleKind.CommonJS */,
    esModuleInterop: true,
  },
};

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

contextBridge.exposeInMainWorld("electron", {
  version: process.versions.electron,
  readAudioFile: (path: string) => ipcRenderer.invoke("read-audio-file", path),
  analyzeOnsetSlice: (audioData: Float32Array, options?: OnsetSliceOptions) =>
    ipcRenderer.invoke("analyze-onset-slice", audioData, options),
  analyzeBufNMF: (
    audioData: Float32Array,
    sampleRate: number,
    options?: BufNMFOptions,
  ) => ipcRenderer.invoke("analyze-buf-nmf", audioData, sampleRate, options),
  saveCommand: (command: string) => ipcRenderer.invoke("save-command", command),
  getCommandHistory: (limit?: number) =>
    ipcRenderer.invoke("get-command-history", limit),
  clearCommandHistory: () => ipcRenderer.invoke("clear-command-history"),
  dedupeCommandHistory: () => ipcRenderer.invoke("dedupe-command-history"),
  debugLog: (level: string, message: string, data?: Record<string, unknown>) =>
    ipcRenderer.invoke("debug-log", level, message, data),
  getDebugLogs: (limit?: number) => ipcRenderer.invoke("get-debug-logs", limit),
  clearDebugLogs: () => ipcRenderer.invoke("clear-debug-logs"),
  storeFeature: (
    sampleHash: string,
    featureType: string,
    featureData: number[],
    options?: FeatureOptions,
  ) =>
    ipcRenderer.invoke(
      "store-feature",
      sampleHash,
      featureType,
      featureData,
      options,
    ),
  getMostRecentFeature: (sampleHash?: string, featureType?: string) =>
    ipcRenderer.invoke("get-most-recent-feature", sampleHash, featureType),
  createSliceSamples: (sampleHash: string, featureHash: string) =>
    ipcRenderer.invoke("create-slice-samples", sampleHash, featureHash),
  getDerivedSamples: (sourceHash: string, featureHash: string) =>
    ipcRenderer.invoke("get-derived-samples", sourceHash, featureHash),
  getDerivedSampleByIndex: (
    sourceHash: string,
    featureHash: string,
    index: number,
  ) =>
    ipcRenderer.invoke(
      "get-derived-sample-by-index",
      sourceHash,
      featureHash,
      index,
    ),
  listDerivedSamplesSummary: () =>
    ipcRenderer.invoke("list-derived-samples-summary"),
  listSamples: () => ipcRenderer.invoke("list-samples"),
  listFeatures: () => ipcRenderer.invoke("list-features"),
  getSampleByHash: (hash: string) =>
    ipcRenderer.invoke("get-sample-by-hash", hash),
  sendCommand: (command: string, args: string[]) =>
    ipcRenderer.invoke("send-command", command, args),
  analyzeNMF: (args: string[]) => ipcRenderer.invoke("analyze-nmf", args),
  visualizeNMF: (sampleHash: string) =>
    ipcRenderer.invoke("visualize-nmf", sampleHash),
  sep: (args: string[]) => ipcRenderer.invoke("sep", args),
  nx: (args: string[]) => ipcRenderer.invoke("nx", args),
  onOverlayNMF: (callback: (data: NMFVisualizationData) => void) => {
    ipcRenderer.on("overlay-nmf-visualization", (_event, data) =>
      callback(data),
    );
  },
  transpileTypeScript: (source: string): string => {
    return getTs().transpileModule(source, replTsOptions).outputText;
  },
});
