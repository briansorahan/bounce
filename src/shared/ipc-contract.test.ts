import type {
  IpcHandleContract,
  IpcSendContract,
  IpcPushContract,
  HandleChannel,
  SendChannel,
  PushChannel,
  ElectronAPI,
  IpcChannelName,
} from "./ipc-contract";
import { IpcChannel } from "./ipc-contract";

function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Compile-time exhaustiveness: every contract key has a matching constant
// ---------------------------------------------------------------------------

type AssertAllHandleChannelsHaveConstants = {
  [K in HandleChannel]: K extends IpcChannelName ? true : never;
};

type AssertAllSendChannelsHaveConstants = {
  [K in SendChannel]: K extends IpcChannelName ? true : never;
};

type AssertAllPushChannelsHaveConstants = {
  [K in PushChannel]: K extends IpcChannelName ? true : never;
};

// Force TypeScript to evaluate the assertion types (compilation fails if any value is `never`)
const _handleCheck: AssertAllHandleChannelsHaveConstants = null as unknown as AssertAllHandleChannelsHaveConstants;
const _sendCheck: AssertAllSendChannelsHaveConstants = null as unknown as AssertAllSendChannelsHaveConstants;
const _pushCheck: AssertAllPushChannelsHaveConstants = null as unknown as AssertAllPushChannelsHaveConstants;

// Verify contract entries have the expected shape
type AssertHandleShape = {
  [K in HandleChannel]: IpcHandleContract[K] extends { request: unknown[]; response: unknown } ? true : never;
};
const _handleShapeCheck: AssertHandleShape = null as unknown as AssertHandleShape;

type AssertSendShape = {
  [K in SendChannel]: IpcSendContract[K] extends { data: unknown } ? true : never;
};
const _sendShapeCheck: AssertSendShape = null as unknown as AssertSendShape;

type AssertPushShape = {
  [K in PushChannel]: IpcPushContract[K] extends { data: unknown } ? true : never;
};
const _pushShapeCheck: AssertPushShape = null as unknown as AssertPushShape;

// Verify ElectronAPI is a valid interface with expected properties
type AssertElectronAPIIsObject = ElectronAPI extends object ? true : never;
const _apiCheck: AssertElectronAPIIsObject = true;
type AssertElectronAPIHasVersion = ElectronAPI["version"] extends string ? true : never;
const _apiVersionCheck: AssertElectronAPIHasVersion = true;

// Suppress unused variable warnings
void _handleCheck;
void _sendCheck;
void _pushCheck;
void _handleShapeCheck;
void _sendShapeCheck;
void _pushShapeCheck;
void _apiCheck;
void _apiVersionCheck;

// ---------------------------------------------------------------------------
// Runtime: channel constants are unique and non-empty
// ---------------------------------------------------------------------------

const allValues = Object.values(IpcChannel);
assert(allValues.length > 0, "IpcChannel should have values");

const uniqueValues = new Set(allValues);
assert(uniqueValues.size === allValues.length, `IpcChannel values should be unique (got ${allValues.length}, unique ${uniqueValues.size})`);

for (const [key, value] of Object.entries(IpcChannel)) {
  assert(typeof value === "string", `IpcChannel.${key} should be a string`);
  assert(value.length > 0, `IpcChannel.${key} should be non-empty`);
}

// ---------------------------------------------------------------------------
// Runtime: spot-check specific channel values
// ---------------------------------------------------------------------------

const expectedChannels: Array<[string, string]> = [
  ["ReadAudioFile", "read-audio-file"],
  ["AnalyzeOnsetSlice", "analyze-onset-slice"],
  ["AnalyzeBufNMF", "analyze-buf-nmf"],
  ["AnalyzeMFCC", "analyze-mfcc"],
  ["GetCurrentProject", "get-current-project"],
  ["ListProjects", "list-projects"],
  ["LoadProject", "load-project"],
  ["RemoveProject", "remove-project"],
  ["SaveCommand", "save-command"],
  ["GetCommandHistory", "get-command-history"],
  ["ClearCommandHistory", "clear-command-history"],
  ["DedupeCommandHistory", "dedupe-command-history"],
  ["SaveReplEnv", "save-repl-env"],
  ["GetReplEnv", "get-repl-env"],
  ["DebugLog", "debug-log"],
  ["GetDebugLogs", "get-debug-logs"],
  ["ClearDebugLogs", "clear-debug-logs"],
  ["StoreFeature", "store-feature"],
  ["GetMostRecentFeature", "get-most-recent-feature"],
  ["CreateSliceSamples", "create-slice-samples"],
  ["GetDerivedSamples", "get-derived-samples"],
  ["GetDerivedSampleByIndex", "get-derived-sample-by-index"],
  ["ListDerivedSamplesSummary", "list-derived-samples-summary"],
  ["ListSamples", "list-samples"],
  ["ListFeatures", "list-features"],
  ["GetSampleByHash", "get-sample-by-hash"],
  ["GetSampleByName", "get-sample-by-name"],
  ["StoreRecording", "store-recording"],
  ["GranularizeSample", "granularize-sample"],
  ["SendCommand", "send-command"],
  ["AnalyzeNMF", "analyze-nmf"],
  ["VisualizeNMF", "visualize-nmf"],
  ["Sep", "sep"],
  ["Nx", "nx"],
  ["TranspileTypeScript", "transpile-typescript"],
  ["CorpusBuild", "corpus-build"],
  ["CorpusQuery", "corpus-query"],
  ["CorpusResynthesize", "corpus-resynthesize"],
  ["FsLs", "fs-ls"],
  ["FsCd", "fs-cd"],
  ["FsPwd", "fs-pwd"],
  ["FsCompletePath", "fs-complete-path"],
  ["FsGlob", "fs-glob"],
  ["FsWalk", "fs-walk"],
  ["PlaySample", "play-sample"],
  ["StopSample", "stop-sample"],
  ["PlaybackPosition", "playback-position"],
  ["PlaybackEnded", "playback-ended"],
  ["OverlayNMFVisualization", "overlay-nmf-visualization"],
];

for (const [key, value] of expectedChannels) {
  const actual = (IpcChannel as Record<string, string>)[key];
  assert(actual === value, `IpcChannel.${key} should be "${value}" but got "${actual}"`);
}

assert(
  expectedChannels.length === allValues.length,
  `Expected ${expectedChannels.length} channels but IpcChannel has ${allValues.length}`,
);

console.log("All IPC contract tests passed");
process.exit(0);
