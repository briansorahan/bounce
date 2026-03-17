/// <reference path="./types.d.ts" />
/// <reference path="./bounce-globals.d.ts" />
import { AudioManager } from "./audio-context.js";
import { BounceTerminal } from "./terminal.js";
import { VisualizationSceneManager } from "./visualization-scene-manager.js";
import {
  BounceResult,
  Sample,
  OnsetFeature,
  NmfFeature,
  MfccFeature,
  VisScene,
  VisStack,
  VisSceneListResult,
  SampleNamespace,
  SampleListResult,
  ProjectNamespace,
  ProjectResult,
  ProjectListResult,
  EnvScopeResult,
  EnvInspectionResult,
  EnvFunctionListResult,
  type EnvEntrySummary,
  type EnvEntryScope,
  type EnvInspectScope,
  SamplePromise,
  CurrentSamplePromise,
  OnsetFeaturePromise,
  NmfFeaturePromise,
  MfccFeaturePromise,
  GrainCollectionPromise,
  type SampleSummaryFeature,
  type ProjectSummary,
  LsResult,
  GlobResult,
  LsResultPromise,
  GlobResultPromise,
  formatLsEntries,
} from "./bounce-result.js";
import { GrainCollection } from "./grain-collection.js";
import {
  getCallablePropertyNames,
  getRuntimePreview,
  getRuntimeTypeLabel,
  type RuntimeScopeEntry,
} from "./runtime-introspection.js";

export {
  BounceResult,
  Sample,
  OnsetFeature,
  NmfFeature,
  MfccFeature,
  VisScene,
  VisStack,
  VisSceneListResult,
  SampleNamespace,
  SampleListResult,
  ProjectNamespace,
  ProjectResult,
  ProjectListResult,
  EnvScopeResult,
  EnvInspectionResult,
  EnvFunctionListResult,
  SamplePromise,
  CurrentSamplePromise,
  OnsetFeaturePromise,
  NmfFeaturePromise,
  MfccFeaturePromise,
  GrainCollectionPromise,
  LsResult,
  GlobResult,
  LsResultPromise,
  GlobResultPromise,
  GrainCollection,
};

export interface BounceApiDeps {
  terminal: BounceTerminal;
  audioManager: AudioManager;
  sceneManager?: VisualizationSceneManager;
  runtime?: {
    listScopeEntries(): RuntimeScopeEntry[];
    hasScopeValue(name: string): boolean;
    getScopeValue(name: string): unknown;
  };
}

/**
 * Builds the typed global functions injected into the REPL evaluation scope.
 * Each function closes over the provided deps and the global window.electron IPC bridge.
 */
export function buildBounceApi(deps: BounceApiDeps): Record<string, unknown> {
  const { terminal, audioManager } = deps;
  let visualizationScenes: VisualizationSceneManager | null = deps.sceneManager ?? null;
  let api: Record<string, unknown> | null = null;

  const supportedExtensions = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".opus"];

  function sampleLabel(filePath: string | undefined, hash: string): string {
    return filePath?.split("/").pop() ?? hash.substring(0, 8);
  }

  function ensureSupportedInput(fileOrHash: string): void {
    const isHash =
      /^[0-9a-f]{8,}$/i.test(fileOrHash) &&
      !fileOrHash.includes("/") &&
      !fileOrHash.includes("\\");

    if (isHash) return;

    const ext = fileOrHash.toLowerCase().substring(fileOrHash.lastIndexOf("."));
    if (!supportedExtensions.includes(ext)) {
      throw new Error("Unsupported file format. Supported: WAV, MP3, OGG, FLAC, M4A, AAC, OPUS");
    }
  }

  function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    return (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "then" in value &&
      typeof value.then === "function"
    );
  }

  function getCurrentHash(): string {
    const hash = audioManager.getCurrentAudio()?.hash;
    if (!hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }
    return hash;
  }

  function getSceneManager(): VisualizationSceneManager {
    if (!visualizationScenes) {
      visualizationScenes = new VisualizationSceneManager(() => {
        if ("fit" in terminal && typeof terminal.fit === "function") {
          terminal.fit();
        }
      });
    }
    return visualizationScenes;
  }

  function visSceneHelpText(scene: VisScene): BounceResult {
    return new BounceResult([
      "\x1b[1;36mVisScene\x1b[0m",
      "",
      `  sample:   ${sampleLabel(scene.sample.filePath, scene.sample.hash)}`,
      `  overlays: ${scene.overlays.length}`,
      `  panels:   ${scene.panels.length}`,
      `  shown:    ${scene.sceneId ? "yes" : "no"}`,
      "",
      "  Methods:",
      "    scene.title(text)",
      "    scene.overlay(feature)",
      "    scene.panel(feature)",
      "    scene.show()",
    ].join("\n"));
  }

  function visStackHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mVisStack\x1b[0m",
      "",
      "  Build multiple visualization scenes in one chained expression.",
      "",
      "  Methods:",
      "    stack.waveform(sample)",
      "    stack.title(text)",
      "    stack.overlay(feature)",
      "    stack.panel(feature)",
      "    stack.show()",
      "",
      "  \x1b[90mExample:\x1b[0m  vis.stack().waveform(a).waveform(b).show()",
    ].join("\n"));
  }

  function visListHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mvis.list()\x1b[0m",
      "",
      "  List currently shown visualization scenes.",
      "",
      "  \x1b[90mExample:\x1b[0m  vis.list()",
    ].join("\n"));
  }

  function projectSummaryHelpText(project: ProjectResult): BounceResult {
    return new BounceResult([
      `\x1b[1;36mProject ${project.name}\x1b[0m`,
      "",
      `  samples:   ${project.sampleCount}`,
      `  features:  ${project.featureCount}`,
      `  commands:  ${project.commandCount}`,
      `  created:   ${project.createdAt}`,
      "",
      "  Use proj.list(), proj.load(name), and proj.rm(name) to manage projects.",
    ].join("\n"));
  }

  function projectListHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mproj.list()\x1b[0m",
      "",
      "  List all projects with sample, feature, and command counts.",
      "",
      "  \x1b[90mExample:\x1b[0m  proj.list()",
    ].join("\n"));
  }

  function visWaveformHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mvis.waveform(sample)\x1b[0m",
      "",
      "  Create a draft visualization scene rooted in a sample waveform.",
      "  Chain overlay()/panel()/title() and call show() to render it.",
      "",
      "  \x1b[90mExample:\x1b[0m  const samp = sn.read(\"loop.wav\")",
      "           const scene = vis.waveform(samp)",
      "           scene.show()",
    ].join("\n"));
  }

  function visHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mvis\x1b[0m — visualization namespace",
      "",
      "  Use vis.waveform(sample) to create a draft scene, then compose and show it.",
      "  Use vis.stack() to build and show multiple scenes in one expression.",
      "",
      "  vis.waveform(sample)    Create a VisScene",
      "  vis.stack()             Create a VisStack",
      "  vis.list()              List shown scenes",
      "  vis.remove(id)          Remove one shown scene",
      "  vis.clear()             Remove all shown scenes",
      "",
      "  \x1b[90mExample:\x1b[0m  const scene = vis.waveform(samp)",
      "           scene.overlay(onsets).panel(nmf).show()",
      "           vis.stack().waveform(a).waveform(b).show()",
    ].join("\n"));
  }

  function envHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36menv\x1b[0m — runtime introspection namespace",
      "",
      "  Inspect the current REPL environment, including user-defined variables,",
      "  built-in Bounce globals, callable members, and runtime value summaries.",
      "",
      "  env.vars()                List user-defined variables in scope",
      "  env.globals()             List built-in Bounce globals",
      "  env.inspect(nameOrValue)  Show details for one binding or value",
      "  env.functions(value)      List callable members on a value",
      "",
      "  \x1b[90mExamples:\x1b[0m  env.vars()",
      "            env.globals()",
      "            env.inspect(\"samp\")",
      "            env.functions(sn)",
    ].join("\n"));
  }

  function envScopeHelpText(label: "vars" | "globals"): BounceResult {
    return new BounceResult([
      `\x1b[1;36menv.${label}()\x1b[0m`,
      "",
      label === "vars"
        ? "  List user-defined bindings that persist across REPL evaluations."
        : "  List Bounce-provided globals exposed in the current REPL session.",
      "",
      "  Each entry shows a name, runtime type label, callable flag, and short preview.",
      "",
      `  \x1b[90mExample:\x1b[0m  env.${label}()`,
    ].join("\n"));
  }

  function envInspectHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36menv.inspect(nameOrValue)\x1b[0m",
      "",
      "  Inspect one runtime binding or direct value. If you pass a string that",
      "  matches a user variable or Bounce global, Bounce resolves it by name first.",
      "",
      "  \x1b[90mExamples:\x1b[0m  env.inspect(\"sn\")",
      "            env.inspect(\"samp\")",
      "            env.inspect(sn.current())",
    ].join("\n"));
  }

  function envFunctionsHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36menv.functions(value)\x1b[0m",
      "",
      "  List callable members discovered on a runtime value using the same",
      "  callable-property rules as tab completion.",
      "",
      "  \x1b[90mExamples:\x1b[0m  env.functions(sn)",
      "            env.functions(\"samp\")",
    ].join("\n"));
  }

  function getApiEntries(): Array<[string, unknown]> {
    return Object.entries(api ?? {});
  }

  function makeEnvEntry(
    name: string,
    scope: EnvEntryScope,
    value: unknown,
  ): EnvEntrySummary {
    return {
      name,
      scope,
      typeLabel: getRuntimeTypeLabel(value),
      callable: typeof value === "function",
      preview: getRuntimePreview(value),
    };
  }

  function formatEnvScopeTable(
    title: string,
    entries: EnvEntrySummary[],
    emptyMessage: string,
  ): string {
    if (entries.length === 0) {
      return [`\x1b[1;36m${title}\x1b[0m`, "", `\x1b[90m${emptyMessage}\x1b[0m`].join("\n");
    }

    const nameWidth = Math.max("Name".length, ...entries.map((entry) => entry.name.length));
    const typeWidth = Math.max("Type".length, ...entries.map((entry) => entry.typeLabel.length));
    const header =
      `${"Name".padEnd(nameWidth + 2)}` +
      `${"Type".padEnd(typeWidth + 2)}` +
      `${"Callable".padEnd(10)}` +
      "Preview";

    const rows = entries.map((entry) =>
      `${entry.name.padEnd(nameWidth + 2)}` +
      `${entry.typeLabel.padEnd(typeWidth + 2)}` +
      `${(entry.callable ? "yes" : "no").padEnd(10)}` +
      entry.preview,
    );

    return [
      `\x1b[1;36m${title}\x1b[0m`,
      "",
      header,
      "─".repeat(header.length),
      ...rows,
    ].join("\n");
  }

  function formatEnvInspection(
    name: string | undefined,
    scope: EnvInspectScope,
    value: unknown,
  ): EnvInspectionResult {
    const callableMembers =
      value && (typeof value === "object" || typeof value === "function")
        ? getCallablePropertyNames(value).sort()
        : [];
    const typeLabel = getRuntimeTypeLabel(value);
    const callable = typeof value === "function";
    const preview = getRuntimePreview(value);
    const lines = [
      `\x1b[1;36m${name ? `env.inspect(${name})` : "env.inspect(value)"}\x1b[0m`,
      "",
      name ? `  name:      ${name}` : "",
      `  scope:     ${scope}`,
      `  type:      ${typeLabel}`,
      `  callable:  ${callable ? "yes" : "no"}`,
      `  preview:   ${preview}`,
      callableMembers.length > 0
        ? `  methods:   ${callableMembers.slice(0, 8).join(", ")}${callableMembers.length > 8 ? ` … (+${callableMembers.length - 8})` : ""}`
        : "  methods:   none",
    ].filter(Boolean);

    return new EnvInspectionResult(
      lines.join("\n"),
      name,
      scope,
      typeLabel,
      callable,
      preview,
      callableMembers,
      envInspectHelpText,
    );
  }

  function resolveEnvTarget(nameOrValue: unknown): {
    name: string | undefined;
    scope: EnvInspectScope;
    value: unknown;
  } {
    if (typeof nameOrValue === "string") {
      if (deps.runtime?.hasScopeValue(nameOrValue)) {
        return {
          name: nameOrValue,
          scope: "user",
          value: deps.runtime.getScopeValue(nameOrValue),
        };
      }
      const globalEntry = getApiEntries().find(([name]) => name === nameOrValue);
      if (globalEntry) {
        return {
          name: nameOrValue,
          scope: "global",
          value: globalEntry[1],
        };
      }
    }

    return {
      name: undefined,
      scope: "value",
      value: nameOrValue,
    };
  }

  function sampleHelpText(sample: Sample): BounceResult {
    return new BounceResult([
      `\x1b[1;36mSample ${sample.hash.substring(0, 8)}\x1b[0m`,
      "",
      `  file:      ${sample.filePath ?? "(derived sample)"}`,
      `  sampleRate:${sample.sampleRate} Hz`,
      `  channels:  ${sample.channels}`,
      `  duration:  ${sample.duration.toFixed(3)}s`,
      "",
      "  Methods:",
      "    sample.play()",
      "    sample.loop()",
      "    sample.stop()",
      "    sample.display()",
      "    sample.onsets()",
      "    sample.nmf()",
      "    sample.mfcc()",
      "    sample.slice(options?)",
      "    sample.sep(options?)",
      "    sample.granularize(options?)",
    ].join("\n"));
  }

  function onsetHelpText(feature: OnsetFeature): BounceResult {
    return new BounceResult([
      `\x1b[1;36mOnsetFeature ${feature.featureHash.substring(0, 8)}\x1b[0m`,
      "",
      `  source: ${feature.sourceHash.substring(0, 8)}`,
      `  slices: ${feature.count}`,
      "",
      "  Methods:",
      "    feature.slice(options?)",
      "    feature.playSlice(index?)",
    ].join("\n"));
  }

  function nmfHelpText(feature: NmfFeature): BounceResult {
    return new BounceResult([
      `\x1b[1;36mNmfFeature ${feature.featureHash.substring(0, 8)}\x1b[0m`,
      "",
      `  source:     ${feature.sourceHash.substring(0, 8)}`,
      `  components: ${feature.components ?? "unknown"}`,
      `  iterations: ${feature.iterations ?? "unknown"}`,
      `  converged:  ${feature.converged === undefined ? "unknown" : feature.converged ? "yes" : "no"}`,
      "",
      "  Methods:",
      "    feature.sep(options?)",
      "    feature.playComponent(index?)",
    ].join("\n"));
  }

  function mfccHelpText(feature: MfccFeature): BounceResult {
    return new BounceResult([
      `\x1b[1;36mMfccFeature ${feature.featureHash.substring(0, 8)}\x1b[0m`,
      "",
      `  source:      ${feature.sourceHash.substring(0, 8)}`,
      `  numFrames:   ${feature.numFrames}`,
      `  numCoeffs:   ${feature.numCoeffs}`,
      "",
      "  This feature stores MFCC analysis data for corpus and similarity workflows.",
    ].join("\n"));
  }

  function makeSampleDisplayText(
    sample: {
      hash: string;
      filePath: string | undefined;
      sampleRate: number;
      channels: number;
      duration: number;
    },
    title = "Sample",
  ): string {
    return [
      `\x1b[32m${title}: ${sampleLabel(sample.filePath, sample.hash)}\x1b[0m`,
      `\x1b[90mhash ${sample.hash.substring(0, 8)} · ${sample.sampleRate}Hz · ${sample.channels}ch · ${sample.duration.toFixed(3)}s\x1b[0m`,
    ].join("\n");
  }

  function makeProjectDisplayText(project: ProjectSummary, heading = "Current Project"): string {
    return [
      `\x1b[1;36m${heading}\x1b[0m`,
      "",
      `  name:      ${project.name}`,
      `  samples:   ${project.sampleCount}`,
      `  features:  ${project.featureCount}`,
      `  commands:  ${project.commandCount}`,
      `  created:   ${project.createdAt}`,
    ].join("\n");
  }

  function bindProject(project: ProjectData, heading = "Current Project"): ProjectResult {
    let result: ProjectResult | null = null;
    const helpFactory = (): BounceResult => {
      if (!result) {
        throw new Error("Project help is not available before initialization.");
      }
      return projectSummaryHelpText(result);
    };
    const bound: ProjectResult = new ProjectResult(
      makeProjectDisplayText(
        {
          id: project.id,
          name: project.name,
          createdAt: project.created_at,
          sampleCount: project.sample_count,
          featureCount: project.feature_count,
          commandCount: project.command_count,
          current: project.current,
        },
        heading,
      ),
      project.id,
      project.name,
      project.created_at,
      project.sample_count,
      project.feature_count,
      project.command_count,
      project.current,
      helpFactory,
    );
    result = bound;
    return bound;
  }

  function formatProjectsTable(projects: ProjectData[]): string {
    if (projects.length === 0) {
      return "\x1b[90mNo projects\x1b[0m";
    }

    const nameWidth = Math.max(
      "Name".length,
      ...projects.map((project) => project.name.length),
    );

    const header =
      `${"Cur".padEnd(4)}` +
      `${"Name".padEnd(nameWidth + 2)}` +
      `${"Samples".padStart(8)}  ` +
      `${"Features".padStart(8)}  ` +
      `${"Commands".padStart(8)}  ` +
      "Created";

    const rows = projects.map((project) =>
      `${(project.current ? "*" : "").padEnd(4)}` +
      `${project.name.padEnd(nameWidth + 2)}` +
      `${String(project.sample_count).padStart(8)}  ` +
      `${String(project.feature_count).padStart(8)}  ` +
      `${String(project.command_count).padStart(8)}  ` +
      project.created_at,
    );

    return [
      "\x1b[1;36mProjects\x1b[0m",
      "",
      header,
      "─".repeat(header.length),
      ...rows,
    ].join("\n");
  }

  function dispatchProjectChanged(): void {
    if (typeof window.dispatchEvent !== "function") {
      return;
    }
    if (typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("bounce:project-changed"));
      return;
    }
    if (typeof Event === "function") {
      window.dispatchEvent(new Event("bounce:project-changed"));
    }
  }

  function bindSample(
    sample: {
      hash: string;
      filePath: string | undefined;
      sampleRate: number;
      channels: number;
      duration: number;
      id?: number;
    },
    displayText = makeSampleDisplayText(sample),
  ): Sample {
    const bound: Sample = new Sample(
      displayText,
      sample.hash,
      sample.filePath,
      sample.sampleRate,
      sample.channels,
      sample.duration,
      sample.id,
      {
        help: (): BounceResult => sampleHelpText(bound),
        play: () => play(bound),
        loop: () => loop(bound),
        stop: () => stop(bound),
        display: () => display(bound.hash),
        slice: (options) => slice(bound, options),
        sep: (options) => sep(bound, options),
        granularize: (options) => granularize(bound, options),
        onsets: (options) => analyze(bound, options),
        nmf: (options) => analyzeNmf(bound, options),
        mfcc: (options) => analyzeMFCC(bound, options),
      },
    );
    return bound;
  }

  function bindOnsetFeature(
    source: Sample,
    featureHash: string,
    slices: number[],
    options?: AnalyzeOptions,
    displayText = `\x1b[32mFound ${slices.length} onset slices (feature: ${featureHash.substring(0, 8)})\x1b[0m`,
  ): OnsetFeature {
    const bound: OnsetFeature = new OnsetFeature(
      displayText,
      source,
      featureHash,
      options,
      slices,
      {
        help: (): BounceResult => onsetHelpText(bound),
        slice: (sliceOptions) => slice(bound, sliceOptions),
        playSlice: (index = 0) => playSlice(index, bound),
      },
    );
    return bound;
  }

  function bindNmfFeature(
    source: Sample,
    featureHash: string,
    options: NmfOptions | undefined,
    components: number | undefined,
    iterations: number | undefined,
    converged: boolean | undefined,
    bases: number[][] | Float32Array[] | undefined,
    activations: number[][] | Float32Array[] | undefined,
    displayText: string,
  ): NmfFeature {
    const bound: NmfFeature = new NmfFeature(
      displayText,
        source,
        featureHash,
        options,
        components,
        iterations,
        converged,
        bases,
        activations,
        {
        help: (): BounceResult => nmfHelpText(bound),
        sep: (sepOptions) => sep(bound, sepOptions),
        playComponent: (index = 0) => playComponent(index, bound),
      },
    );
    return bound;
  }

  function bindMfccFeature(
    source: Sample,
    featureHash: string,
    options: MFCCOptions | undefined,
    numFrames: number,
    numCoeffs: number,
    displayText: string,
  ): MfccFeature {
    const bound: MfccFeature = new MfccFeature(
      displayText,
      source,
      featureHash,
      options,
      numFrames,
      numCoeffs,
      {
        help: (): BounceResult => mfccHelpText(bound),
      },
    );
    return bound;
  }

  function bindVisScene(
    sample: Sample,
    titleText?: string,
  ): VisScene {
    const bound = new VisScene(
      sample,
      titleText,
      {
        help: (): BounceResult => visSceneHelpText(bound),
        show: async (scene): Promise<BounceResult> => {
          const rendered = await getSceneManager().renderScene(scene);
          return new BounceResult(
            `\x1b[32mScene ${rendered.id} shown for ${rendered.sampleLabel} (${rendered.overlayCount} overlays, ${rendered.panelCount} panels)\x1b[0m`,
          );
        },
      },
    );
    return bound;
  }

  function bindVisStack(): VisStack {
    return new VisStack({
      help: (): BounceResult => visStackHelpText(),
      show: async (stack): Promise<BounceResult> => {
        if (stack.scenes.length === 0) {
          throw new Error("No scenes in stack. Add at least one waveform before show().");
        }
        const rendered = [];
        for (const scene of stack.scenes) {
          rendered.push(await getSceneManager().renderScene(scene));
        }
        return new BounceResult(
          `\x1b[32mRendered ${rendered.length} scenes (${rendered.map((scene) => scene.id).join(", ")})\x1b[0m`,
        );
      },
    });
  }

  async function display(fileOrHash: string): Promise<Sample> {
    ensureSupportedInput(fileOrHash);

    const audioFileData = await window.electron.readAudioFile(fileOrHash);
    const audio = {
      audioData: audioFileData.channelData,
      sampleRate: audioFileData.sampleRate,
      duration: audioFileData.duration,
      filePath: audioFileData.filePath ?? fileOrHash,
      hash: audioFileData.hash,
      visualize: () => "Visualization updated",
      analyzeOnsetSlice: async (options?: OnsetSliceOptions) => {
        const slices = await window.electron.analyzeOnsetSlice(audioFileData.channelData, options);
        return { slices, visualize: () => "Slice markers updated" };
      },
    };

    audioManager.setCurrentAudio(audio);

    const existing = await window.electron.getSampleByHash(audioFileData.hash);
    return bindSample(
      {
        id: existing?.id,
        hash: audioFileData.hash,
        filePath: audioFileData.filePath ?? fileOrHash,
        sampleRate: audioFileData.sampleRate,
        channels: existing?.channels ?? 1,
        duration: audioFileData.duration,
      },
      [
        `\x1b[32mLoaded: ${sampleLabel(audioFileData.filePath ?? fileOrHash, audioFileData.hash)}\x1b[0m`,
        `\x1b[32mHash: ${audioFileData.hash.substring(0, 8)}\x1b[0m`,
      ].join("\n"),
    );
  }

  async function resolveSample(source: Sample | PromiseLike<Sample>): Promise<Sample> {
    return isPromiseLike<Sample>(source) ? await source : source;
  }

  function stop(source?: Sample): BounceResult {
    if (source) {
      audioManager.stopAudio(source.hash);
      return new BounceResult(`\x1b[32mPlayback stopped: ${sampleLabel(source.filePath, source.hash)}\x1b[0m`);
    }
    audioManager.stopAudio();
    return new BounceResult("\x1b[32mPlayback stopped\x1b[0m");
  }

  async function startPlayback(
    source: string | Sample | PromiseLike<Sample> | undefined,
    loopPlayback: boolean,
  ): Promise<Sample> {
    let loadedSample: Sample | undefined;

    if (typeof source === "string") {
      loadedSample = await display(source);
    } else if (source !== undefined) {
      const resolved = await resolveSample(source);
      if (audioManager.getCurrentAudio()?.hash !== resolved.hash) {
        loadedSample = await display(resolved.hash);
      } else {
        loadedSample = resolved;
      }
    }

    const audio = audioManager.getCurrentAudio();
    if (!audio) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    const activeSample =
      loadedSample ??
      bindSample({
        hash: audio.hash!,
        filePath: audio.filePath ?? undefined,
        sampleRate: audio.sampleRate,
        channels: 1,
        duration: audio.duration,
      });

    await audioManager.playAudio(
      audio.audioData,
      audio.sampleRate,
      loopPlayback,
      activeSample.hash,
    );

    return bindSample(
      {
        hash: activeSample.hash,
        filePath: activeSample.filePath,
        sampleRate: activeSample.sampleRate,
        channels: activeSample.channels,
        duration: activeSample.duration,
        id: activeSample.id,
      },
      [
        loadedSample ? loadedSample.toString() : makeSampleDisplayText(activeSample),
        `\x1b[32m${loopPlayback ? "Looping" : "Playing"}: ${sampleLabel(activeSample.filePath, activeSample.hash)}\x1b[0m`,
      ].join("\n"),
    );
  }

  async function play(source?: string | Sample | PromiseLike<Sample>): Promise<Sample> {
    return startPlayback(source, false);
  }

  async function loop(source?: string | Sample | PromiseLike<Sample>): Promise<Sample> {
    return startPlayback(source, true);
  }

  async function analyze(
    source?: Sample | PromiseLike<Sample> | AnalyzeOptions,
    options?: AnalyzeOptions,
  ): Promise<OnsetFeature> {
    const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
    const sample = resolvedSource instanceof Sample ? resolvedSource : await display(getCurrentHash());
    const opts = resolvedSource instanceof Sample ? options : (resolvedSource as AnalyzeOptions | undefined);

    if (audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await display(sample.hash);
    }
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    terminal.writeln("\x1b[36mAnalyzing onset slices...\x1b[0m");

    const slices = await window.electron.analyzeOnsetSlice(audio.audioData, opts);
    await window.electron.storeFeature(audio.hash, "onset-slice", slices, opts as FeatureOptions | undefined);
    const feature = await window.electron.getMostRecentFeature(audio.hash, "onset-slice");
    if (!feature) {
      throw new Error("Failed to load stored onset feature.");
    }

    return bindOnsetFeature(sample, feature.feature_hash, slices, opts);
  }

  async function analyzeNmf(
    source?: Sample | PromiseLike<Sample> | NmfOptions,
    options?: NmfOptions,
  ): Promise<NmfFeature> {
    const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
    const sample = resolvedSource instanceof Sample ? resolvedSource : await display(getCurrentHash());
    const opts = resolvedSource instanceof Sample ? options : (resolvedSource as NmfOptions | undefined);

    if (audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await display(sample.hash);
    }
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    terminal.writeln("\x1b[36mPerforming NMF decomposition...\x1b[0m");
    const result = await window.electron.analyzeBufNMF(audio.audioData, audio.sampleRate, opts);
    const flattenedData = [
      result.components,
      result.iterations,
      result.converged ? 1 : 0,
      ...result.bases.flat(),
      ...result.activations.flat(),
    ];
    await window.electron.storeFeature(audio.hash, "nmf", flattenedData, {
      ...opts,
      components: result.components,
      iterations: result.iterations,
      converged: result.converged,
    } as FeatureOptions);
    const feature = await window.electron.getMostRecentFeature(audio.hash, "nmf");
    if (!feature) {
      throw new Error("Failed to load stored NMF feature.");
    }

    return bindNmfFeature(
      sample,
      feature.feature_hash,
      opts,
      result.components,
      result.iterations,
      result.converged,
      result.bases,
      result.activations,
      [
        `\x1b[32mNMF complete: ${result.components} components (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
        `Converged: ${result.converged ? "Yes" : "No"} after ${result.iterations} iterations`,
      ].join("\n"),
    );
  }

  async function analyzeMFCC(
    sampleOrPromise: Sample | PromiseLike<Sample>,
    options?: MFCCOptions,
  ): Promise<MfccFeature> {
    const sample = await resolveSample(sampleOrPromise);
    let audioData: Float32Array;
    let sampleRate: number;

    const current = audioManager.getCurrentAudio();
    if (current?.hash === sample.hash) {
      audioData = current.audioData;
      sampleRate = current.sampleRate;
    } else {
      const loaded = await window.electron.readAudioFile(sample.hash);
      audioData = loaded.channelData;
      sampleRate = loaded.sampleRate;
    }

    terminal.writeln("\x1b[36mComputing MFCCs...\x1b[0m");

    const coefficients = await window.electron.analyzeMFCC(audioData, {
      sampleRate,
      ...options,
    });
    const numFrames = coefficients.length;
    const numCoeffs = coefficients[0]?.length ?? 0;
    await window.electron.storeFeature(sample.hash, "mfcc", coefficients.flat(), {
      ...options,
      numFrames,
      numCoeffs,
    } as FeatureOptions);
    const feature = await window.electron.getMostRecentFeature(sample.hash, "mfcc");
    if (!feature) {
      throw new Error("Failed to load stored MFCC feature.");
    }

    return bindMfccFeature(
      sample,
      feature.feature_hash,
      options,
      numFrames,
      numCoeffs,
      `\x1b[32mMFCC complete: ${numFrames} frames × ${numCoeffs} coefficients (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  const slice = Object.assign(
    async function slice(
      source?: OnsetFeature | Sample | PromiseLike<Sample> | SliceOptions,
      options?: SliceOptions,
    ): Promise<BounceResult> {
      const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
      const explicitOptions =
        resolvedSource instanceof OnsetFeature || resolvedSource instanceof Sample
          ? options
          : (resolvedSource as SliceOptions | undefined);
      let feature: FeatureData | null;
      let sampleHash: string;
      if (resolvedSource instanceof OnsetFeature) {
        sampleHash = resolvedSource.sourceHash;
        feature = explicitOptions?.featureHash
          ? await window.electron.getMostRecentFeature(resolvedSource.sourceHash, "onset-slice")
          : await window.electron.getMostRecentFeature(resolvedSource.sourceHash, "onset-slice");
      } else if (resolvedSource instanceof Sample) {
        sampleHash = resolvedSource.hash;
        feature = await window.electron.getMostRecentFeature(
          resolvedSource.hash,
          "onset-slice",
        );
      } else {
        sampleHash = getCurrentHash();
        feature = await window.electron.getMostRecentFeature(sampleHash, "onset-slice");
      }

      if (feature && explicitOptions?.featureHash && !feature.feature_hash.startsWith(explicitOptions.featureHash)) {
        feature = {
          ...feature,
          feature_hash: explicitOptions.featureHash,
        };
      }

      if (!feature) {
        throw new Error("No onset analysis found. Run sample.onsets() first.");
      }

      terminal.writeln(`\x1b[36mCreating slices from feature ${feature.feature_hash.substring(0, 8)}...\x1b[0m`);
      const slices = await window.electron.createSliceSamples(sampleHash, feature.feature_hash);

      return new BounceResult(`\x1b[32mCreated ${slices.length} slices\x1b[0m`);
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36msample.slice(options?)\x1b[0m",
        "",
        "  Extract onset-slice segments into individual stored samples. Requires",
        "  sample.onsets() to have been run first.",
        "",
        "  \x1b[33moptions\x1b[0m  featureHash — use a specific stored feature",
        "",
        "  \x1b[90mExample:\x1b[0m  const samp = sn.read(\"loop.wav\")",
        "           const onsets = samp.onsets()",
        "           onsets.slice()",
      ].join("\n")),
    },
  );

  const sep = Object.assign(
    async function sep(
      source?: Sample | PromiseLike<Sample> | NmfFeature | SepOptions,
      options?: SepOptions,
    ): Promise<BounceResult> {
      let hash: string;
      let opts: SepOptions | undefined;

      const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
      if (resolvedSource instanceof Sample) {
        hash = resolvedSource.hash;
        opts = options;
      } else if (resolvedSource instanceof NmfFeature) {
        hash = resolvedSource.sourceHash;
        opts = options;
      } else {
        hash = getCurrentHash();
        opts = resolvedSource as SepOptions | undefined;
      }

      const args: string[] = [hash];
      if (opts?.components !== undefined) args.push("--components", String(opts.components));
      if (opts?.iterations !== undefined) args.push("--iterations", String(opts.iterations));

      const result = await window.electron.sep(args);
      if (result.success) {
        return new BounceResult(`\x1b[32m${result.message}\x1b[0m`);
      } else {
        throw new Error(result.message);
      }
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36msample.sep(options?)\x1b[0m",
        "",
        "  NMF separation — decomposes the audio into individual component samples",
        "  using a prior sample.nmf() result.",
        "",
        "  \x1b[33moptions\x1b[0m  components, iterations",
        "",
        "  \x1b[90mExample:\x1b[0m  const samp = sn.read(\"loop.wav\")",
        "           const feature = samp.nmf({ components: 4 })",
        "           feature.sep()",
      ].join("\n")),
    },
  );

  const nx = Object.assign(
    async function nx(options?: NxOptions): Promise<BounceResult> {
      if (!options?.targetHash || !options?.sourceHash) {
        throw new Error("nx() requires options.targetHash and options.sourceHash");
      }

      const args: string[] = [options.targetHash, options.sourceHash];
      if (options.components !== undefined) args.push("--components", String(options.components));

      const result = await window.electron.nx(args);
      if (result.success) {
        return new BounceResult(`\x1b[32m${result.message}\x1b[0m`);
      } else {
        throw new Error(result.message);
      }
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mnx(options)\x1b[0m",
        "",
        "  NMF cross-synthesis — applies the spectral components of a source audio",
        "  to the temporal structure of a target audio.",
        "",
        "  \x1b[33moptions\x1b[0m  targetHash (required), sourceHash (required), components",
        "",
        "  \x1b[90mExample:\x1b[0m  nx({ targetHash: \"a1b2c3d4\", sourceHash: \"e5f6a7b8\" })",
      ].join("\n")),
    },
  );

  const list = Object.assign(
    async function list(): Promise<SampleListResult> {
      const samples = await window.electron.listSamples();
      const features = await window.electron.listFeatures();
      const lines: string[] = [];
      const sampleObjects = samples.map((sample) =>
        bindSample({
          id: sample.id,
          hash: sample.hash,
          filePath: sample.file_path ?? undefined,
          sampleRate: sample.sample_rate,
          channels: sample.channels,
          duration: sample.duration,
        }),
      );
      const featureSummaries: SampleSummaryFeature[] = features.map((feature) => ({
        sampleHash: feature.sample_hash,
        featureHash: feature.feature_hash,
        featureType: feature.feature_type,
        featureCount: feature.feature_count,
        filePath: feature.file_path ?? undefined,
        options: feature.options,
      }));

      if (samples.length === 0) {
        lines.push("\x1b[33mNo samples in database\x1b[0m");
      } else {
        lines.push("\x1b[1;36mStored Samples:\x1b[0m", "");
        for (const sample of samples) {
          const shortHash = sample.hash.substring(0, 8);
          const basename =
            (sample.file_path ?? sample.hash).split("/").pop() ?? shortHash;
          const channelsStr = sample.channels === 1 ? "mono" : "stereo";
          lines.push(
            `  \x1b[33m${shortHash}\x1b[0m ${basename.padEnd(25)} ${sample.sample_rate}Hz ${channelsStr.padEnd(6)} ${sample.duration.toFixed(2)}s`,
          );
        }
        lines.push("", `Total: ${samples.length} sample(s)`);
      }

      if (features.length > 0) {
        lines.push("", "\x1b[1;36mStored Features:\x1b[0m", "");
        for (const feature of features) {
          const shortHash = feature.sample_hash.substring(0, 8);
          lines.push(
            `  \x1b[33m${shortHash}\x1b[0m \x1b[90m${feature.feature_type}\x1b[0m  ${feature.feature_count} entries`,
          );
        }
        lines.push("", `Total: ${features.length} feature(s)`);
      }

      return new SampleListResult(
        lines.join("\n"),
        sampleObjects,
        featureSummaries,
        () => new BounceResult([
          "\x1b[1;36msn.list()\x1b[0m",
          "",
          "  List stored samples and features. Returns a SampleListResult and prints",
          "  a formatted summary to the terminal.",
        ].join("\n")),
      );
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36msn.list()\x1b[0m",
        "",
        "  Show all stored samples and features in the database.",
        "",
        "  \x1b[90mExample:\x1b[0m  sn.list()",
      ].join("\n")),
    },
  );

  const playSlice = Object.assign(
    async function playSlice(index = 0, source?: OnsetFeature | Sample | PromiseLike<Sample>): Promise<Sample> {
      const currentHash = getCurrentHash();

      const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
      const lookupHash = resolvedSource instanceof Sample
        ? resolvedSource.hash
        : resolvedSource instanceof OnsetFeature
          ? resolvedSource.sourceHash
          : currentHash;

      const feature = resolvedSource instanceof OnsetFeature
        ? await window.electron.getMostRecentFeature(lookupHash, "onset-slice")
        : await window.electron.getMostRecentFeature(lookupHash, "onset-slice");

      if (!feature) {
        throw new Error("No onset analysis found. Run sample.onsets() first.");
      }

      const derivedSample = await window.electron.getDerivedSampleByIndex(
        lookupHash,
        feature.feature_hash,
        index,
      );
      if (!derivedSample) {
        throw new Error(`Slice ${index} not found. Run slice() first.`);
      }

      const audioBuffer = derivedSample.audio_data as Buffer;
      const audioData = new Float32Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );
      const duration = audioData.length / derivedSample.sample_rate;

      audioManager.setCurrentAudio({
        audioData,
        sampleRate: derivedSample.sample_rate,
        duration,
        filePath: `Slice ${index} from ${lookupHash.substring(0, 8)}`,
        hash: derivedSample.hash,
        visualize: () => "Not available for slices",
        analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Not available" }),
      });
      audioManager.clearSlices();

      await audioManager.playAudio(
        audioData,
        derivedSample.sample_rate,
        false,
        derivedSample.hash,
      );

      return bindSample(
        {
          id: derivedSample.id,
          hash: derivedSample.hash,
          filePath: undefined,
          sampleRate: derivedSample.sample_rate,
          channels: derivedSample.channels,
          duration,
        },
        `\x1b[32mPlaying slice ${index} (${duration.toFixed(3)}s)\x1b[0m`,
      );
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mOnsetFeature.playSlice(index?)\x1b[0m",
        "",
        "  Play a specific onset-derived slice by index. Requires feature.slice()",
        "  to have been run first. Index defaults to 0.",
        "",
        "  \x1b[90mExample:\x1b[0m  const feature = samp.onsets()",
        "           feature.slice()",
        "           feature.playSlice(0)",
      ].join("\n")),
    },
  );

  const playComponent = Object.assign(
    async function playComponent(index = 0, source?: NmfFeature | Sample | PromiseLike<Sample>): Promise<Sample> {
      const currentHash = getCurrentHash();

      const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
      const lookupHash = resolvedSource instanceof Sample
        ? resolvedSource.hash
        : resolvedSource instanceof NmfFeature
          ? resolvedSource.sourceHash
          : currentHash;

      const feature = await window.electron.getMostRecentFeature(lookupHash, "nmf");
      if (!feature) {
        throw new Error("No NMF analysis found. Run sample.nmf() first.");
      }

      const nmfData = JSON.parse(feature.feature_data) as { bases: number[][] };
      const numComponents = nmfData.bases.length;
      if (index < 0 || index >= numComponents) {
        throw new Error(`Component index ${index} out of range (0-${numComponents - 1})`);
      }

      const derivedSample = await window.electron.getDerivedSampleByIndex(
        lookupHash,
        feature.feature_hash,
        index,
      );
      if (!derivedSample) {
        throw new Error(`Component ${index} not found. Run sep() first.`);
      }

      const audioBuffer = derivedSample.audio_data as Buffer;
      const componentAudio = new Float32Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );
      const duration = componentAudio.length / derivedSample.sample_rate;

      audioManager.setCurrentAudio({
        audioData: componentAudio,
        sampleRate: derivedSample.sample_rate,
        duration,
        filePath: `Component ${index} from ${lookupHash.substring(0, 8)}`,
        hash: derivedSample.hash,
        visualize: () => "Not available for components",
        analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Not available" }),
      });
      audioManager.clearSlices();

      await audioManager.playAudio(
        componentAudio,
        derivedSample.sample_rate,
        false,
        derivedSample.hash,
      );

      return bindSample(
        {
          id: derivedSample.id,
          hash: derivedSample.hash,
          filePath: undefined,
          sampleRate: derivedSample.sample_rate,
          channels: derivedSample.channels,
          duration,
        },
        `\x1b[32mPlaying component ${index} (${duration.toFixed(3)}s)\x1b[0m`,
      );
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mNmfFeature.playComponent(index?)\x1b[0m",
        "",
        "  Play a specific NMF-derived component by index. Requires feature.sep()",
        "  to have been run first. Index defaults to 0.",
        "",
        "  \x1b[90mExample:\x1b[0m  const feature = samp.nmf()",
        "           feature.sep()",
        "           feature.playComponent(0)",
      ].join("\n")),
    },
  );

  const visualizeNmf = Object.assign(
    async function visualizeNmf(_options?: VisualizeNmfOptions): Promise<BounceResult> {
      const audio = audioManager.getCurrentAudio();
      if (!audio?.hash) {
        throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
      }

      const current = await window.electron.getSampleByHash(audio.hash);
      if (!current) {
        throw new Error(`Sample ${audio.hash} not found in database`);
      }

      const feature = await window.electron.getMostRecentFeature(audio.hash, "nmf");
      if (!feature) {
        throw new Error("No NMF analysis found. Run sample.nmf() first.");
      }

      const featureData = JSON.parse(feature.feature_data) as {
        bases?: number[][];
        activations?: number[][];
        components?: number;
      };

      const sample = bindSample({
        id: current.id,
        hash: current.hash,
        filePath: current.file_path ?? undefined,
        sampleRate: current.sample_rate,
        channels: current.channels,
        duration: current.duration,
      });
      const boundFeature = bindNmfFeature(
        sample,
        feature.feature_hash,
        undefined,
        featureData.components ?? featureData.activations?.length,
        undefined,
        undefined,
        featureData.bases,
        featureData.activations,
        `\x1b[32mNMF feature ${feature.feature_hash.substring(0, 8)} ready\x1b[0m`,
      );

      return bindVisScene(sample, `NMF Overlay · ${sampleLabel(sample.filePath, sample.hash)}`)
        .overlay(boundFeature)
        .show();
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mvisualizeNmf(options?)\x1b[0m",
        "",
        "  Compatibility helper: create a new vis scene with the current sample",
        "  waveform and the most recent NMF overlay.",
        "",
        "  \x1b[33moptions\x1b[0m  featureHash — use a specific stored NMF feature",
        "",
        "  \x1b[90mExample:\x1b[0m  visualizeNmf()",
      ].join("\n")),
    },
  );

  const visualizeNx = Object.assign(
    async function visualizeNx(options?: VisualizeNxOptions): Promise<BounceResult> {
      const audio = audioManager.getCurrentAudio();
      const targetHash = options?.featureHash ?? audio?.hash;
      if (!targetHash) {
        throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
      }

      const sample = await window.electron.getSampleByHash(targetHash);
      if (!sample) {
        throw new Error(`Sample ${targetHash} not found`);
      }

      const sampleAudioData = new Float32Array(
        sample.audio_data.buffer,
        sample.audio_data.byteOffset,
        sample.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );

      audioManager.setCurrentAudio({
        audioData: sampleAudioData,
        sampleRate: sample.sample_rate,
        duration: sample.duration,
        filePath: sample.file_path ?? undefined,
        hash: sample.hash,
        visualize: () => "NX Visualization",
        analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Not available" }),
      });

      await window.electron.sendCommand("visualize-nx", [targetHash]);
      return new BounceResult(`\x1b[32mNX visualization overlaid for ${targetHash.substring(0, 8)}\x1b[0m`);
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mvisualizeNx(options?)\x1b[0m",
        "",
        "  Overlay the NMF cross-synthesis result on the current waveform. Requires",
        "  nx() to have been run first.",
        "",
        "  \x1b[33moptions\x1b[0m  featureHash — use a specific stored feature",
        "",
        "  \x1b[90mExample:\x1b[0m  visualizeNx()",
      ].join("\n")),
    },
  );

  const onsetSlice = Object.assign(
    async function onsetSlice(_options?: OnsetSliceVisOptions): Promise<BounceResult> {
      const audio = audioManager.getCurrentAudio();
      if (!audio?.hash) {
        throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
      }

      const feature = await window.electron.getMostRecentFeature(audio.hash, "onset-slice");
      if (!feature) {
        throw new Error("No onset analysis found. Run sample.onsets() first.");
      }

      const slicesData = JSON.parse(feature.feature_data) as number[];
      const current = await window.electron.getSampleByHash(audio.hash);
      if (!current) {
        throw new Error(`Sample ${audio.hash} not found in database`);
      }
      const sample = bindSample({
        id: current.id,
        hash: current.hash,
        filePath: current.file_path ?? undefined,
        sampleRate: current.sample_rate,
        channels: current.channels,
        duration: current.duration,
      });
      const boundFeature = bindOnsetFeature(
        sample,
        feature.feature_hash,
        slicesData,
        undefined,
        `\x1b[32mOnset feature ${feature.feature_hash.substring(0, 8)} ready\x1b[0m`,
      );
      return bindVisScene(sample, `Onset Overlay · ${sampleLabel(sample.filePath, sample.hash)}`)
        .overlay(boundFeature)
        .show();
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36monsetSlice(options?)\x1b[0m",
        "",
        "  Compatibility helper: create a new vis scene with the current sample",
        "  waveform and the most recent onset overlay.",
        "",
        "  \x1b[33moptions\x1b[0m  featureHash — use a specific stored onset-slice feature",
        "",
        "  \x1b[90mExample:\x1b[0m  onsetSlice()",
      ].join("\n")),
    },
  );

  const nmf = Object.assign(
    async function nmf(_options?: NmfVisOptions): Promise<BounceResult> {
      const audio = audioManager.getCurrentAudio();
      if (!audio?.hash) {
        throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
      }

      const feature = await window.electron.getMostRecentFeature(audio.hash, "nmf");
      if (!feature) {
        throw new Error("No NMF analysis found. Run sample.nmf() first.");
      }

      const nmfData = JSON.parse(feature.feature_data) as {
        components: number;
        bases: number[][];
        activations: number[][];
      };
      const current = await window.electron.getSampleByHash(audio.hash);
      if (!current) {
        throw new Error(`Sample ${audio.hash} not found in database`);
      }
      const sample = bindSample({
        id: current.id,
        hash: current.hash,
        filePath: current.file_path ?? undefined,
        sampleRate: current.sample_rate,
        channels: current.channels,
        duration: current.duration,
      });
      const boundFeature = bindNmfFeature(
        sample,
        feature.feature_hash,
        undefined,
        nmfData.components,
        undefined,
        undefined,
        nmfData.bases,
        nmfData.activations,
        `\x1b[32mNMF feature ${feature.feature_hash.substring(0, 8)} ready\x1b[0m`,
      );

      return bindVisScene(sample, `NMF Panel · ${sampleLabel(sample.filePath, sample.hash)}`)
        .panel(boundFeature)
        .show();
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mnmf(options?)\x1b[0m",
        "",
        "  Compatibility helper: create a new vis scene with the current sample",
        "  waveform and a detailed NMF panel.",
        "",
        "  \x1b[33moptions\x1b[0m  featureHash — use a specific stored NMF feature",
        "",
        "  \x1b[90mExample:\x1b[0m  nmf()",
      ].join("\n")),
    },
  );

  const clearDebug = Object.assign(
    async function clearDebug(): Promise<BounceResult> {
      await window.electron.clearDebugLogs();
      return new BounceResult("\x1b[32mDebug logs cleared\x1b[0m");
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mclearDebug()\x1b[0m",
        "",
        "  Clear all entries from the debug log store.",
        "",
        "  \x1b[90mExample:\x1b[0m  clearDebug()",
      ].join("\n")),
    },
  );

  const debug = Object.assign(
    async function debug(limit = 20): Promise<BounceResult> {
      const logs = await window.electron.getDebugLogs(limit);
      const lines: string[] = [
        `\x1b[1;36mDebug Logs (${logs.length} entries):\x1b[0m`,
        "",
      ];

      for (const log of [...logs].reverse()) {
        const levelColor =
          log.level === "error" ? "\x1b[31m" :
          log.level === "warn" ? "\x1b[33m" : "\x1b[90m";
        const timestamp = new Date(log.timestamp).toISOString();
        const data = log.data ? ` ${log.data}` : "";
        lines.push(
          `${levelColor}[${timestamp}] ${log.level.toUpperCase()}: ${log.message}${data}\x1b[0m`,
        );
      }

      if (logs.length === 0) {
        lines.push("\x1b[90mNo debug logs found\x1b[0m");
      }

      return new BounceResult(lines.join("\n"));
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mdebug(limit?)\x1b[0m",
        "",
        "  Show the most recent entries from the SQLite debug log store.",
        "  Useful for diagnosing issues with audio processing or IPC.",
        "",
        "  \x1b[33mlimit\x1b[0m  Number of entries to show (default 20)",
        "",
        "  \x1b[90mExample:\x1b[0m  debug()",
        "           debug(50)",
      ].join("\n")),
    },
  );

  const granularize = Object.assign(
    async function granularize(
      source?: string | Sample | PromiseLike<Sample> | GranularizeOptions,
      options?: GranularizeOptions,
    ): Promise<GrainCollection> {
      const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
      const isOptionsArg =
        resolvedSource !== null &&
        resolvedSource !== undefined &&
        typeof resolvedSource === "object" &&
        !(resolvedSource instanceof Sample);
      const opts = isOptionsArg
        ? (resolvedSource as GranularizeOptions)
        : options;

      let hash: string;
      if (typeof resolvedSource === "string") {
        const loaded = await display(resolvedSource);
        hash = loaded.hash;
      } else if (resolvedSource instanceof Sample) {
        hash = resolvedSource.hash;
      } else {
        hash = getCurrentHash();
      }

      terminal.writeln("\x1b[36mGranularizing...\x1b[0m");

      const result = await window.electron.granularizeSample(hash, opts);

      const grains: Array<Sample | null> = result.grainHashes.map(
        (grainHash: string | null) => {
          if (grainHash === null) return null;
          return bindSample(
            {
              hash: grainHash,
              filePath: undefined,
              sampleRate: result.sampleRate,
              channels: 1,
              duration: result.grainDuration,
              id: undefined,
            },
            `\x1b[32mGrain: ${grainHash.substring(0, 8)}\x1b[0m`,
          );
        },
      );

      return new GrainCollection(grains, options?.normalize ?? false, hash);
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36msample.granularize(options?)\x1b[0m",
        "",
        "  Breaks an audio sample into grains and returns a GrainCollection.",
        "  Grains can be iterated, filtered, and played individually.",
        "",
        "  \x1b[33moptions\x1b[0m  grainSize (ms, default 20), hopSize (ms), jitter (0–1),",
        "           startTime (ms), endTime (ms), normalize, silenceThreshold (dBFS, default -60)",
        "",
        "  \x1b[90mExample:\x1b[0m  const samp = sn.read(\"loop.wav\")",
        "           const g = samp.granularize({ grainSize: 50, jitter: 0.2 })",
        "           g.length()",
      ].join("\n")),
    },
  );

  const sn = new SampleNamespace(
    [
      "\x1b[1;36msn\x1b[0m — sample namespace",
      "",
      "  sn.read(pathOrHash)   Load a sample and return a Sample object",
      "  sn.list()             List stored samples and features",
      "  sn.current()          Return the currently loaded sample, if any",
      "  sn.stop()             Stop all active sample playback",
      "",
      "\x1b[90mFor detailed usage:\x1b[0m sn.help(), sn.read.help(), const samp = sn.read('x'); samp.help()",
    ].join("\n"),
    {
      help: () => new BounceResult([
        "\x1b[1;36msn\x1b[0m — sample namespace",
        "",
        "  Use sn.read() to create Sample objects. Samples then expose methods for",
        "  playback, analysis, resynthesis, and help.",
        "",
        "  \x1b[90mExample:\x1b[0m  const samp = sn.read(\"loop.wav\")",
        "           samp.loop()",
        "           sn.stop()",
        "           const feature = samp.nmf()",
        "           feature.sep()",
      ].join("\n")),
      read: (pathOrHash) => display(pathOrHash),
      list: () => list(),
      current: async () => {
        const hash = audioManager.getCurrentAudio()?.hash;
        if (!hash) return null;
        const current = await window.electron.getSampleByHash(hash);
        if (!current) return null;
        return bindSample({
          id: current.id,
          hash: current.hash,
          filePath: current.file_path ?? undefined,
          sampleRate: current.sample_rate,
          channels: current.channels,
          duration: current.duration,
        });
      },
      stop: () => stop(),
    },
  );

  (sn.read as typeof sn.read & { help?: () => BounceResult }).help = () =>
    new BounceResult([
      "\x1b[1;36msn.read(pathOrHash)\x1b[0m",
      "",
      "  Load an audio file or stored sample hash into the shared sample context",
      "  and return a Sample object. Visualization is explicit via vis.",
      "",
      "  \x1b[90mExample:\x1b[0m  const samp = sn.read(\"kick.wav\")",
      "           const samp = sn.read(\"a1b2c3d4\")",
    ].join("\n"));

  (sn.list as typeof sn.list & { help?: () => BounceResult }).help = () => list.help();
  (sn.current as typeof sn.current & { help?: () => BounceResult }).help = () =>
    new BounceResult([
      "\x1b[1;36msn.current()\x1b[0m",
      "",
      "  Return the currently loaded sample or null if no sample is active.",
      "",
      "  \x1b[90mExample:\x1b[0m  const current = sn.current()",
      "           current?.help()",
    ].join("\n"));
  (sn.stop as typeof sn.stop & { help?: () => BounceResult }).help = () =>
    new BounceResult([
      "\x1b[1;36msn.stop()\x1b[0m",
      "",
      "  Stop all active sample playback and looping voices.",
      "",
      "  \x1b[90mExample:\x1b[0m  sn.stop()",
    ].join("\n"));

  const env = {
    help(): BounceResult {
      return envHelpText();
    },

    vars: Object.assign(
      function vars(): EnvScopeResult {
        const entries = (deps.runtime?.listScopeEntries() ?? [])
          .map((entry) => makeEnvEntry(entry.name, "user", entry.value))
          .sort((left, right) => left.name.localeCompare(right.name));

        return new EnvScopeResult(
          formatEnvScopeTable("Runtime Variables", entries, "No user-defined variables in scope."),
          entries,
          () => envScopeHelpText("vars"),
        );
      },
      {
        help: (): BounceResult => envScopeHelpText("vars"),
      },
    ),

    globals: Object.assign(
      function globals(): EnvScopeResult {
        const entries = getApiEntries()
          .map(([name, value]) => makeEnvEntry(name, "global", value))
          .sort((left, right) => left.name.localeCompare(right.name));

        return new EnvScopeResult(
          formatEnvScopeTable("Bounce Globals", entries, "No globals available."),
          entries,
          () => envScopeHelpText("globals"),
        );
      },
      {
        help: (): BounceResult => envScopeHelpText("globals"),
      },
    ),

    inspect: Object.assign(
      function inspect(nameOrValue: unknown): EnvInspectionResult {
        const target = resolveEnvTarget(nameOrValue);
        return formatEnvInspection(target.name, target.scope, target.value);
      },
      {
        help: (): BounceResult => envInspectHelpText(),
      },
    ),

    functions: Object.assign(
      function functions(nameOrValue: unknown): EnvFunctionListResult {
        const target = resolveEnvTarget(nameOrValue);
        const callableMembers =
          target.value && (typeof target.value === "object" || typeof target.value === "function")
            ? getCallablePropertyNames(target.value).sort()
            : [];
        const targetLabel = target.name ?? getRuntimeTypeLabel(target.value);
        const display = callableMembers.length === 0
          ? [
              `\x1b[1;36mCallable Members: ${targetLabel}\x1b[0m`,
              "",
              "\x1b[90mNo callable members found.\x1b[0m",
            ].join("\n")
          : [
              `\x1b[1;36mCallable Members: ${targetLabel}\x1b[0m`,
              "",
              ...callableMembers.map((name) => `  ${name}()`),
            ].join("\n");

        return new EnvFunctionListResult(
          display,
          getRuntimeTypeLabel(target.value),
          callableMembers,
          envFunctionsHelpText,
        );
      },
      {
        help: (): BounceResult => envFunctionsHelpText(),
      },
    ),
  };

  const proj = new ProjectNamespace(
    [
      "\x1b[1;36mproj\x1b[0m — project namespace",
      "",
      "  proj.current()        Show the active project",
      "  proj.list()           List all projects",
      "  proj.load(name)       Load a project, creating it if needed",
      "  proj.rm(name)         Remove a project and its scoped data",
      "",
      "\x1b[90mFor detailed usage:\x1b[0m proj.help(), proj.list.help(), proj.load.help()",
    ].join("\n"),
    {
      help: () =>
        new BounceResult([
          "\x1b[1;36mproj\x1b[0m — project namespace",
          "",
          "  Projects scope persisted samples, features, and command history.",
          "  Bounce always keeps one current project selected.",
          "",
          "  \x1b[90mExamples:\x1b[0m  proj.current()",
          "            proj.list()",
          "            proj.load(\"drums\")",
          "            proj.rm(\"drums\")",
        ].join("\n")),
      current: async () => {
        const project = await window.electron.getCurrentProject();
        if (!project) {
          throw new Error("No current project is available.");
        }
        return bindProject(project);
      },
      list: async () => {
        const projects = await window.electron.listProjects();
        const summaries: ProjectSummary[] = projects.map((project) => ({
          id: project.id,
          name: project.name,
          createdAt: project.created_at,
          sampleCount: project.sample_count,
          featureCount: project.feature_count,
          commandCount: project.command_count,
          current: project.current,
        }));
        return new ProjectListResult(
          formatProjectsTable(projects),
          summaries,
          projectListHelpText,
        );
      },
      load: async (name: string) => {
        const project = await window.electron.loadProject(name);
        dispatchProjectChanged();
        return bindProject(project, "Loaded Project");
      },
      rm: async (name: string) => {
        const result = await window.electron.removeProject(name);
        return new BounceResult(
          `\x1b[32mRemoved project ${result.removedName}.\x1b[0m`,
        );
      },
    },
  );

  (proj.current as typeof proj.current & { help?: () => BounceResult }).help = () =>
    new BounceResult([
      "\x1b[1;36mproj.current()\x1b[0m",
      "",
      "  Return the active project and its stored counts.",
      "",
      "  \x1b[90mExample:\x1b[0m  proj.current()",
    ].join("\n"));
  (proj.list as typeof proj.list & { help?: () => BounceResult }).help = () =>
    projectListHelpText();
  (proj.load as typeof proj.load & { help?: () => BounceResult }).help = () =>
    new BounceResult([
      "\x1b[1;36mproj.load(name)\x1b[0m",
      "",
      "  Load a project by name. If it does not exist, Bounce creates it and",
      "  makes it the current project.",
      "",
      "  \x1b[90mExample:\x1b[0m  proj.load(\"drums\")",
    ].join("\n"));
  (proj.rm as typeof proj.rm & { help?: () => BounceResult }).help = () =>
    new BounceResult([
      "\x1b[1;36mproj.rm(name)\x1b[0m",
      "",
      "  Remove a project and all samples, features, and command history",
      "  stored inside it. The current project cannot be removed.",
      "",
      "  \x1b[90mExample:\x1b[0m  proj.rm(\"drums\")",
    ].join("\n"));

  const vis = {
    help(): BounceResult {
      return visHelpText();
    },

    waveform: Object.assign(
      function waveform(sampleOrPromise: Sample | PromiseLike<Sample>): VisScene {
        if (isPromiseLike<Sample>(sampleOrPromise)) {
          throw new Error("vis.waveform() requires a resolved Sample. Assign sn.read(...) to a variable first.");
        }
        return bindVisScene(sampleOrPromise, `Waveform · ${sampleLabel(sampleOrPromise.filePath, sampleOrPromise.hash)}`);
      },
      {
        help: (): BounceResult => visWaveformHelpText(),
      },
    ),

    stack: Object.assign(
      function stack(): VisStack {
        const bound = bindVisStack();
        (bound as VisStack & {
          waveform: (sampleOrPromise: Sample | PromiseLike<Sample>) => VisStack;
        }).waveform = (sampleOrPromise: Sample | PromiseLike<Sample>) => {
          if (isPromiseLike<Sample>(sampleOrPromise)) {
            throw new Error("vis.stack().waveform() requires a resolved Sample. Assign sn.read(...) to a variable first.");
          }
          return bound.addScene(
            bindVisScene(
              sampleOrPromise,
              `Waveform · ${sampleLabel(sampleOrPromise.filePath, sampleOrPromise.hash)}`,
            ),
          );
        };
        return bound;
      },
      {
        help: (): BounceResult => visStackHelpText(),
      },
    ),

    list: Object.assign(
      function listScenes(): VisSceneListResult {
        const scenes = getSceneManager().listScenes();
        const display = scenes.length === 0
          ? "\x1b[90mNo visualization scenes shown\x1b[0m"
          : [
            "\x1b[1;36mVisualization Scenes\x1b[0m",
            "",
            ...scenes.map((scene) =>
              `${scene.id.padEnd(10)} ${scene.title} \x1b[90m(${scene.overlayCount} overlays, ${scene.panelCount} panels)\x1b[0m`,
            ),
          ].join("\n");
        return new VisSceneListResult(display, scenes, visListHelpText);
      },
      {
        help: (): BounceResult => visListHelpText(),
      },
    ),

    remove: Object.assign(
      function removeScene(id: string): BounceResult {
        const removed = getSceneManager().removeScene(id);
        if (!removed) {
          throw new Error(`Scene ${id} not found.`);
        }
        return new BounceResult(`\x1b[32mRemoved scene ${id}\x1b[0m`);
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mvis.remove(id)\x1b[0m",
          "",
          "  Remove a shown visualization scene by id.",
          "",
          "  \x1b[90mExample:\x1b[0m  vis.remove(\"scene-1\")",
        ].join("\n")),
      },
    ),

    clear: Object.assign(
      function clearScenes(): BounceResult {
        const removed = getSceneManager().clearScenes();
        return new BounceResult(`\x1b[32mCleared ${removed} visualization scene${removed === 1 ? "" : "s"}\x1b[0m`);
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mvis.clear()\x1b[0m",
          "",
          "  Remove all shown visualization scenes.",
          "",
          "  \x1b[90mExample:\x1b[0m  vis.clear()",
        ].join("\n")),
      },
    ),
  };

  const help = Object.assign(
    function help(): BounceResult {
      return new BounceResult([
        "\x1b[1;36mBounce REPL\x1b[0m",
        "",
        "\x1b[1;36m── Sample API ──\x1b[0m",
        "  \x1b[33msn\x1b[0m                               Sample namespace: .read() .list() .current() .stop() .help()",
        "  \x1b[33menv\x1b[0m                              Runtime introspection: .vars() .globals() .inspect() .functions()",
        "  \x1b[33mproj\x1b[0m                             Project namespace: .current() .list() .load() .rm() .help()",
        "  \x1b[33mSample\x1b[0m                           .play() .loop() .stop() .display() .onsets() .nmf() .mfcc()",
        "                                   .slice() .sep() .granularize() .help()",
        "  \x1b[33mvis\x1b[0m                              Visualization namespace: .waveform() .list() .remove() .clear()",
        "  \x1b[33mnx(options)\x1b[0m                      NMF cross-synthesis",
        "  \x1b[33mcorpus\x1b[0m                           KDTree corpus: .build() .query() .resynthesize()",
        "",
        "\x1b[1;36m── Utilities ──\x1b[0m",
        "  \x1b[33mvisualizeNmf(options?)\x1b[0m           Legacy helper: vis waveform + NMF overlay",
        "  \x1b[33mvisualizeNx(options?)\x1b[0m            Legacy helper for NX visualization",
        "  \x1b[33monsetSlice(options?)\x1b[0m             Legacy helper: vis waveform + onset overlay",
        "  \x1b[33mnmf(options?)\x1b[0m                    Legacy helper: vis waveform + NMF panel",
        "  \x1b[33mfs\x1b[0m                               Filesystem: .ls .la .cd .pwd .glob .walk",
        "  \x1b[33mdebug(limit?)\x1b[0m                   Show debug log entries",
        "  \x1b[33mclearDebug()\x1b[0m                    Clear stored debug log entries",
        "  \x1b[33mhelp()\x1b[0m                           Show this help message",
        "  \x1b[33mclear()\x1b[0m                          Clear the terminal screen",
        "",
        "\x1b[90mCompose commands:\x1b[0m",
        "  const samp = sn.read(\"path\")                           \x1b[90m# load sample\x1b[0m",
        "  env.inspect(\"samp\")                                   \x1b[90m# inspect a binding\x1b[0m",
        "  proj.load(\"drums\")                                    \x1b[90m# switch project context\x1b[0m",
        "  const onsets = samp.onsets(); onsets.slice()            \x1b[90m# onset workflow\x1b[0m",
        "  const feature = samp.nmf(); feature.sep()               \x1b[90m# NMF separation\x1b[0m",
        "  vis.waveform(samp).overlay(onsets).show()               \x1b[90m# explicit visualization\x1b[0m",
        "  corpus.build(samp) → corpus.query(0, 5)                 \x1b[90m# corpus search\x1b[0m",
        "",
        "\x1b[90mFor detailed usage:\x1b[0m \x1b[33mobj.help()\x1b[0m  \x1b[90me.g. sn.help(), vis.help(), const samp = sn.read(\"x\"); samp.help(), fs.help()\x1b[0m",
      ].join("\n"));
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mhelp()\x1b[0m",
        "",
        "  Show the organized command reference. For detailed usage of a specific",
        "  command or object, call its .help() method directly.",
        "",
        "  \x1b[90mExample:\x1b[0m  help()",
        "           sn.help()",
        "           corpus.help()",
      ].join("\n")),
    },
  );

  const clear = Object.assign(
    function clear(): void {
      terminal.clear();
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mclear()\x1b[0m",
        "",
        "  Clear the terminal screen.",
        "",
        "  \x1b[90mExample:\x1b[0m  clear()",
      ].join("\n")),
    },
  );

  const corpus = {
    help(): BounceResult {
      return new BounceResult([
        "\x1b[1;36mcorpus\x1b[0m — KDTree corpus for nearest-neighbor resynthesis",
        "",
        "  corpus.\x1b[33mbuild\x1b[0m(source?)",
        "    Build a KDTree from the onset slices of an audio file. Requires",
        "    sample.onsets() and sample.slice() to have been run first.",
        "    \x1b[90mExample:\x1b[0m  const samp = sn.read('loop.wav')",
        "                     corpus.build(samp)",
        "",
        "  corpus.\x1b[33mquery\x1b[0m(segmentIndex, k?)",
        "    Find the k nearest corpus segments to the segment at segmentIndex.",
        "    k defaults to 5. Returns a ranked list of indices and distances.",
        "    \x1b[90mExample:\x1b[0m  corpus.query(0, 5)",
        "",
        "  corpus.\x1b[33mresynthesize\x1b[0m(queryIndices)",
        "    Concatenate and play corpus segments by index array.",
        "    \x1b[90mExample:\x1b[0m  corpus.resynthesize([0, 3, 7, 2])",
        "",
        "  \x1b[90mFull workflow:\x1b[0m",
        "    const samp = sn.read('loop.wav')",
        "    samp.onsets()",
        "    samp.slice()",
        "    corpus.build(samp)",
        "    corpus.query(0, 5)             \x1b[90m# find 5 neighbors of segment 0\x1b[0m",
        "    corpus.resynthesize([0, 3, 7])",
      ].join("\n"));
    },
    /**
     * Build the corpus from the slices of the currently loaded audio.
     * Looks up the most recent onset-slice feature automatically.
     * Can also be called with a Sample or explicit (sourceHash, featureHash) strings.
     */
    async build(
      source?: string | Sample | PromiseLike<Sample>,
      featureHashOverride?: string,
    ): Promise<BounceResult> {
      let sourceHash: string;
      let featureHash: string;

      if (typeof source === "string") {
        sourceHash = source;
        if (!featureHashOverride) throw new Error("featureHash required when passing sourceHash as string.");
        featureHash = featureHashOverride;
      } else {
        let resolved: Sample | undefined;
        if (source !== undefined) resolved = await resolveSample(source as Sample | PromiseLike<Sample>);
        const hash = resolved?.hash ?? audioManager.getCurrentAudio()?.hash;
        if (!hash) throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
        sourceHash = hash;

        if (featureHashOverride) {
          featureHash = featureHashOverride;
        } else {
          const feature = await window.electron.getMostRecentFeature(sourceHash, "onset-slice");
          if (!feature) throw new Error("No onset-slice feature found. Run sample.onsets() then sample.slice() first.");
          featureHash = feature.feature_hash;
        }
      }

      terminal.writeln("\x1b[36mBuilding corpus…\x1b[0m");

      const result = await window.electron.corpusBuild(sourceHash, featureHash);

      return new BounceResult(`\x1b[32mBuilt corpus: ${result.segmentCount} segments, ${result.featureDims}-dim features, KDTree ready\x1b[0m`);
    },

    /**
     * Find the k nearest corpus segments to the segment at segmentIndex.
     * @param segmentIndex  Index of the query segment (0-based)
     * @param k             Number of neighbors to return (default 5)
     */
    async query(segmentIndex: number, k = 5): Promise<BounceResult> {
      terminal.writeln(`\x1b[36mQuerying corpus for segment ${segmentIndex}, k=${k}…\x1b[0m`);

      const results = await window.electron.corpusQuery(segmentIndex, k);

      const lines: string[] = [
        `\x1b[1;36mNearest neighbors for segment ${segmentIndex}:\x1b[0m`,
        `${"Rank".padEnd(6)}${"Index".padEnd(8)}${"Distance".padEnd(12)}`,
        "─".repeat(26),
      ];
      results.forEach((r: { index: number; distance: number }, i: number) => {
        lines.push(`${String(i + 1).padEnd(6)}${String(r.index).padEnd(8)}${r.distance.toFixed(4)}`);
      });

      const msg = lines.join("\n");
      return new BounceResult(msg);
    },

    /**
     * Concatenate and play the matched corpus segments from a previous query.
     * @param queryIndices  Array of segment indices (e.g. from corpus.query())
     */
    async resynthesize(queryIndices: number[]): Promise<BounceResult> {
      terminal.writeln(`\x1b[36mResynthesizing ${queryIndices.length} segments…\x1b[0m`);

      const { audio, sampleRate } = await window.electron.corpusResynthesize(queryIndices);

      audioManager.clearSlices();
      await audioManager.playAudio(audio, sampleRate);

      const msg = `\x1b[32mResynthesis complete: ${queryIndices.length} segments, ${(audio.length / sampleRate).toFixed(2)}s\x1b[0m`;
      return new BounceResult(msg);
    },
  };

  // ---------------------------------------------------------------------------
  // Filesystem utilities
  // ---------------------------------------------------------------------------

  const FileType = {
    File:        "file",
    Directory:   "directory",
    Symlink:     "symlink",
    BlockDevice: "blockDevice",
    CharDevice:  "charDevice",
    FIFO:        "fifo",
    Socket:      "socket",
    Unknown:     "unknown",
  } as const;

  type FileTypeValue = typeof FileType[keyof typeof FileType];
  type WalkEntry = { path: string; type: FileTypeValue };
  type WalkCatchAll = (filePath: string, type: FileTypeValue) => Promise<void>;
  type WalkHandlers = Partial<Record<FileTypeValue, (filePath: string) => Promise<void>>>;


  const fs = {
    FileType,

    help(): BounceResult {
      return new BounceResult([
        "\x1b[1;36mfs\x1b[0m — Filesystem utilities",
        "",
        "  fs.\x1b[33mls\x1b[0m(path?)              List directory contents (dotfiles hidden)",
        "  fs.\x1b[33mla\x1b[0m(path?)              List directory contents including dotfiles",
        "  fs.\x1b[33mcd\x1b[0m(path)               Change working directory (persists across restarts)",
        "  fs.\x1b[33mpwd\x1b[0m()                  Print current working directory",
        "  fs.\x1b[33mglob\x1b[0m(pattern)          Find files matching a glob pattern (e.g. **/*.wav)",
        "  fs.\x1b[33mwalk\x1b[0m(path, handler)    Recursively walk a directory; handler fires per entry",
        "",
        "\x1b[90mFor detailed usage:\x1b[0m \x1b[33mfs.ls.help()\x1b[0m, \x1b[33mfs.walk.help()\x1b[0m, etc.",
      ].join("\n"));
    },

    ls: Object.assign(
      function ls(dirPath?: string): LsResultPromise {
        return new LsResultPromise(
          (async () => {
            const { entries, truncated, total } = await window.electron.fsLs(dirPath);
            const msg = formatLsEntries(entries, truncated, total);
            return new LsResult(msg, entries, total, truncated);
          })(),
        );
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.ls(path?)\x1b[0m",
          "",
          "  List the contents of a directory. Dotfiles and hidden entries are",
          "  omitted. Use fs.la() to show everything.",
          "",
          "  Directories are shown in \x1b[34mblue\x1b[0m; audio files in \x1b[32mgreen\x1b[0m.",
          "  Output is capped at 200 entries.",
          "",
          "  \x1b[33mpath\x1b[0m  Optional path (absolute, relative, or ~). Defaults to cwd.",
          "",
          "  \x1b[90mExamples:\x1b[0m  fs.ls()",
          "            fs.ls('~/samples')",
          "            fs.ls('../other')",
        ].join("\n")),
      },
    ),

    la: Object.assign(
      function la(dirPath?: string): LsResultPromise {
        return new LsResultPromise(
          (async () => {
            const { entries, truncated, total } = await window.electron.fsLa(dirPath);
            const msg = formatLsEntries(entries, truncated, total);
            return new LsResult(msg, entries, total, truncated);
          })(),
        );
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.la(path?)\x1b[0m",
          "",
          "  Like fs.ls(), but includes dotfiles and hidden entries.",
          "",
          "  \x1b[33mpath\x1b[0m  Optional path (absolute, relative, or ~). Defaults to cwd.",
          "",
          "  \x1b[90mExamples:\x1b[0m  fs.la()",
          "            fs.la('~/samples')",
        ].join("\n")),
      },
    ),

    cd: Object.assign(
      async function cd(dirPath: string): Promise<BounceResult> {
        const newCwd = await window.electron.fsCd(dirPath);
        return new BounceResult(`\x1b[32m${newCwd}\x1b[0m`);
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.cd(path)\x1b[0m",
          "",
          "  Change the REPL's current working directory. The new cwd is persisted",
          "  to disk and restored on the next app launch. Supports ~ expansion and",
          "  relative paths.",
          "",
          "  \x1b[33mpath\x1b[0m  Target directory (absolute, relative, or starting with ~).",
          "",
          "  \x1b[90mExamples:\x1b[0m  fs.cd('~/samples')",
          "            fs.cd('../other')",
          "            fs.cd('/Volumes/SampleDrive')",
        ].join("\n")),
      },
    ),

    pwd: Object.assign(
      async function pwd(): Promise<BounceResult> {
        const cwd = await window.electron.fsPwd();
        return new BounceResult(cwd);
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.pwd()\x1b[0m",
          "",
          "  Print the current working directory. Relative paths in display()",
          "  and other commands resolve against this path.",
          "",
          "  \x1b[90mExample:\x1b[0m  fs.pwd()",
        ].join("\n")),
      },
    ),

    glob: Object.assign(
      function glob(pattern: string): GlobResultPromise {
        return new GlobResultPromise(
          (async () => {
            const paths = await window.electron.fsGlob(pattern);
            return new GlobResult(paths);
          })(),
        );
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.glob(pattern)\x1b[0m",
          "",
          "  Find files matching a glob pattern relative to the current working",
          "  directory. Supports full glob syntax including ** for recursive search.",
          "  Returns a sorted string[] of absolute paths and prints each match.",
          "",
          "  \x1b[33mpattern\x1b[0m  Glob pattern string.",
          "",
          "  \x1b[90mExamples:\x1b[0m  fs.glob('*.wav')",
          "            fs.glob('**/*.{wav,flac}')",
          "            fs.glob('drums/**/*.wav')",
        ].join("\n")),
      },
    ),

    walk: Object.assign(
      async function walk(
        dirPath: string,
        handler: WalkCatchAll | WalkHandlers,
      ): Promise<BounceResult | undefined> {
        const { entries, truncated } = await window.electron.fsWalk(dirPath);
        const typedEntries = entries as WalkEntry[];
        for (const entry of typedEntries) {
          if (typeof handler === "function") {
            await handler(entry.path, entry.type);
          } else {
            const cb = handler[entry.type];
            if (cb) await cb(entry.path);
          }
        }
        if (truncated) {
          return new BounceResult(`\x1b[33mWarning: walk truncated at 10,000 entries\x1b[0m`);
        }
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.walk(path, handler)\x1b[0m",
          "",
          "  Recursively walk a directory, calling handler for each entry.",
          "  Walk is capped at 10,000 entries.",
          "",
          "  \x1b[33mpath\x1b[0m     Directory to walk (absolute, relative, or ~).",
          "  \x1b[33mhandler\x1b[0m  Either a catch-all callback or a handler-map keyed by fs.FileType.",
          "",
          "  Catch-all — receives every entry:",
          "    \x1b[90mfs.walk('~/samples', (filePath, type) => {\x1b[0m",
          "    \x1b[90m  if (type === fs.FileType.File) return sn.read(filePath);\x1b[0m",
          "    \x1b[90m});\x1b[0m",
          "",
          "  Handler map — only listed types fire, rest are silently skipped:",
          "    \x1b[90mfs.walk('~/samples', {\x1b[0m",
          "    \x1b[90m  [fs.FileType.File]: (p) => sn.read(p),\x1b[0m",
          "    \x1b[90m  [fs.FileType.Directory]: (p) => { console.log(p); },\x1b[0m",
          "    \x1b[90m});\x1b[0m",
          "",
          "  fs.FileType values: File · Directory · Symlink · BlockDevice",
          "                      CharDevice · FIFO · Socket · Unknown",
        ].join("\n")),
      },
    ),
  };

  api = {
    sn,
    env,
    vis,
    nx,
    visualizeNmf,
    visualizeNx,
    onsetSlice,
    nmf,
    clearDebug,
    debug,
    help,
    clear,
    corpus,
    fs,
    proj,
  };

  return api;
}
