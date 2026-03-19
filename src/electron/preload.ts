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
  getCurrentProject: () => ipcRenderer.invoke("get-current-project"),
  listProjects: () => ipcRenderer.invoke("list-projects"),
  loadProject: (name: string) => ipcRenderer.invoke("load-project", name),
  removeProject: (name: string) => ipcRenderer.invoke("remove-project", name),
  getCommandHistory: (limit?: number) =>
    ipcRenderer.invoke("get-command-history", limit),
  clearCommandHistory: () => ipcRenderer.invoke("clear-command-history"),
  dedupeCommandHistory: () => ipcRenderer.invoke("dedupe-command-history"),
  saveReplEnv: (entries: Array<{ name: string; kind: string; value: string }>) =>
    ipcRenderer.invoke("save-repl-env", entries),
  getReplEnv: () => ipcRenderer.invoke("get-repl-env"),
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
  corpusBuild: (sourceHash: string, featureHash: string) =>
    ipcRenderer.invoke("corpus-build", sourceHash, featureHash),
  corpusQuery: (segmentIndex: number, k?: number) =>
    ipcRenderer.invoke("corpus-query", segmentIndex, k),
  corpusResynthesize: (indices: number[]) =>
    ipcRenderer.invoke("corpus-resynthesize", indices),
  fsLs: (dirPath?: string) => ipcRenderer.invoke("fs-ls", dirPath, false),
  fsLa: (dirPath?: string) => ipcRenderer.invoke("fs-ls", dirPath, true),
  fsCd: (dirPath: string) => ipcRenderer.invoke("fs-cd", dirPath),
  fsPwd: (): Promise<string> => ipcRenderer.invoke("fs-pwd"),
  fsCompletePath: (method: "ls" | "la" | "cd" | "walk", inputPath: string): Promise<string[]> =>
    ipcRenderer.invoke("fs-complete-path", method, inputPath),
  fsGlob: (pattern: string): Promise<string[]> =>
    ipcRenderer.invoke("fs-glob", pattern),
  fsWalk: (dirPath: string) => ipcRenderer.invoke("fs-walk", dirPath),
  getSampleByName: (name: string) =>
    ipcRenderer.invoke("get-sample-by-name", name),
  storeRecording: (
    name: string,
    audioData: number[],
    sampleRate: number,
    channels: number,
    duration: number,
    overwrite: boolean,
  ) =>
    ipcRenderer.invoke(
      "store-recording",
      name,
      audioData,
      sampleRate,
      channels,
      duration,
      overwrite,
    ),
  playSample: (hash: string, loop: boolean) =>
    ipcRenderer.send("play-sample", { hash, loop }),
  stopSample: (hash?: string) =>
    ipcRenderer.send("stop-sample", hash ? { hash } : undefined),
  onPlaybackPosition: (callback: (hash: string, positionInSamples: number) => void) => {
    ipcRenderer.on("playback-position", (_event, data: { hash: string; positionInSamples: number }) =>
      callback(data.hash, data.positionInSamples),
    );
  },
  onPlaybackEnded: (callback: (hash: string) => void) => {
    ipcRenderer.on("playback-ended", (_event, data: { hash: string }) =>
      callback(data.hash),
    );
  },
});
