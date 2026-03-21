import assert from "node:assert/strict";
import {
  buildBounceApi,
  BounceResult,
  Sample,
  SamplePromise,
  CurrentSamplePromise,
  OnsetFeature,
  OnsetFeaturePromise,
  NmfFeature,
  NmfFeaturePromise,
  MfccFeature,
  EnvScopeResult,
  EnvInspectionResult,
  EnvFunctionListResult,
  VisScene,
  VisScenePromise,
  VisStack,
  InputsResult,
  AudioDevice,
  RecordingHandle,
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
  const playCalls: Array<{ audioData: Float32Array; sampleRate: number; loop: boolean; hash?: string; loopStart?: number; loopEnd?: number }> = [];
  return {
    getCurrentAudio: () => currentAudio,
    setCurrentAudio: (audio: Record<string, unknown>) => { currentAudio = audio; },
    getCurrentSlices: () => currentSlices,
    setCurrentSlices: (slices: number[]) => { currentSlices = slices; },
    clearSlices: () => { currentSlices = null; },
    playAudio: async (audioData: Float32Array, sampleRate: number, loop = false, hash?: string, loopStart?: number, loopEnd?: number) => {
      playCalls.push({ audioData, sampleRate, loop, hash, loopStart, loopEnd });
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
  getCurrentProject: async () => ({
    id: 1,
    name: "default",
    created_at: "2026-03-16 00:00:00",
    sample_count: 1,
    feature_count: 1,
    command_count: 0,
    current: true,
  }),
  listProjects: async () => [
    {
      id: 1,
      name: "default",
      created_at: "2026-03-16 00:00:00",
      sample_count: 1,
      feature_count: 1,
      command_count: 0,
      current: true,
    },
    {
      id: 2,
      name: "drums",
      created_at: "2026-03-16 00:01:00",
      sample_count: 4,
      feature_count: 3,
      command_count: 8,
      current: false,
    },
  ],
  loadProject: async (name: string) => ({
    id: name === "drums" ? 2 : 3,
    name,
    created_at: "2026-03-16 00:01:00",
    sample_count: 0,
    feature_count: 0,
    command_count: 0,
    current: true,
  }),
  removeProject: async (name: string) => ({
    removedName: name,
    currentProject: {
      id: 1,
      name: "default",
      created_at: "2026-03-16 00:00:00",
      sample_count: 1,
      feature_count: 1,
      command_count: 0,
      current: true,
    },
  }),
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
  saveReplEnv: async () => {},
  getReplEnv: async () => [],
  getSampleByName: async (_name: string) => null,
  storeRecording: async (
    name: string,
    _audioData: number[],
    sampleRate: number,
    channels: number,
    duration: number,
    _overwrite: boolean,
  ) => ({
    status: "ok" as const,
    hash: "rec123abc",
    id: 99,
    sampleRate,
    channels,
    duration,
    filePath: name,
  }),
};

(globalThis as Record<string, unknown>).window = { electron: mockElectron };

async function main() {
  const terminal = makeTerminal() as ReturnType<typeof makeTerminal>;
  const audioManager = makeAudioManager();
  const runtimeScope = new Map<string, unknown>([
    ["answer", 42],
    ["label", "kick"],
    ["sayHi", function sayHi() { return "hi"; }],
  ]);

  const api = buildBounceApi({
    terminal: terminal as unknown as import("./renderer/terminal.js").BounceTerminal,
    audioManager: audioManager as unknown as import("./renderer/audio-context.js").AudioManager,
    runtime: {
      listScopeEntries: () =>
        [...runtimeScope.entries()].map(([name, value]) => ({ name, value })),
      hasScopeValue: (name: string) => runtimeScope.has(name),
      getScopeValue: (name: string) => runtimeScope.get(name),
      serializeScope: () => [],
    },
  }) as Record<string, unknown>;

  assert.ok(api.sn, "api exposes sn");
  assert.ok(api.env, "api exposes env");
  assert.ok(api.proj, "api exposes proj");
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
  const env = api.env as {
    help(): BounceResult;
    vars(): EnvScopeResult;
    globals(): EnvScopeResult;
    inspect(nameOrValue: unknown): EnvInspectionResult;
    functions(nameOrValue?: unknown): EnvFunctionListResult;
  };
  const vis = api.vis as {
    help(): BounceResult;
    waveform(sample: Sample | PromiseLike<Sample>): VisScene | VisScenePromise;
    stack(): VisStack;
  };
  const proj = api.proj as {
    help(): BounceResult;
    current(): Promise<ProjectResultLike>;
    list(): Promise<BounceResult>;
    load(name: string): Promise<ProjectResultLike>;
    rm(name: string): Promise<BounceResult>;
  };

  interface ProjectResultLike {
    name: string;
    current: boolean;
    help(): BounceResult;
    toString(): string;
  }

  assert.ok(sn.help().toString().includes("sample namespace"));
  assert.ok(env.help().toString().includes("runtime introspection namespace"));
  assert.ok(sn.help().toString().includes("sn.stop()"));
  assert.ok(proj.help().toString().includes("project namespace"));
  assert.ok(vis.help().toString().includes("visualization namespace"));

  const varsResult = env.vars();
  assert.ok(varsResult instanceof EnvScopeResult, "env.vars returns EnvScopeResult");
  assert.ok(varsResult.toString().includes("answer"));
  assert.ok(varsResult.toString().includes("sayHi"));

  const globalsResult = env.globals();
  assert.ok(globalsResult instanceof EnvScopeResult, "env.globals returns EnvScopeResult");
  assert.ok(globalsResult.toString().includes("sn"));
  assert.ok(globalsResult.toString().includes("env"));

  const inspectVar = env.inspect("answer");
  assert.ok(inspectVar instanceof EnvInspectionResult, "env.inspect returns EnvInspectionResult");
  assert.ok(inspectVar.toString().includes("type:      number"));
  assert.ok(inspectVar.toString().includes("scope:     user"));

  const inspectGlobal = env.inspect("sn");
  assert.ok(inspectGlobal.toString().includes("scope:     global"));

  const userFunctionList = env.functions();
  assert.ok(userFunctionList instanceof EnvFunctionListResult, "env.functions() returns EnvFunctionListResult");
  assert.ok(userFunctionList.toString().includes("sayHi()"), "env.functions() lists user-defined functions");
  assert.ok(!userFunctionList.toString().includes("answer"), "env.functions() excludes non-function scope vars");

  const functionList = env.functions("sn");
  assert.ok(functionList instanceof EnvFunctionListResult, "env.functions returns EnvFunctionListResult");
  assert.ok(functionList.toString().includes("read()"));
  assert.ok(functionList.toString().includes("current()"));

  const sample = await sn.read("/test.wav");
  assert.ok(sample instanceof Sample, "sn.read returns Sample");
  assert.ok(sample.help().toString().includes("sample.onsets()"));
  assert.ok(sample.help().toString().includes("sample.loop("), "sample.help() mentions loop method");
  assert.ok(sample.help().toString().includes("sample.loop.help()"), "sample.help() hints at loop.help()");
  assert.ok(sample.toString().includes("Loaded"));
  runtimeScope.set("samp", sample);
  const inspectSample = env.inspect("samp");
  assert.ok(inspectSample.toString().includes("type:      Sample"));
  assert.ok(inspectSample.toString().includes("Loaded"));

  const played = await sample.play();
  assert.ok(played instanceof Sample, "sample.play returns Sample");
  assert.equal(audioManager.getPlayCalls().at(-1)?.loop, false, "sample.play uses non-looping playback");
  assert.equal(audioManager.getPlayCalls().at(-1)?.hash, sample.hash, "sample.play preserves sample hash for playback tracking");

  const looped = await sample.loop();
  assert.ok(looped instanceof Sample, "sample.loop returns Sample");
  assert.ok(looped.toString().includes("Looping"), "sample.loop indicates looping playback");
  assert.equal(audioManager.getPlayCalls().at(-1)?.loop, true, "sample.loop uses looping playback");
  assert.equal(audioManager.getPlayCalls().at(-1)?.hash, sample.hash, "sample.loop preserves sample hash for playback tracking");

  const loopHelp = sample.loop.help();
  assert.ok(loopHelp.toString().includes("loopStart"), "sample.loop.help() shows loopStart option");
  assert.ok(loopHelp.toString().includes("loopEnd"), "sample.loop.help() shows loopEnd option");
  assert.ok(loopHelp.toString().includes("seconds"), "sample.loop.help() mentions seconds");

  const loopedWithStart = await sample.loop({ loopStart: 0.5 });
  assert.ok(loopedWithStart instanceof Sample, "sample.loop({ loopStart }) returns Sample");
  assert.equal(audioManager.getPlayCalls().at(-1)?.loopStart, 0.5, "sample.loop passes loopStart");
  assert.equal(audioManager.getPlayCalls().at(-1)?.loopEnd, undefined, "sample.loop omits loopEnd when not set");
  assert.ok(loopedWithStart.toString().includes("0.5s"), "sample.loop result shows loop start");

  const loopedWithRange = await sample.loop({ loopStart: 0.5, loopEnd: 2.0 });
  assert.ok(loopedWithRange instanceof Sample, "sample.loop({ loopStart, loopEnd }) returns Sample");
  assert.equal(audioManager.getPlayCalls().at(-1)?.loopStart, 0.5, "sample.loop passes loopStart");
  assert.equal(audioManager.getPlayCalls().at(-1)?.loopEnd, 2.0, "sample.loop passes loopEnd");
  assert.ok(loopedWithRange.toString().includes("0.5s"), "sample.loop result shows loop range start");
  assert.ok(loopedWithRange.toString().includes("2s"), "sample.loop result shows loop range end");

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

  const samplePromise = sn.read("abcdef1234567890");
  const scenePromise = vis.waveform(samplePromise);
  assert.ok(scenePromise instanceof VisScenePromise, "vis.waveform(SamplePromise) returns VisScenePromise");
  assert.ok(vis.waveform(samplePromise).title("test") instanceof VisScenePromise, "VisScenePromise.title chains");
  assert.ok(vis.waveform(samplePromise).overlay(onsetFeature) instanceof VisScenePromise, "VisScenePromise.overlay chains");
  assert.ok(vis.waveform(samplePromise).panel(nmfFeature) instanceof VisScenePromise, "VisScenePromise.panel chains");
  assert.equal(typeof scenePromise.show, "function", "VisScenePromise exposes show()");

  // VisScene / VisScenePromise / VisStack accept promise-typed feature args
  const onsetPromise = sample.onsets();
  const nmfPromise = sample.nmf();
  assert.ok(onsetPromise instanceof OnsetFeaturePromise, "sample.onsets() returns OnsetFeaturePromise");
  assert.ok(nmfPromise instanceof NmfFeaturePromise, "sample.nmf() returns NmfFeaturePromise");

  // Use already-resolved promises for population tests so one microtask flush is sufficient
  const resolvedOnsetPromise: PromiseLike<OnsetFeature> = Promise.resolve(onsetFeature);
  const resolvedNmfPromise: PromiseLike<NmfFeature> = Promise.resolve(nmfFeature);

  // VisScene.overlay / panel accept PromiseLike feature args, return same VisScene
  const sceneWithPromiseOverlay = vis.waveform(sample) as VisScene;
  assert.ok(sceneWithPromiseOverlay instanceof VisScene, "vis.waveform(sample) still returns VisScene");
  assert.equal(sceneWithPromiseOverlay.overlay(onsetPromise), sceneWithPromiseOverlay, "VisScene.overlay(OnsetFeaturePromise) chains and returns same VisScene");
  assert.equal(sceneWithPromiseOverlay.panel(nmfPromise), sceneWithPromiseOverlay, "VisScene.panel(NmfFeaturePromise) chains and returns same VisScene");

  const scene2 = vis.waveform(sample) as VisScene;
  scene2.overlay(resolvedOnsetPromise);
  scene2.panel(resolvedNmfPromise);
  await Promise.resolve(); // drain one microtask tick so the .then() handlers fire
  assert.equal(scene2.overlays.length, 1, "VisScene.overlay(promise) populates overlays once resolved");
  assert.equal(scene2.panels.length, 1, "VisScene.panel(promise) populates panels once resolved");

  // VisScenePromise.overlay / panel accept PromiseLike feature args, return VisScenePromise
  const scenePromiseWithPromiseOverlay = vis.waveform(samplePromise);
  assert.ok(scenePromiseWithPromiseOverlay instanceof VisScenePromise, "VisScenePromise with promise overlay is still VisScenePromise");
  assert.ok(scenePromiseWithPromiseOverlay.overlay(onsetPromise) instanceof VisScenePromise, "VisScenePromise.overlay(OnsetFeaturePromise) chains");
  assert.ok(scenePromiseWithPromiseOverlay.panel(nmfPromise) instanceof VisScenePromise, "VisScenePromise.panel(NmfFeaturePromise) chains");

  // VisStack.overlay / panel accept PromiseLike feature args, return same VisStack
  const stack2 = vis.stack();
  stack2.waveform(sample);
  assert.equal(stack2.overlay(onsetPromise), stack2, "VisStack.overlay(OnsetFeaturePromise) chains and returns same VisStack");
  assert.equal(stack2.panel(nmfPromise), stack2, "VisStack.panel(NmfFeaturePromise) chains and returns same VisStack");

  const stack3 = vis.stack();
  stack3.waveform(sample);
  stack3.overlay(resolvedOnsetPromise);
  stack3.panel(resolvedNmfPromise);
  await Promise.resolve();
  assert.equal(stack3.scenes[0].overlays.length, 1, "VisStack.overlay(promise) populates latest scene overlays once resolved");
  assert.equal(stack3.scenes[0].panels.length, 1, "VisStack.panel(promise) populates latest scene panels once resolved");

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

  const currentProject = await proj.current();
  assert.equal(currentProject.name, "default", "proj.current returns active project");
  assert.equal(currentProject.current, true, "current project is marked current");
  assert.ok(currentProject.help().toString().includes("proj.list()"));

  const projectList = await proj.list();
  assert.ok(String(projectList).includes("Projects"), "proj.list prints project table");
  assert.ok(String(projectList).includes("drums"), "proj.list includes named projects");

  const loadedProject = await proj.load("drums");
  assert.equal(loadedProject.name, "drums", "proj.load switches projects");
  assert.ok(loadedProject.toString().includes("Loaded Project"), "proj.load prints useful summary");

  const removeResult = await proj.rm("drums");
  assert.ok(removeResult.toString().includes("Removed project drums"), "proj.rm confirms project deletion");

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

  // --- Recording namespace unit tests ---

  // InputsResult
  const inputsWithDevices = new InputsResult([
    { deviceId: "dev1", label: "Built-in Microphone", groupId: "g1" },
    { deviceId: "dev2", label: "Focusrite USB Audio", groupId: "g2" },
  ]);
  assert.ok(inputsWithDevices.toString().includes("Available audio inputs"), "InputsResult shows table header");
  assert.ok(inputsWithDevices.toString().includes("[0]"), "InputsResult shows [0] index");
  assert.ok(inputsWithDevices.toString().includes("Built-in Microphone"), "InputsResult shows device label");
  assert.ok(inputsWithDevices.toString().includes("[1]"), "InputsResult shows [1] index");
  assert.ok(inputsWithDevices.help().toString().includes("sn.inputs()"), "InputsResult.help shows sn.inputs()");
  assert.ok(inputsWithDevices.help().toString().includes("sn.dev"), "InputsResult.help mentions sn.dev");

  const inputsEmpty = new InputsResult([]);
  assert.ok(inputsEmpty.toString().includes("No audio input devices"), "InputsResult empty state message");

  // AudioDevice
  const audioDev = new AudioDevice(0, "deviceId-abc123", "Built-in Microphone", 1, {
    record: async () => new RecordingHandle("Built-in Microphone", () => {}, Promise.resolve({} as Sample)),
  });
  assert.ok(audioDev.toString().includes("AudioDevice [0]"), "AudioDevice toString includes index");
  assert.ok(audioDev.toString().includes("Built-in Microphone"), "AudioDevice toString includes label");
  assert.ok(audioDev.toString().includes("record("), "AudioDevice toString mentions record()");
  assert.ok(audioDev.help().toString().includes("record("), "AudioDevice help describes record()");
  assert.ok(audioDev.help().toString().includes("stop()"), "AudioDevice help mentions stop()");
  assert.ok(audioDev.help().toString().includes("duration"), "AudioDevice help mentions duration option");

  // RecordingHandle
  let stopCalled = false;
  const fakeSample = {} as Sample;
  const handle = new RecordingHandle(
    "Built-in Microphone",
    () => { stopCalled = true; },
    Promise.resolve(fakeSample),
  );
  assert.ok(handle.toString().includes("Recording"), "RecordingHandle toString shows recording status");
  assert.ok(handle.toString().includes("Built-in Microphone"), "RecordingHandle toString shows device label");
  assert.ok(handle.help().toString().includes("stop()"), "RecordingHandle help describes stop()");
  assert.ok(handle.help().toString().includes("duration"), "RecordingHandle help mentions duration option");

  const stoppedPromise = handle.stop();
  assert.ok(stopCalled, "RecordingHandle.stop() calls the stop function");
  assert.ok(stoppedPromise instanceof SamplePromise, "RecordingHandle.stop() returns SamplePromise");

  // sn.inputs and sn.dev help text
  const snObj = sn as typeof sn & { inputs: { help?: () => BounceResult }; dev: { help?: () => BounceResult } };
  assert.ok(snObj.inputs.help, "sn.inputs has a help() method");
  assert.ok(snObj.dev.help, "sn.dev has a help() method");
  assert.ok(snObj.inputs.help!().toString().includes("sn.inputs()"), "sn.inputs.help contains sn.inputs()");
  assert.ok(snObj.dev.help!().toString().includes("record("), "sn.dev.help mentions record(");
  assert.ok(snObj.dev.help!().toString().includes("stop()"), "sn.dev.help mentions stop()");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
