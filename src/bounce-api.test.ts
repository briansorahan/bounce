import assert from "node:assert/strict";
import {
  buildBounceApi,
  BounceResult,
  Sample,
  SamplePromise,
  CurrentSamplePromise,
  OnsetFeature,
  NmfFeature,
  MfccFeature,
  VisScene,
  VisStack,
} from "./renderer/bounce-api.js";

function makeTerminal(): { lines: string[]; cleared: boolean } & object {
  const terminal = { lines: [] as string[], cleared: false };
  return Object.assign(terminal, {
    writeln: (line: string) => { terminal.lines.push(line); },
    write: (_data: string) => {},
    clear: () => { terminal.cleared = true; },
    fit: () => {},
    onData: () => {},
    focus: () => {},
    open: () => {},
  });
}

function makeAudioManager() {
  let currentAudio: Record<string, unknown> | null = null;
  let currentSlices: number[] | null = null;
  const playCalls: Array<{ audioData: Float32Array; sampleRate: number; loop: boolean; hash?: string }> = [];
  return {
    getCurrentAudio: () => currentAudio,
    setCurrentAudio: (audio: Record<string, unknown>) => { currentAudio = audio; },
    getCurrentSlices: () => currentSlices,
    setCurrentSlices: (slices: number[]) => { currentSlices = slices; },
    clearSlices: () => { currentSlices = null; },
    playAudio: async (audioData: Float32Array, sampleRate: number, loop = false, hash?: string) => {
      playCalls.push({ audioData, sampleRate, loop, hash });
    },
    stopAudio: () => {},
    getPlayCalls: () => playCalls,
  };
}

const mockElectron = {
  transpileTypeScript: async (src: string) => src,
  readAudioFile: async (path: string) => ({
    channelData: new Float32Array([0.1, 0.2, 0.3, 0.4]),
    sampleRate: 44100,
    duration: 0.001,
    hash: "abcdef1234567890",
    filePath: path,
  }),
  getSampleByHash: async (_hash: string) => ({
    id: 1,
    hash: "abcdef1234567890",
    file_path: "/test.wav",
    audio_data: Buffer.from(new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer),
    sample_rate: 44100,
    channels: 1,
    duration: 0.001,
  }),
  analyzeOnsetSlice: async () => [0, 2, 4],
  analyzeBufNMF: async () => ({
    components: 2,
    iterations: 5,
    converged: true,
    bases: [[1, 2], [3, 4]],
    activations: [[5, 6], [7, 8]],
  }),
  analyzeMFCC: async () => [[1, 2, 3], [4, 5, 6]],
  storeFeature: async () => 1,
  getMostRecentFeature: async (_sampleHash?: string, featureType?: string) => ({
    id: 1,
    sample_hash: "abcdef1234567890",
    feature_hash: featureType === "mfcc" ? "mfcc1234567890" : featureType === "nmf" ? "nmf1234567890" : "onset1234567890",
    feature_type: featureType ?? "onset-slice",
    feature_data:
      featureType === "nmf"
        ? JSON.stringify({ components: 2, bases: [[1, 2], [3, 4]], activations: [[5, 6], [7, 8]] })
        : JSON.stringify([0, 2, 4]),
    options: JSON.stringify({ components: 2, iterations: 5, numFrames: 2, numCoeffs: 3 }),
  }),
  createSliceSamples: async () => [{ hash: "slicehash1", index: 0 }, { hash: "slicehash2", index: 1 }],
  getDerivedSampleByIndex: async (_sourceHash: string, _featureHash: string, index: number) => ({
    id: index + 1,
    hash: `derived${index}`,
    file_path: null,
    audio_data: Buffer.from(new Float32Array([0.1, 0.2]).buffer),
    sample_rate: 44100,
    channels: 1,
    duration: 0.001,
  }),
  granularizeSample: async () => ({
    grainHashes: ["grain1", null, "grain2"],
    featureHash: "gran123",
    sampleRate: 44100,
    grainDuration: 0.02,
  }),
  listSamples: async () => [
    { id: 1, hash: "abcdef1234567890", file_path: "/test.wav", sample_rate: 44100, channels: 1, duration: 1.5, data_size: 100, created_at: "2024-01-01" },
  ],
  listFeatures: async () => [
    { sample_hash: "abcdef1234567890", feature_type: "onset-slice", file_path: "/test.wav", options: null, feature_count: 3, feature_hash: "onset1234567890" },
  ],
  clearDebugLogs: async () => {},
  getDebugLogs: async () => [],
  saveCommand: async () => {},
  sendCommand: async () => ({ success: true, message: "ok" }),
  nx: async () => ({ success: true, message: "ok" }),
  visualizeNMF: async () => "ok",
  sep: async () => ({ success: true, message: "Separated" }),
  corpusBuild: async () => ({ segmentCount: 3, featureDims: 13 }),
  corpusQuery: async () => [{ id: "a", index: 0, distance: 0 }],
  corpusResynthesize: async () => ({ audio: new Float32Array([0.1, 0.2]), sampleRate: 44100 }),
  onOverlayNMF: () => {},
  fsLs: async () => ({ entries: [], total: 0, truncated: false }),
  fsLa: async () => ({ entries: [], total: 0, truncated: false }),
  fsCd: async () => "/tmp",
  fsPwd: async () => "/tmp",
  fsCompletePath: async () => [],
  fsGlob: async () => [],
  fsWalk: async () => ({ entries: [], truncated: false }),
  getCommandHistory: async () => [],
  clearCommandHistory: async () => {},
  dedupeCommandHistory: async () => ({ removed: 0 }),
  debugLog: async () => {},
};

(globalThis as Record<string, unknown>).window = { electron: mockElectron };

async function main() {
  const terminal = makeTerminal() as ReturnType<typeof makeTerminal>;
  const audioManager = makeAudioManager();

  const api = buildBounceApi({
    terminal: terminal as unknown as import("./renderer/terminal.js").BounceTerminal,
    audioManager: audioManager as unknown as import("./renderer/audio-context.js").AudioManager,
  }) as Record<string, unknown>;

  assert.ok(api.sn, "api exposes sn");
  assert.ok(api.vis, "api exposes vis");
  assert.ok(!("play" in api), "api no longer exposes top-level play");
  assert.ok(!("display" in api), "api no longer exposes top-level display");

  const sn = api.sn as {
    help(): BounceResult;
    stop(): BounceResult;
    read(pathOrHash: string): SamplePromise;
    list(): PromiseLike<unknown>;
    current(): CurrentSamplePromise;
  };
  const corpus = api.corpus as {
    build(source?: string | Sample | PromiseLike<Sample>, featureHashOverride?: string): PromiseLike<BounceResult>;
  };
  const vis = api.vis as {
    help(): BounceResult;
    waveform(sample: Sample): VisScene;
    stack(): VisStack;
  };

  assert.ok(sn.help().toString().includes("sample namespace"));
  assert.ok(sn.help().toString().includes("sn.stop()"));
  assert.ok(vis.help().toString().includes("visualization namespace"));

  const sample = await sn.read("/test.wav");
  assert.ok(sample instanceof Sample, "sn.read returns Sample");
  assert.ok(sample.help().toString().includes("sample.onsets()"));
  assert.ok(sample.help().toString().includes("sample.loop()"));
  assert.ok(sample.toString().includes("Loaded"));

  const played = await sample.play();
  assert.ok(played instanceof Sample, "sample.play returns Sample");
  assert.equal(audioManager.getPlayCalls().at(-1)?.loop, false, "sample.play uses non-looping playback");
  assert.equal(audioManager.getPlayCalls().at(-1)?.hash, sample.hash, "sample.play preserves sample hash for playback tracking");

  const looped = await sample.loop();
  assert.ok(looped instanceof Sample, "sample.loop returns Sample");
  assert.ok(looped.toString().includes("Looping"), "sample.loop indicates looping playback");
  assert.equal(audioManager.getPlayCalls().at(-1)?.loop, true, "sample.loop uses looping playback");
  assert.equal(audioManager.getPlayCalls().at(-1)?.hash, sample.hash, "sample.loop preserves sample hash for playback tracking");

  const stopped = sample.stop();
  assert.ok(stopped.toString().includes("stopped"));

  const namespaceStopped = sn.stop();
  assert.ok(namespaceStopped.toString().includes("Playback stopped"), "sn.stop stops all playback");

  const onsetFeature = await sample.onsets();
  assert.ok(onsetFeature instanceof OnsetFeature, "sample.onsets returns OnsetFeature");
  assert.ok(onsetFeature.help().toString().includes("playSlice"));
  await onsetFeature.slice();
  const sliceSample = await onsetFeature.playSlice(0);
  assert.ok(sliceSample instanceof Sample, "playSlice returns Sample");

  const nmfFeature = await sample.nmf();
  assert.ok(nmfFeature instanceof NmfFeature, "sample.nmf returns NmfFeature");
  assert.ok(nmfFeature.help().toString().includes("playComponent"));
  await nmfFeature.sep();
  const componentSample = await nmfFeature.playComponent(0);
  assert.ok(componentSample instanceof Sample, "playComponent returns Sample");

  const mfccFeature = await sample.mfcc();
  assert.ok(mfccFeature instanceof MfccFeature, "sample.mfcc returns MfccFeature");
  assert.ok(mfccFeature.help().toString().includes("MFCC"));

  const scene = vis.waveform(sample);
  assert.ok(scene instanceof VisScene, "vis.waveform returns VisScene");
  assert.ok(scene.toString().includes("VisScene"), "VisScene prints a useful summary");
  assert.equal(scene.overlay(onsetFeature), scene, "scene.overlay chains");
  assert.equal(scene.panel(nmfFeature), scene, "scene.panel chains");
  assert.ok(scene.help().toString().includes("scene.show()"), "VisScene help describes show()");

  const stack = vis.stack();
  assert.ok(stack instanceof VisStack, "vis.stack returns VisStack");
  assert.ok(stack.help().toString().includes("multiple visualization scenes"), "VisStack help describes multi-scene usage");
  assert.equal(stack.waveform(sample), stack, "stack.waveform chains");
  assert.equal(stack.overlay(onsetFeature), stack, "stack.overlay chains on latest scene");
  assert.equal(stack.panel(nmfFeature), stack, "stack.panel chains on latest scene");
  assert.equal(stack.waveform(sample), stack, "stack accepts multiple scenes");
  assert.ok(stack.toString().includes("scenes: 2"), "VisStack prints scene count");

  const grains = await sample.granularize({ grainSize: 20 });
  assert.ok(grains.toString().includes("grains"));

  const listed = await sn.list();
  assert.ok(String(listed).includes("Stored Samples"));

  const current = await sn.current();
  assert.ok(current instanceof Sample, "sn.current returns Sample");

  const chainedOnsetFeature = await sn.read("/test.wav").onsets();
  assert.ok(chainedOnsetFeature instanceof OnsetFeature, "sn.read().onsets() returns OnsetFeature");

  const chainedSliceResult = await sn.read("/test.wav").onsets().slice();
  assert.ok(chainedSliceResult instanceof BounceResult, "sn.read().onsets().slice() returns BounceResult");

  const chainedComponent = await sn.read("/test.wav").nmf().playComponent(0);
  assert.ok(chainedComponent instanceof Sample, "sn.read().nmf().playComponent() returns Sample");

  const currentPlayed = await sn.current().play();
  assert.ok(currentPlayed instanceof Sample, "sn.current().play() returns Sample");

  const grainCount = await sn.read("/test.wav").granularize({ grainSize: 20 }).length();
  assert.equal(grainCount, 2, "sn.read().granularize().length() counts non-silent grains");

  const corpusBuilt = await corpus.build(sn.read("/test.wav"));
  assert.ok(corpusBuilt instanceof BounceResult, "corpus.build accepts thenable sample sources");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
