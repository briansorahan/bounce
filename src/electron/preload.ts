import { contextBridge, ipcRenderer } from "electron";
import type { FeatureOptions, GranularizeOptions } from "./database";
import type {
  BufNMFOptions,
  MFCCOptions,
  NMFVisualizationData,
  OnsetSliceOptions,
} from "./ipc-types";

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
  analyzeMFCC: (audioData: Float32Array, options?: MFCCOptions) =>
    ipcRenderer.invoke("analyze-mfcc", audioData, options),
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
  granularizeSample: (sourceHash: string, options?: GranularizeOptions) =>
    ipcRenderer.invoke("granularize-sample", sourceHash, options),
  transpileTypeScript: (source: string): Promise<string> =>
    ipcRenderer.invoke("transpile-typescript", source),
});
