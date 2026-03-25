import { contextBridge, ipcRenderer } from "electron";
import type { FeatureOptions, GranularizeOptions } from "./database";
import type {
  BufNMFOptions,
  MFCCOptions,
  NMFVisualizationData,
  OnsetSliceOptions,
} from "./ipc-types";
import type { ElectronAPI, MidiEvent } from "../shared/ipc-contract";

const api: ElectronAPI = {
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
  completeSampleHash: (prefix: string) =>
    ipcRenderer.invoke("complete-sample-hash", prefix),
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
  fsCompletePath: (method: "ls" | "la" | "cd" | "walk" | "read", inputPath: string): Promise<string[]> =>
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
  playSample: (hash: string, loop: boolean, loopStart?: number, loopEnd?: number) =>
    ipcRenderer.send("play-sample", { hash, loop, loopStart, loopEnd }),
  stopSample: (hash?: string) =>
    ipcRenderer.send("stop-sample", hash ? { hash } : undefined),

  // Instrument API (one-way renderer → main)
  defineInstrument: (instrumentId: string, kind: string, polyphony: number) =>
    ipcRenderer.send("define-instrument", { instrumentId, kind, polyphony }),
  freeInstrument: (instrumentId: string) =>
    ipcRenderer.send("free-instrument", { instrumentId }),
  loadInstrumentSample: (instrumentId: string, note: number, sampleHash: string, loop?: boolean, loopStart?: number, loopEnd?: number) =>
    ipcRenderer.send("load-instrument-sample", { instrumentId, note, sampleHash, loop: !!loop, loopStart: loopStart ?? 0, loopEnd: loopEnd ?? -1 }),
  instrumentNoteOn: (instrumentId: string, note: number, velocity: number) =>
    ipcRenderer.send("instrument-note-on", { instrumentId, note, velocity }),
  instrumentNoteOff: (instrumentId: string, note: number) =>
    ipcRenderer.send("instrument-note-off", { instrumentId, note }),
  instrumentStopAll: (instrumentId: string) =>
    ipcRenderer.send("instrument-stop-all", { instrumentId }),
  setInstrumentParam: (instrumentId: string, paramId: number, value: number) =>
    ipcRenderer.send("set-instrument-param", { instrumentId, paramId, value }),
  subscribeInstrumentTelemetry: (instrumentId: string) =>
    ipcRenderer.send("subscribe-instrument-telemetry", { instrumentId }),
  unsubscribeInstrumentTelemetry: (instrumentId: string) =>
    ipcRenderer.send("unsubscribe-instrument-telemetry", { instrumentId }),

  // Mixer API (one-way renderer → main)
  mixerSetChannelGain: (channelIndex: number, gainDb: number) =>
    ipcRenderer.send("mixer-set-channel-gain", { channelIndex, gainDb }),
  mixerSetChannelPan: (channelIndex: number, pan: number) =>
    ipcRenderer.send("mixer-set-channel-pan", { channelIndex, pan }),
  mixerSetChannelMute: (channelIndex: number, mute: boolean) =>
    ipcRenderer.send("mixer-set-channel-mute", { channelIndex, mute }),
  mixerSetChannelSolo: (channelIndex: number, solo: boolean) =>
    ipcRenderer.send("mixer-set-channel-solo", { channelIndex, solo }),
  mixerAttachInstrument: (channelIndex: number, instrumentId: string) =>
    ipcRenderer.send("mixer-attach-instrument", { channelIndex, instrumentId }),
  mixerDetachChannel: (channelIndex: number) =>
    ipcRenderer.send("mixer-detach-channel", { channelIndex }),
  mixerSetMasterGain: (gainDb: number) =>
    ipcRenderer.send("mixer-set-master-gain", { gainDb }),
  mixerSetMasterMute: (mute: boolean) =>
    ipcRenderer.send("mixer-set-master-mute", { mute }),
  mixerGetState: () =>
    ipcRenderer.invoke("mixer-get-state"),

  // Instrument DB persistence (invoke-based)
  createDbInstrument: (name: string, kind: string, config?: Record<string, unknown>) =>
    ipcRenderer.invoke("create-db-instrument", name, kind, config),
  deleteDbInstrument: (name: string) =>
    ipcRenderer.invoke("delete-db-instrument", name),
  addDbInstrumentSample: (instrumentName: string, sampleHash: string, noteNumber: number, loop?: boolean, loopStart?: number, loopEnd?: number) =>
    ipcRenderer.invoke("add-db-instrument-sample", instrumentName, sampleHash, noteNumber, !!loop, loopStart ?? 0, loopEnd ?? -1),
  removeDbInstrumentSample: (instrumentName: string, sampleHash: string, noteNumber: number) =>
    ipcRenderer.invoke("remove-db-instrument-sample", instrumentName, sampleHash, noteNumber),
  listDbInstruments: () =>
    ipcRenderer.invoke("list-db-instruments"),
  getDbInstrumentSamples: (instrumentName: string) =>
    ipcRenderer.invoke("get-db-instrument-samples", instrumentName),
  getBackgroundErrors: () =>
    ipcRenderer.invoke("get-background-errors"),
  dismissBackgroundError: (id: number) =>
    ipcRenderer.invoke("dismiss-background-error", id),
  dismissAllBackgroundErrors: () =>
    ipcRenderer.invoke("dismiss-all-background-errors"),
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
  onPlaybackError: (callback: (data: { sampleHash?: string; code: string; message: string }) => void) => {
    ipcRenderer.on("playback-error", (_event, data) => callback(data));
  },
  onMixerLevels: (callback: (data: { channelPeaksL: number[]; channelPeaksR: number[]; masterPeakL: number; masterPeakR: number }) => void) => {
    ipcRenderer.on("mixer-levels", (_event, data) => callback(data));
  },

  // MIDI
  midiListInputs: () =>
    ipcRenderer.invoke("midi-list-inputs"),
  midiOpenInput: (index: number) =>
    ipcRenderer.invoke("midi-open-input", index),
  midiCloseInput: () =>
    ipcRenderer.invoke("midi-close-input"),
  midiInjectEvent: (status: number, data1: number, data2: number) =>
    ipcRenderer.invoke("midi-inject-event", status, data1, data2),
  midiStartRecording: (instrumentId: string) =>
    ipcRenderer.invoke("midi-start-recording", instrumentId),
  midiStopRecording: () =>
    ipcRenderer.invoke("midi-stop-recording"),
  midiSaveSequence: (name: string, events: unknown[], durationMs: number) =>
    ipcRenderer.invoke("midi-save-sequence", name, events, durationMs),
  midiLoadSequence: (id: number) =>
    ipcRenderer.invoke("midi-load-sequence", id),
  midiListSequences: () =>
    ipcRenderer.invoke("midi-list-sequences"),
  midiDeleteSequence: (id: number) =>
    ipcRenderer.invoke("midi-delete-sequence", id),
  midiLoadFile: (filePath: string) =>
    ipcRenderer.invoke("midi-load-file", filePath),
  midiStartPlayback: (sequenceId: number, instrumentId: string) =>
    ipcRenderer.invoke("midi-start-playback", sequenceId, instrumentId),
  midiStopPlayback: () =>
    ipcRenderer.invoke("midi-stop-playback"),
  onMidiInputEvent: (callback: (event: MidiEvent) => void) => {
    ipcRenderer.on("midi-input-event", (_event, data) => callback(data));
  },
  onMidiPlaybackEnded: (callback: (data: { sequenceId: number }) => void) => {
    ipcRenderer.on("midi-playback-ended", (_event, data) => callback(data));
  },
};

contextBridge.exposeInMainWorld("electron", api);
