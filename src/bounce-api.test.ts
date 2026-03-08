import assert from "node:assert/strict";
import { buildBounceApi } from "./renderer/bounce-api.js";

// --- Minimal stubs --------------------------------------------------------

function makeTerminal(): { lines: string[]; cleared: boolean } & object {
  const terminal = { lines: [] as string[], cleared: false };
  return Object.assign(terminal, {
    writeln: (line: string) => { terminal.lines.push(line); },
    write: (_data: string) => {},
    clear: () => { terminal.cleared = true; },
    onData: () => {},
    focus: () => {},
    open: () => {},
  });
}

function makeAudioManager() {
  let currentAudio: object | null = null;
  let currentSlices: number[] | null = null;
  return {
    getCurrentAudio: () => currentAudio,
    setCurrentAudio: (audio: object) => { currentAudio = audio; },
    getCurrentSlices: () => currentSlices,
    setCurrentSlices: (slices: number[]) => { currentSlices = slices; },
    clearSlices: () => { currentSlices = null; },
    playAudio: async () => {},
    stopAudio: () => {},
  };
}

// Minimal window.electron mock
const mockElectron = {
  transpileTypeScript: (src: string) => src,
  readAudioFile: async (path: string) => ({
    channelData: new Float32Array([0.1, 0.2]),
    sampleRate: 44100,
    duration: 0.001,
    hash: "abcdef1234567890",
    filePath: path,
  }),
  listSamples: async () => [
    { id: 1, hash: "abcdef12", file_path: "/test.wav", sample_rate: 44100, channels: 1, duration: 1.5, data_size: 100, created_at: "2024-01-01" },
  ],
  clearDebugLogs: async () => {},
  getDebugLogs: async (limit: number = 5) => [
    { id: 1, level: "info", message: "test", data: null, timestamp: Date.now(), created_at: "2024-01-01" },
  ].slice(0, limit),
  stopAudio: () => {},
  debugLog: async () => {},
};

// Inject into global scope
(globalThis as Record<string, unknown>).window = { electron: mockElectron };

// --- Tests ----------------------------------------------------------------

async function main() {
  console.log("bounce-api tests");

  const terminal = makeTerminal() as ReturnType<typeof makeTerminal>;
  const audioManager = makeAudioManager();
  let waveformUpdated = false;

  const api = buildBounceApi({
    terminal: terminal as unknown as import("./renderer/terminal.js").BounceTerminal,
    audioManager: audioManager as unknown as import("./renderer/audio-context.js").AudioManager,
    onUpdateWaveform: () => { waveformUpdated = true; },
    onHideWaveform: () => {},
  }) as Record<string, (...args: unknown[]) => unknown>;

  // help() prints to terminal
  (api.help as () => void)();
  assert.ok(terminal.lines.some(l => l.includes("display")), "help lists display");
  assert.ok(terminal.lines.some(l => l.includes("debug")), "help lists debug");
  terminal.lines.length = 0;

  // clear() clears terminal
  (api.clear as () => void)();
  assert.equal(terminal.cleared, true, "clear() calls terminal.clear");

  // stop() works even with no audio
  (api.stop as () => void)();
  assert.ok(terminal.lines.some(l => l.includes("stopped")), "stop() prints message");
  terminal.lines.length = 0;

  // display() loads audio and updates waveform
  waveformUpdated = false;
  await (api.display as (path: string) => Promise<void>)("/test.wav");
  assert.equal(waveformUpdated, true, "display() triggers waveform update");
  assert.ok(terminal.lines.some(l => l.includes("Loaded")), "display() prints loaded message");
  terminal.lines.length = 0;

  // list() returns samples and prints them
  const samples = await (api.list as () => Promise<unknown[]>)();
  assert.equal(samples.length, 1, "list() returns 1 sample");
  assert.ok(terminal.lines.some(l => l.includes("test.wav")), "list() prints sample file");
  terminal.lines.length = 0;

  // clearDebug() clears logs
  await (api.clearDebug as () => Promise<void>)();
  assert.ok(terminal.lines.some(l => l.includes("cleared")), "clearDebug() prints confirmation");
  terminal.lines.length = 0;

  // debug() returns logs
  const logs = await (api.debug as (limit?: number) => Promise<unknown[]>)(5);
  assert.equal(logs.length, 1, "debug() returns log entries");
  terminal.lines.length = 0;

  // play() without audio loaded throws
  audioManager.setCurrentAudio(null as unknown as object);
  await assert.rejects(
    async () => (api.play as () => Promise<void>)(),
    /No audio loaded/,
    "play() without audio throws",
  );

  console.log("  All bounce-api tests passed ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
