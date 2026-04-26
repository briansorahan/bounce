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
import { test } from "vitest";

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

test("IpcChannel runtime checks", () => {
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
    ["AnalyzeAmpSlice", "analyze-amp-slice"],
    ["AnalyzeNoveltySlice", "analyze-novelty-slice"],
    ["AnalyzeTransientSlice", "analyze-transient-slice"],
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
    ["CompleteSampleHash", "complete-sample-hash"],
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
    ["GrainsSample", "grains-sample"],
    ["BounceGrains", "bounce-grains"],
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
    ["DefineInstrument", "define-instrument"],
    ["FreeInstrument", "free-instrument"],
    ["LoadInstrumentSample", "load-instrument-sample"],
    ["InstrumentNoteOn", "instrument-note-on"],
    ["InstrumentNoteOff", "instrument-note-off"],
    ["InstrumentStopAll", "instrument-stop-all"],
    ["SetInstrumentParam", "set-instrument-param"],
    ["SubscribeInstrumentTelemetry", "subscribe-instrument-telemetry"],
    ["UnsubscribeInstrumentTelemetry", "unsubscribe-instrument-telemetry"],
    ["MixerSetChannelGain", "mixer-set-channel-gain"],
    ["MixerSetChannelPan", "mixer-set-channel-pan"],
    ["MixerSetChannelMute", "mixer-set-channel-mute"],
    ["MixerSetChannelSolo", "mixer-set-channel-solo"],
    ["MixerAttachInstrument", "mixer-attach-instrument"],
    ["MixerDetachChannel", "mixer-detach-channel"],
    ["MixerSetMasterGain", "mixer-set-master-gain"],
    ["MixerSetMasterMute", "mixer-set-master-mute"],
    ["MixerGetState", "mixer-get-state"],
    ["GetBackgroundErrors", "get-background-errors"],
    ["DismissBackgroundError", "dismiss-background-error"],
    ["DismissAllBackgroundErrors", "dismiss-all-background-errors"],
    ["PlaybackPosition", "playback-position"],
    ["PlaybackEnded", "playback-ended"],
    ["PlaybackError", "playback-error"],
    ["OverlayNMFVisualization", "overlay-nmf-visualization"],
    ["MidiListInputs", "midi-list-inputs"],
    ["MidiOpenInput", "midi-open-input"],
    ["MidiCloseInput", "midi-close-input"],
    ["MidiInjectEvent", "midi-inject-event"],
    ["MidiStartRecording", "midi-start-recording"],
    ["MidiStopRecording", "midi-stop-recording"],
    ["MidiSaveSequence", "midi-save-sequence"],
    ["MidiLoadSequence", "midi-load-sequence"],
    ["MidiListSequences", "midi-list-sequences"],
    ["MidiDeleteSequence", "midi-delete-sequence"],
    ["MidiLoadFile", "midi-load-file"],
    ["MidiStartPlayback", "midi-start-playback"],
    ["MidiStopPlayback", "midi-stop-playback"],
    ["MidiInputEvent", "midi-input-event"],
    ["MidiPlaybackEnded", "midi-playback-ended"],
    ["CompletionRequest", "completion:request"],
    ["ForceShutdown", "force-shutdown"],
    ["TransportStart", "transport-start"],
    ["TransportStop", "transport-stop"],
    ["TransportSetBpm", "transport-set-bpm"],
    ["TransportSetPattern", "transport-set-pattern"],
    ["TransportClearPattern", "transport-clear-pattern"],
    ["TransportTick", "transport-tick"],
    ["AudioDeviceInfo", "audio-device-info"],
    ["ListAudioInputs", "list-audio-inputs"],
    ["StartRecording", "start-recording"],
    ["StopRecording", "stop-recording"],
  ];

  for (const [key, value] of expectedChannels) {
    const actual = (IpcChannel as Record<string, string>)[key];
    assert(actual === value, `IpcChannel.${key} should be "${value}" but got "${actual}"`);
  }

  assert(
    expectedChannels.length === allValues.length,
    `Expected ${expectedChannels.length} channels but IpcChannel has ${allValues.length}`,
  );
});
