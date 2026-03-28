import assert from "node:assert/strict";
import { getCallablePropertyNames } from "./renderer/runtime-introspection.js";
import { BounceResult } from "./renderer/results/base.js";
import type { CommandHelp } from "./renderer/help.js";

import { buildBounceApi } from "./renderer/bounce-api.js";
import { fsCommands } from "./renderer/namespaces/fs-namespace.js";
import { visCommands } from "./renderer/namespaces/vis-namespace.js";
import { envCommands } from "./renderer/namespaces/env-namespace.js";
import { projectCommands } from "./renderer/namespaces/project-namespace.js";
import { sampleNamespaceCommands } from "./renderer/namespaces/sample-namespace.js";
import { corpusCommands } from "./renderer/namespaces/corpus-namespace.js";
import { midiCommands } from "./renderer/namespaces/midi-namespace.js";
import { transportCommands } from "./renderer/namespaces/transport-namespace.js";
import { patCommands } from "./renderer/namespaces/pat-namespace.js";
import { mixerCommands } from "./renderer/namespaces/mixer-namespace.js";
import { instCommands } from "./renderer/namespaces/instrument-namespace.js";
import { globalCommands } from "./renderer/namespaces/globals.js";

// ---------------------------------------------------------------------------
// Minimal mocks
// ---------------------------------------------------------------------------

function makeTerminal() {
  return {
    writeln: () => {},
    write: () => {},
    clear: () => {},
    fit: () => {},
    onData: () => {},
    focus: () => {},
    open: () => {},
  };
}

function makeAudioManager() {
  return {
    getCurrentAudio: () => null,
    setCurrentAudio: () => {},
    getCurrentSlices: () => null,
    setCurrentSlices: () => {},
    clearSlices: () => {},
    playAudio: async () => {},
    stopAudio: () => {},
  };
}

const noop = () => {};
const asyncNoop = async () => ({});

const mockElectron: Record<string, unknown> = {
  transpileTypeScript: async (src: string) => src,
  readAudioFile: async () => ({
    channelData: new Float32Array([0]),
    sampleRate: 44100,
    duration: 0.001,
    hash: "abc123",
    filePath: "/test.wav",
  }),
  getSampleByHash: async () => null,
  analyzeOnsetSlice: async () => [0],
  analyzeBufNMF: async () => ({ components: 1, iterations: 1, converged: true, bases: [[1]], activations: [[1]] }),
  analyzeMFCC: async () => [[1]],
  storeFeature: async () => 1,
  getMostRecentFeature: async () => null,
  createSliceSamples: async () => [],
  getDerivedSampleByIndex: async () => null,
  granularizeSample: async () => ({ grainHashes: [], featureHash: "g1", sampleRate: 44100, grainDuration: 0.02 }),
  listSamples: async () => [],
  listFeatures: async () => [],
  clearDebugLogs: asyncNoop,
  getDebugLogs: async () => [],
  saveCommand: asyncNoop,
  sendCommand: async () => ({ success: true, message: "ok" }),
  getCurrentProject: async () => ({ id: 1, name: "default", created_at: "", sample_count: 0, feature_count: 0, command_count: 0, current: true }),
  listProjects: async () => [],
  loadProject: async () => ({ id: 1, name: "test", created_at: "", sample_count: 0, feature_count: 0, command_count: 0, current: true }),
  removeProject: async () => ({ removedName: "test", currentProject: null }),
  nx: asyncNoop,
  visualizeNMF: asyncNoop,
  sep: asyncNoop,
  corpusBuild: asyncNoop,
  corpusQuery: async () => [],
  corpusResynthesize: async () => ({ audio: new Float32Array([0]), sampleRate: 44100 }),
  onOverlayNMF: noop,
  fsLs: async () => ({ entries: [], total: 0, truncated: false }),
  fsLa: async () => ({ entries: [], total: 0, truncated: false }),
  fsCd: async () => "/tmp",
  fsPwd: async () => "/tmp",
  fsCompletePath: async () => [],
  fsGlob: async () => [],
  fsWalk: async () => ({ entries: [], truncated: false }),
  getCommandHistory: async () => [],
  clearCommandHistory: asyncNoop,
  dedupeCommandHistory: async () => ({ removed: 0 }),
  debugLog: asyncNoop,
  saveReplEnv: asyncNoop,
  getReplEnv: async () => [],
  getSampleByName: async () => null,
  storeRecording: async () => ({ status: "ok", hash: "rec1", id: 1, sampleRate: 44100, channels: 1, duration: 1, filePath: "/test.wav" }),
  getBackgroundErrors: async () => [],
  dismissBackgroundError: async () => true,
  dismissAllBackgroundErrors: async () => 0,
  // Event listeners called during namespace construction
  onTransportTick: noop,
  onMidiPlaybackEnded: noop,
  onMixerLevels: noop,
  onMidiEvent: noop,
  // Mixer
  mixerGetState: async () => null,
  mixerSetChannelGain: noop,
  mixerSetChannelPan: noop,
  mixerSetChannelMute: noop,
  mixerSetChannelSolo: noop,
  mixerSetMasterGain: noop,
  mixerSetMasterMute: noop,
  mixerAttachInstrument: noop,
  mixerDetachChannel: noop,
  // Transport
  transportSetBpm: noop,
  transportStart: noop,
  transportStop: noop,
  // MIDI
  midiListInputs: async () => [],
  midiOpenInput: async () => ({ name: "test" }),
  midiCloseInput: asyncNoop,
  midiStartRecording: asyncNoop,
  midiStopRecording: async () => [],
  midiSaveSequence: asyncNoop,
  midiListSequences: async () => [],
  midiLoadFile: async () => ({ events: [], durationMs: 0 }),
  midiInjectEvent: asyncNoop,
  // Instruments
  createInstrument: async () => ({ instrumentId: "test-1" }),
  loadInstrumentSample: asyncNoop,
  instrumentNoteOn: noop,
  instrumentNoteOff: noop,
  instrumentStopAll: noop,
  freeInstrument: noop,
  setInstrumentParam: noop,
  listDbInstruments: async () => [],
  getDbInstrument: async () => null,
  addDbInstrumentSample: asyncNoop,
  deleteDbInstrument: asyncNoop,
  // Audio devices
  listAudioInputDevices: async () => [],
  selectAudioInputDevice: asyncNoop,
  startRecording: asyncNoop,
  stopRecording: async () => ({ audioData: [], sampleRate: 44100, channels: 1, duration: 0, deviceName: "test" }),
};

(globalThis as Record<string, unknown>).window = { electron: mockElectron };

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------

// Properties to skip when checking for .help on namespace commands.
// These are either test-only helpers or non-command properties.
const SKIP_PROPERTIES: Record<string, Set<string>> = {
  midi: new Set(["__injectEvent"]),
};

interface NamespaceSpec {
  key: string;
  commands: CommandHelp[];
}

const NAMESPACES: Record<string, NamespaceSpec> = {
  sn:        { key: "sn",        commands: sampleNamespaceCommands },
  vis:       { key: "vis",       commands: visCommands },
  fs:        { key: "fs",        commands: fsCommands },
  proj:      { key: "proj",      commands: projectCommands },
  env:       { key: "env",       commands: envCommands },
  corpus:    { key: "corpus",    commands: corpusCommands },
  midi:      { key: "midi",      commands: midiCommands },
  transport: { key: "transport", commands: transportCommands },
  pat:       { key: "pat",       commands: patCommands },
  mx:        { key: "mx",        commands: mixerCommands },
  inst:      { key: "inst",      commands: instCommands },
};

async function main() {
  const api = buildBounceApi({
    terminal: makeTerminal() as unknown as import("./renderer/terminal.js").BounceTerminal,
    audioManager: makeAudioManager() as unknown as import("./renderer/audio-context.js").AudioManager,
  }) as Record<string, unknown>;

  let totalChecks = 0;

  // --- Namespace checks ---
  for (const [name, spec] of Object.entries(NAMESPACES)) {
    const ns = api[spec.key];
    assert.ok(ns, `api exposes ${name}`);
    const nsObj = ns as Record<string, unknown>;
    const skip = SKIP_PROPERTIES[name] ?? new Set();

    // 1. Namespace has help()
    assert.equal(typeof nsObj.help, "function", `${name}.help() exists`);
    totalChecks++;

    // 2. Every callable property (except help) has .help
    const callables = getCallablePropertyNames(nsObj as object)
      .filter((n) => n !== "help" && !skip.has(n));

    for (const cmdName of callables) {
      const cmd = nsObj[cmdName] as Record<string, unknown>;
      assert.equal(
        typeof cmd.help,
        "function",
        `${name}.${cmdName}.help() exists`,
      );
      totalChecks++;
    }

    // 3. Namespace help() mentions every command from the commands array
    const helpResult = (nsObj.help as () => BounceResult)();
    assert.ok(helpResult instanceof BounceResult, `${name}.help() returns BounceResult`);
    const helpText = helpResult.toString();

    for (const cmd of spec.commands) {
      assert.ok(
        helpText.includes(cmd.name),
        `${name}.help() mentions command "${cmd.name}"`,
      );
      totalChecks++;
    }

    // 4. Commands array covers all callables
    const commandNames = new Set(spec.commands.map((c) => c.name));
    for (const cmdName of callables) {
      assert.ok(
        commandNames.has(cmdName),
        `${name}.${cmdName} is in the commands array`,
      );
      totalChecks++;
    }
  }

  // --- Global function checks ---
  for (const cmd of globalCommands) {
    // Skip nested sub-commands (e.g. errors.dismiss) — they live under their parent
    if (cmd.name.includes(".")) continue;

    const fn = api[cmd.name] as Record<string, unknown> | undefined;
    assert.ok(fn, `global ${cmd.name} exists`);
    assert.equal(
      typeof fn!.help,
      "function",
      `${cmd.name}.help() exists`,
    );
    totalChecks++;
  }

  // Verify errors sub-commands
  const errors = api.errors as Record<string, unknown>;
  assert.equal(typeof errors.dismiss, "function", "errors.dismiss exists");
  assert.equal(
    typeof (errors.dismiss as Record<string, unknown>).help,
    "function",
    "errors.dismiss.help() exists",
  );
  totalChecks++;
  assert.equal(typeof errors.dismissAll, "function", "errors.dismissAll exists");
  assert.equal(
    typeof (errors.dismissAll as Record<string, unknown>).help,
    "function",
    "errors.dismissAll.help() exists",
  );
  totalChecks++;

  console.log(`help-system.test.ts: all ${totalChecks} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
