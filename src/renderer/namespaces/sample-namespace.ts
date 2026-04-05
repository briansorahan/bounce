/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  SampleResult,
  SliceFeatureResult,
  NmfFeatureResult,
  NxFeatureResult,
  MfccFeatureResult,
  SampleListResult,
  SamplePromise,
  CurrentSamplePromise,
  SliceFeaturePromise,
  NmfFeaturePromise,
  NxFeaturePromise,
  MfccFeaturePromise,
  GrainCollectionPromise,
  type SampleSummaryFeature,
  InputsResult,
  AudioDeviceResult,
  RecordingHandleResult,
  type AudioInputDevice,
  type RecordOptions,
  InstrumentResult,
} from "../bounce-result.js";
import { GrainCollection } from "../grain-collection.js";
import type { NamespaceDeps } from "./types.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { snCommands } from "./sn-commands.generated.js";
export { snCommands } from "./sn-commands.generated.js";

/** @deprecated Will be removed in Phase 5.3 when help codegen is replaced. */
export const sampleNamespaceCommands = snCommands;

export interface SampleBinder {
  bindSample(
    sample: {
      hash: string;
      filePath: string | undefined;
      sampleRate: number;
      channels: number;
      duration: number;
      id?: number;
    },
    displayText?: string,
  ): SampleResult;
}

@namespace("sn", { summary: "Load and play audio samples; entry point for all audio analysis" })
export class SampleNamespace implements SampleBinder {
  private readonly terminal: NamespaceDeps["terminal"];
  private readonly audioManager: NamespaceDeps["audioManager"];
  private readonly supportedExtensions = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".opus"];

  /** Namespace summary — used by the globals help() function. */
  readonly description = "Load and play audio samples; entry point for all audio analysis";

  constructor(private readonly deps: NamespaceDeps) {
    this.terminal = deps.terminal;
    this.audioManager = deps.audioManager;
  }

  // ── Injected by @namespace decorator — do not implement manually ──────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  help(): unknown {
    // Replaced at class definition time by the @namespace decorator.
    return undefined;
  }

  toString(): string {
    return String(this.help());
  }

  // ── Public REPL-facing methods ────────────────────────────────────────────

  @describe({
    summary: "Load an audio file from disk and return a SampleResult object",
    returns: "SamplePromise",
  })
  @param("path", {
    summary: "File path (absolute, relative, or ~). Supports WAV, MP3, OGG, FLAC, M4A, AAC, OPUS.",
    kind: "filePath",
  })
  read(path: string): SamplePromise {
    return new SamplePromise(this.display(path));
  }

  @describe({
    summary: "Load a stored sample by hash and return a SampleResult object",
    returns: "SamplePromise",
  })
  @param("hash", { summary: "Full or prefix hash from sn.list().", kind: "sampleHash" })
  load(hash: string): SamplePromise {
    return new SamplePromise(this.loadByHash(hash));
  }

  @describe({ summary: "List stored samples and features in the database" })
  list(): Promise<SampleListResult> {
    return this.listSamples();
  }

  @describe({ summary: "Return the currently loaded sample, or null", returns: "CurrentSamplePromise" })
  current(): CurrentSamplePromise {
    return new CurrentSamplePromise(
      (async () => {
        const hash = this.audioManager.getCurrentAudio()?.hash;
        if (!hash) return null;
        const cur = await window.electron.getSampleByHash(hash);
        if (!cur) return null;
        return this.bindSample({
          id: cur.id,
          hash: cur.hash,
          filePath: cur.display_name ?? undefined,
          sampleRate: cur.sample_rate,
          channels: cur.channels,
          duration: cur.duration,
        });
      })(),
    );
  }

  @describe({ summary: "Stop all active sample playback and looping voices" })
  stop(): BounceResult {
    return this.stopAudio();
  }

  @describe({ summary: "List available audio input devices. Use the index shown to open a device with sn.dev(index)." })
  inputs(): Promise<InputsResult> {
    return this.getAudioInputs().then((devs) => new InputsResult(devs));
  }

  @describe({
    summary: "Open an audio input device by index for recording. Call device.record() to start recording.",
    returns: "AudioDeviceResult",
  })
  @param("index", { summary: "Device index from sn.inputs()." })
  async dev(index: number): Promise<AudioDeviceResult> {
    const devs = await this.getAudioInputs();
    if (index < 0 || index >= devs.length) {
      throw new Error(
        `Device index ${index} out of range. Run sn.inputs() to see available devices (0–${devs.length - 1}).`,
      );
    }
    const d = devs[index];
    return new AudioDeviceResult(index, d.deviceId, d.label, 1, {
      record: (sampleId, opts) => this.recordSample(d.deviceId, d.label, sampleId, opts),
    });
  }

  // ── SampleBinder implementation (plumbing — used by corpus namespace) ─────

  @describe({
    summary: "Bind a raw sample record to a SampleResult with bound methods (internal use)",
    visibility: "plumbing",
    returns: "SampleResult",
  })
  bindSample(
    sample: {
      hash: string;
      filePath: string | undefined;
      sampleRate: number;
      channels: number;
      duration: number;
      id?: number;
    },
    displayText = this.makeSampleDisplayText(sample),
  ): SampleResult {
    const bound: SampleResult = new SampleResult(
      displayText,
      sample.hash,
      sample.filePath,
      sample.sampleRate,
      sample.channels,
      sample.duration,
      sample.id,
      {
        help: (): BounceResult => this.sampleHelpText(bound),
        play: () => this.playAudio(bound),
        loop: Object.assign(
          (opts?: { loopStart?: number; loopEnd?: number }) => this.loopAudio(bound, opts),
          { help: () => this.loopHelpText() },
        ),
        stop: () => this.stopAudio(bound),
        display: () => this.loadByHash(bound.hash),
        slice: (options) => this.sliceSamples(bound, options),
        sep: (options) => this.sepAudio(bound, options),
        granularize: (options) => this.granularizeSample(bound, options),
        onsetSlice: (options) => this.analyze(bound, options),
        ampSlice: (options) => this.analyzeAmpSlice(bound, options),
        noveltySlice: (options) => this.analyzeNoveltySlice(bound, options),
        transientSlice: (options) => this.analyzeTransientSlice(bound, options),
        nmf: (options) => this.analyzeNmf(bound, options),
        mfcc: (options) => this.analyzeMFCC(bound, options),
        nx: (other, options) => this.analyzeNx(bound, other, options),
      },
    );
    return bound;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private sampleLabel(filePath: string | undefined, hash: string): string {
    return filePath?.split("/").pop() ?? hash.substring(0, 8);
  }

  private ensureSupportedInput(filePath: string): void {
    const isHash =
      /^[0-9a-f]{8,}$/i.test(filePath) &&
      !filePath.includes("/") &&
      !filePath.includes("\\");

    if (isHash) {
      throw new Error(
        `sn.read() accepts file paths only. Use sn.load("${filePath}") to load a sample by hash.`,
      );
    }

    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf("."));
    if (!this.supportedExtensions.includes(ext)) {
      throw new Error("Unsupported file format. Supported: WAV, MP3, OGG, FLAC, M4A, AAC, OPUS");
    }
  }

  private isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    return (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "then" in (value as object) &&
      typeof (value as { then: unknown }).then === "function"
    );
  }

  private getCurrentHash(): string {
    const hash = this.audioManager.getCurrentAudio()?.hash;
    if (!hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }
    return hash;
  }

  private makeSampleDisplayText(
    sample: {
      hash: string;
      filePath: string | undefined;
      sampleRate: number;
      channels: number;
      duration: number;
    },
    title = "SampleResult",
  ): string {
    return [
      `\x1b[32m${title}: ${this.sampleLabel(sample.filePath, sample.hash)}\x1b[0m`,
      `\x1b[90mhash ${sample.hash.substring(0, 8)} · ${sample.sampleRate}Hz · ${sample.channels}ch · ${sample.duration.toFixed(3)}s\x1b[0m`,
    ].join("\n");
  }

  private sampleHelpText(sample: SampleResult): BounceResult {
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
      "    sample.loop({ loopStart?, loopEnd? })",
      "    sample.stop()",
      "    sample.display()",
      "    sample.onsetSlice()",
      "    sample.ampSlice()",
      "    sample.noveltySlice()",
      "    sample.transientSlice()",
      "    sample.nmf()",
      "    sample.mfcc()",
      "    sample.slice(options?)",
      "    sample.sep(options?)",
      "    sample.granularize(options?)",
      "",
      "  Type sample.loop.help() for loop usage details.",
    ].join("\n"));
  }

  private loopHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36msample.loop(opts?)\x1b[0m",
      "",
      "  Loop the sample, optionally within a time range.",
      "",
      "  Options:",
      "    loopStart  number  Start of loop region in seconds (default: 0)",
      "    loopEnd    number  End of loop region in seconds (default: sample end)",
      "",
      "  Examples:",
      "    samp.loop()",
      "    samp.loop({ loopStart: 0.5 })",
      "    samp.loop({ loopStart: 0.5, loopEnd: 2.0 })",
    ].join("\n"));
  }

  private onsetHelpText(feature: SliceFeatureResult): BounceResult {
    return new BounceResult([
      `\x1b[1;36mSliceFeature ${feature.featureHash.substring(0, 8)}\x1b[0m`,
      "",
      `  source: ${feature.sourceHash.substring(0, 8)}`,
      `  slices: ${feature.count}`,
      "",
      "  Methods:",
      "    feature.slice(options?)",
      "    feature.playSlice(index?)",
      "    feature.toSampler({ name, startNote?, polyphony? })",
    ].join("\n"));
  }

  private nmfHelpText(feature: NmfFeatureResult): BounceResult {
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

  private mfccHelpText(feature: MfccFeatureResult): BounceResult {
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

  private nxFeatureHelpText(feature: NxFeatureResult): BounceResult {
    return new BounceResult([
      `\x1b[1;36mNxFeature ${feature.featureHash.substring(0, 8)}\x1b[0m`,
      `  components : ${feature.components}`,
      `  source     : ${feature.sourceSampleHash.substring(0, 8)}`,
      ``,
      `\x1b[90mMethods:\x1b[0m`,
      `  .playComponent(index?)   play a resynthesized component`,
      ``,
      `\x1b[90mVisualize:\x1b[0m`,
      `  vis.waveform(samp).overlay(samp.nx(other)).show()`,
    ].join("\n"));
  }

  private bindSliceFeature(
    source: SampleResult,
    featureHash: string,
    slices: number[],
    options?: Record<string, unknown>,
    displayText = `\x1b[32mFound ${slices.length} onset slices (feature: ${featureHash.substring(0, 8)})\x1b[0m`,
  ): SliceFeatureResult {
    const bound: SliceFeatureResult = new SliceFeatureResult(
      displayText,
      source,
      featureHash,
      options,
      slices,
      {
        help: (): BounceResult => this.onsetHelpText(bound),
        slice: (sliceOptions) => this.sliceSamples(bound, sliceOptions),
        playSlice: (index = 0) => this.playSliceAudio(index, bound),
        toSampler: (opts) => this.toSamplerBinding(source, featureHash, opts),
      },
    );
    return bound;
  }

  private async toSamplerBinding(
    sample: SampleResult,
    featureHash: string,
    opts: { name: string; startNote?: number; polyphony?: number },
  ): Promise<InstrumentResult> {
    const { name, startNote = 36, polyphony = 16 } = opts;

    const sliceRecords = await window.electron.createSliceSamples(sample.hash, featureHash);

    const maxNotes = 128 - startNote;
    const toLoad = sliceRecords.slice(0, maxNotes);
    const dropped = sliceRecords.length - toLoad.length;

    const instrumentId = `inst_${name}_${Date.now()}`;
    window.electron.defineInstrument(instrumentId, "sampler", polyphony);

    window.electron.createDbInstrument?.(name, "sampler", { polyphony })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[toSampler] Failed to persist instrument: ${msg}`);
      });

    for (const { hash: sliceHash, index } of toLoad) {
      const note = startNote + index;
      window.electron.loadInstrumentSample(instrumentId, note, sliceHash);
      window.electron.addDbInstrumentSample?.(name, sliceHash, note, false, 0, -1)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[toSampler] Failed to persist sample: ${msg}`);
        });
    }

    let displayLine = `${name} (sampler, ${toLoad.length} notes loaded, polyphony ${polyphony})`;
    if (dropped > 0) {
      displayLine = `\x1b[33mWarning: ${dropped} slices beyond note 127 were dropped.\x1b[0m\n${displayLine}`;
    }

    return new InstrumentResult(
      displayLine,
      instrumentId,
      name,
      "sampler",
      polyphony,
      toLoad.length,
      () => new BounceResult(`${name} (${toLoad.length} samples loaded)`),
    );
  }

  private bindNmfFeature(
    source: SampleResult,
    featureHash: string,
    options: NmfOptions | undefined,
    components: number | undefined,
    iterations: number | undefined,
    converged: boolean | undefined,
    bases: number[][] | Float32Array[] | undefined,
    activations: number[][] | Float32Array[] | undefined,
    displayText: string,
  ): NmfFeatureResult {
    const bound: NmfFeatureResult = new NmfFeatureResult(
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
        help: (): BounceResult => this.nmfHelpText(bound),
        sep: (sepOptions) => this.sepAudio(bound, sepOptions),
        playComponent: (index = 0) => this.playComponentAudio(index, bound),
      },
    );
    return bound;
  }

  private bindMfccFeature(
    source: SampleResult,
    featureHash: string,
    options: MFCCOptions | undefined,
    numFrames: number,
    numCoeffs: number,
    displayText: string,
  ): MfccFeatureResult {
    const bound: MfccFeatureResult = new MfccFeatureResult(
      displayText,
      source,
      featureHash,
      options,
      numFrames,
      numCoeffs,
      {
        help: (): BounceResult => this.mfccHelpText(bound),
      },
    );
    return bound;
  }

  private bindNxFeature(
    target: SampleResult,
    featureHash: string,
    components: number,
    sourceSampleHash: string,
    sourceFeatureHash: string,
    bases: number[][] | undefined,
    activations: number[][] | undefined,
  ): NxFeatureResult {
    const bound: NxFeatureResult = new NxFeatureResult(
      `\x1b[32mNX cross-synthesis complete (${components} components)\x1b[0m`,
      target,
      featureHash,
      undefined,
      components,
      sourceSampleHash,
      sourceFeatureHash,
      bases,
      activations,
      {
        playComponent: (index = 0) => this.playComponentAudio(index, bound),
        help: () => this.nxFeatureHelpText(bound),
      },
    );
    return bound;
  }

  private async display(filePath: string): Promise<SampleResult> {
    this.ensureSupportedInput(filePath);

    const audioFileData = await window.electron.readAudioFile(filePath);
    const audio = {
      audioData: audioFileData.channelData,
      sampleRate: audioFileData.sampleRate,
      duration: audioFileData.duration,
      filePath: audioFileData.filePath ?? filePath,
      hash: audioFileData.hash,
      visualize: () => "Visualization updated",
      analyzeOnsetSlice: async (options?: OnsetSliceOptions) => {
        const slices = await window.electron.analyzeOnsetSlice(audioFileData.channelData, options);
        return { slices, visualize: () => "Slice markers updated" };
      },
    };

    this.audioManager.setCurrentAudio(audio);

    const existing = await window.electron.getSampleByHash(audioFileData.hash);
    return this.bindSample(
      {
        id: existing?.id,
        hash: audioFileData.hash,
        filePath: audioFileData.filePath ?? filePath,
        sampleRate: audioFileData.sampleRate,
        channels: existing?.channels ?? 1,
        duration: audioFileData.duration,
      },
      [
        `\x1b[32mLoaded: ${this.sampleLabel(audioFileData.filePath ?? filePath, audioFileData.hash)}\x1b[0m`,
        `\x1b[32mHash: ${audioFileData.hash.substring(0, 8)}\x1b[0m`,
      ].join("\n"),
    );
  }

  private async loadByHash(hash: string): Promise<SampleResult> {
    const audioFileData = await window.electron.readAudioFile(hash);
    const audio = {
      audioData: audioFileData.channelData,
      sampleRate: audioFileData.sampleRate,
      duration: audioFileData.duration,
      filePath: audioFileData.filePath ?? undefined,
      hash: audioFileData.hash,
      visualize: () => "Visualization updated",
      analyzeOnsetSlice: async (options?: OnsetSliceOptions) => {
        const slices = await window.electron.analyzeOnsetSlice(audioFileData.channelData, options);
        return { slices, visualize: () => "Slice markers updated" };
      },
    };

    this.audioManager.setCurrentAudio(audio);

    const existing = await window.electron.getSampleByHash(audioFileData.hash);
    return this.bindSample(
      {
        id: existing?.id,
        hash: audioFileData.hash,
        filePath: audioFileData.filePath ?? undefined,
        sampleRate: audioFileData.sampleRate,
        channels: existing?.channels ?? 1,
        duration: audioFileData.duration,
      },
      [
        `\x1b[32mLoaded: ${this.sampleLabel(audioFileData.filePath ?? undefined, audioFileData.hash)}\x1b[0m`,
        `\x1b[32mHash: ${audioFileData.hash.substring(0, 8)}\x1b[0m`,
      ].join("\n"),
    );
  }

  private async resolveSample(
    source: SampleResult | PromiseLike<SampleResult>,
  ): Promise<SampleResult> {
    return this.isPromiseLike<SampleResult>(source) ? await source : source;
  }

  private stopAudio(source?: SampleResult): BounceResult {
    if (source) {
      this.audioManager.stopAudio(source.hash);
      return new BounceResult(
        `\x1b[32mPlayback stopped: ${this.sampleLabel(source.filePath, source.hash)}\x1b[0m`,
      );
    }
    this.audioManager.stopAudio();
    return new BounceResult("\x1b[32mPlayback stopped\x1b[0m");
  }

  private async startPlayback(
    source: string | SampleResult | PromiseLike<SampleResult> | undefined,
    loopPlayback: boolean,
    loopOpts?: { loopStart?: number; loopEnd?: number },
  ): Promise<SampleResult> {
    let loadedSample: SampleResult | undefined;

    if (typeof source === "string") {
      const isHash =
        /^[0-9a-f]{8,}$/i.test(source) &&
        !source.includes("/") &&
        !source.includes("\\");
      loadedSample = isHash ? await this.loadByHash(source) : await this.display(source);
    } else if (source !== undefined) {
      const resolved = await this.resolveSample(source);
      if (this.audioManager.getCurrentAudio()?.hash !== resolved.hash) {
        loadedSample = await this.loadByHash(resolved.hash);
      } else {
        loadedSample = resolved;
      }
    }

    const audio = this.audioManager.getCurrentAudio();
    if (!audio) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    const activeSample =
      loadedSample ??
      this.bindSample({
        hash: audio.hash!,
        filePath: audio.filePath ?? undefined,
        sampleRate: audio.sampleRate,
        channels: 1,
        duration: audio.duration,
      });

    await this.audioManager.playAudio(
      audio.audioData,
      audio.sampleRate,
      loopPlayback,
      activeSample.hash,
      loopOpts?.loopStart,
      loopOpts?.loopEnd,
    );

    const loopRangeLabel =
      loopPlayback && (loopOpts?.loopStart !== undefined || loopOpts?.loopEnd !== undefined)
        ? ` [${loopOpts?.loopStart ?? 0}s – ${loopOpts?.loopEnd !== undefined ? `${loopOpts.loopEnd}s` : "end"}]`
        : "";

    return this.bindSample(
      {
        hash: activeSample.hash,
        filePath: activeSample.filePath,
        sampleRate: activeSample.sampleRate,
        channels: activeSample.channels,
        duration: activeSample.duration,
        id: activeSample.id,
      },
      [
        loadedSample ? loadedSample.toString() : this.makeSampleDisplayText(activeSample),
        `\x1b[32m${loopPlayback ? "Looping" : "Playing"}${loopRangeLabel}: ${this.sampleLabel(activeSample.filePath, activeSample.hash)}\x1b[0m`,
      ].join("\n"),
    );
  }

  private async playAudio(
    source?: string | SampleResult | PromiseLike<SampleResult>,
  ): Promise<SampleResult> {
    return this.startPlayback(source, false);
  }

  private async loopAudio(
    source?: string | SampleResult | PromiseLike<SampleResult>,
    opts?: { loopStart?: number; loopEnd?: number },
  ): Promise<SampleResult> {
    return this.startPlayback(source, true, opts);
  }

  private async analyze(
    source?: SampleResult | PromiseLike<SampleResult> | AnalyzeOptions,
    options?: AnalyzeOptions,
  ): Promise<SliceFeatureResult> {
    const resolvedSource = this.isPromiseLike<SampleResult>(source) ? await source : source;
    const sample =
      resolvedSource instanceof SampleResult
        ? resolvedSource
        : await this.loadByHash(this.getCurrentHash());
    const opts =
      resolvedSource instanceof SampleResult
        ? options
        : (resolvedSource as AnalyzeOptions | undefined);

    if (this.audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await this.loadByHash(sample.hash);
    }
    const audio = this.audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    this.terminal.writeln("\x1b[36mAnalyzing onset slices...\x1b[0m");

    const slices = await window.electron.analyzeOnsetSlice(audio.audioData, opts);
    await window.electron.storeFeature(
      audio.hash,
      "onset-slice",
      slices,
      opts as FeatureOptions | undefined,
    );
    const feature = await window.electron.getMostRecentFeature(audio.hash, "onset-slice");
    if (!feature) {
      throw new Error("Failed to load stored onset feature.");
    }

    return this.bindSliceFeature(
      sample,
      feature.feature_hash,
      slices,
      opts as Record<string, unknown> | undefined,
    );
  }

  private async analyzeAmpSlice(
    sample: SampleResult,
    options?: AmpSliceOptions,
  ): Promise<SliceFeatureResult> {
    if (this.audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await this.loadByHash(sample.hash);
    }
    const audio = this.audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    this.terminal.writeln("\x1b[36mAnalyzing amplitude slices...\x1b[0m");

    const slices = await window.electron.analyzeAmpSlice(audio.audioData, options);
    await window.electron.storeFeature(
      audio.hash,
      "amp-slice",
      slices,
      options as FeatureOptions | undefined,
    );
    const feature = await window.electron.getMostRecentFeature(audio.hash, "amp-slice");
    if (!feature) {
      throw new Error("Failed to load stored amp-slice feature.");
    }

    return this.bindSliceFeature(
      sample,
      feature.feature_hash,
      slices,
      options as Record<string, unknown> | undefined,
      `\x1b[32mFound ${slices.length} amplitude slices (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  private async analyzeNoveltySlice(
    sample: SampleResult,
    options?: NoveltySliceOptions,
  ): Promise<SliceFeatureResult> {
    if (this.audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await this.loadByHash(sample.hash);
    }
    const audio = this.audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    this.terminal.writeln("\x1b[36mAnalyzing novelty slices...\x1b[0m");

    const slices = await window.electron.analyzeNoveltySlice(audio.audioData, options);
    await window.electron.storeFeature(
      audio.hash,
      "novelty-slice",
      slices,
      options as FeatureOptions | undefined,
    );
    const feature = await window.electron.getMostRecentFeature(audio.hash, "novelty-slice");
    if (!feature) {
      throw new Error("Failed to load stored novelty-slice feature.");
    }

    return this.bindSliceFeature(
      sample,
      feature.feature_hash,
      slices,
      options as Record<string, unknown> | undefined,
      `\x1b[32mFound ${slices.length} novelty slices (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  private async analyzeTransientSlice(
    sample: SampleResult,
    options?: TransientSliceOptions,
  ): Promise<SliceFeatureResult> {
    if (this.audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await this.loadByHash(sample.hash);
    }
    const audio = this.audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    this.terminal.writeln("\x1b[36mAnalyzing transient slices...\x1b[0m");

    const slices = await window.electron.analyzeTransientSlice(audio.audioData, options);
    await window.electron.storeFeature(
      audio.hash,
      "transient-slice",
      slices,
      options as FeatureOptions | undefined,
    );
    const feature = await window.electron.getMostRecentFeature(audio.hash, "transient-slice");
    if (!feature) {
      throw new Error("Failed to load stored transient-slice feature.");
    }

    return this.bindSliceFeature(
      sample,
      feature.feature_hash,
      slices,
      options as Record<string, unknown> | undefined,
      `\x1b[32mFound ${slices.length} transient slices (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  private async analyzeNmf(
    source?: SampleResult | PromiseLike<SampleResult> | NmfOptions,
    options?: NmfOptions,
  ): Promise<NmfFeatureResult> {
    const resolvedSource = this.isPromiseLike<SampleResult>(source) ? await source : source;
    const sample =
      resolvedSource instanceof SampleResult
        ? resolvedSource
        : await this.loadByHash(this.getCurrentHash());
    const opts =
      resolvedSource instanceof SampleResult
        ? options
        : (resolvedSource as NmfOptions | undefined);

    if (this.audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await this.loadByHash(sample.hash);
    }
    const audio = this.audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    this.terminal.writeln("\x1b[36mPerforming NMF decomposition...\x1b[0m");
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

    return this.bindNmfFeature(
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

  private async analyzeMFCC(
    sampleOrPromise: SampleResult | PromiseLike<SampleResult>,
    options?: MFCCOptions,
  ): Promise<MfccFeatureResult> {
    const sample = await this.resolveSample(sampleOrPromise);
    let audioData: Float32Array;
    let sampleRate: number;

    const current = this.audioManager.getCurrentAudio();
    if (current?.hash === sample.hash) {
      audioData = current.audioData;
      sampleRate = current.sampleRate;
    } else {
      const loaded = await window.electron.readAudioFile(sample.hash);
      audioData = loaded.channelData;
      sampleRate = loaded.sampleRate;
    }

    this.terminal.writeln("\x1b[36mComputing MFCCs...\x1b[0m");

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

    return this.bindMfccFeature(
      sample,
      feature.feature_hash,
      options,
      numFrames,
      numCoeffs,
      `\x1b[32mMFCC complete: ${numFrames} frames × ${numCoeffs} coefficients (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  private async analyzeNx(
    target: SampleResult,
    other: SampleResult | PromiseLike<SampleResult>,
    options?: { components?: number },
  ): Promise<NxFeatureResult> {
    const resolvedOther = await Promise.resolve(other);
    const existingNmf = await window.electron.getMostRecentFeature(resolvedOther.hash, "nmf");
    if (!existingNmf) {
      this.terminal.writeln("\x1b[36mAuto-computing NMF on source sample...\x1b[0m");
      const nmfResult = await window.electron.analyzeNMF([resolvedOther.hash]);
      if (!nmfResult.success) {
        throw new Error(`Failed to auto-compute NMF on source: ${nmfResult.message}`);
      }
    }
    this.terminal.writeln("\x1b[36mRunning NMF cross-synthesis...\x1b[0m");
    const args = [target.hash, resolvedOther.hash];
    if (options?.components !== undefined) {
      args.push("--components", String(options.components));
    }
    const result = await window.electron.nx(args);
    if (!result.success) throw new Error(result.message);
    const feature = await window.electron.getMostRecentFeature(target.hash, "nmf-cross");
    if (!feature) throw new Error("NX feature could not be loaded after cross-synthesis.");
    const data = JSON.parse(feature.feature_data) as {
      bases: number[][];
      activations: number[][];
      sourceSampleHash: string;
      sourceFeatureHash: string;
    };
    return this.bindNxFeature(
      target,
      feature.feature_hash,
      data.bases.length,
      data.sourceSampleHash,
      data.sourceFeatureHash,
      data.bases,
      data.activations,
    );
  }

  private async sliceSamples(
    source?: SliceFeatureResult | SampleResult | PromiseLike<SampleResult> | SliceOptions,
    options?: SliceOptions,
  ): Promise<BounceResult> {
    const resolvedSource = this.isPromiseLike<SampleResult>(source) ? await source : source;
    const explicitOptions =
      resolvedSource instanceof SliceFeatureResult || resolvedSource instanceof SampleResult
        ? options
        : (resolvedSource as SliceOptions | undefined);
    let feature: FeatureData | null;
    let sampleHash: string;
    if (resolvedSource instanceof SliceFeatureResult) {
      sampleHash = resolvedSource.sourceHash;
      feature = await window.electron.getMostRecentFeature(resolvedSource.sourceHash, "onset-slice");
    } else if (resolvedSource instanceof SampleResult) {
      sampleHash = resolvedSource.hash;
      feature = await window.electron.getMostRecentFeature(resolvedSource.hash, "onset-slice");
    } else {
      sampleHash = this.getCurrentHash();
      feature = await window.electron.getMostRecentFeature(sampleHash, "onset-slice");
    }

    if (
      feature &&
      explicitOptions?.featureHash &&
      !feature.feature_hash.startsWith(explicitOptions.featureHash)
    ) {
      feature = { ...feature, feature_hash: explicitOptions.featureHash };
    }

    if (!feature) {
      throw new Error("No onset analysis found. Run sample.onsets() first.");
    }

    this.terminal.writeln(
      `\x1b[36mCreating slices from feature ${feature.feature_hash.substring(0, 8)}...\x1b[0m`,
    );
    const slices = await window.electron.createSliceSamples(sampleHash, feature.feature_hash);
    return new BounceResult(`\x1b[32mCreated ${slices.length} slices\x1b[0m`);
  }

  private async sepAudio(
    source?: SampleResult | PromiseLike<SampleResult> | NmfFeatureResult | SepOptions,
    options?: SepOptions,
  ): Promise<BounceResult> {
    let hash: string;
    let opts: SepOptions | undefined;

    const resolvedSource = this.isPromiseLike<SampleResult>(source) ? await source : source;
    if (resolvedSource instanceof SampleResult) {
      hash = resolvedSource.hash;
      opts = options;
    } else if (resolvedSource instanceof NmfFeatureResult) {
      hash = resolvedSource.sourceHash;
      opts = options;
    } else {
      hash = this.getCurrentHash();
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
  }

  private async listSamples(): Promise<SampleListResult> {
    const samples = await window.electron.listSamples();
    const features = await window.electron.listFeatures();
    const lines: string[] = [];
    const sampleObjects = samples.map((sample) =>
      this.bindSample({
        id: sample.id,
        hash: sample.hash,
        filePath: sample.display_name ?? undefined,
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
      filePath: feature.display_name ?? undefined,
      options: feature.options,
    }));

    if (samples.length === 0) {
      lines.push("\x1b[33mNo samples in database\x1b[0m");
    } else {
      lines.push("\x1b[1;36mStored Samples:\x1b[0m", "");
      for (const sample of samples) {
        const shortHash = sample.hash.substring(0, 8);
        const basename =
          (sample.display_name ?? sample.hash).split("/").pop() ?? shortHash;
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
      () =>
        new BounceResult(
          [
            "\x1b[1;36msn.list()\x1b[0m",
            "",
            "  List stored samples and features. Returns a SampleListResult and prints",
            "  a formatted summary to the terminal.",
          ].join("\n"),
        ),
    );
  }

  private async playSliceAudio(
    index = 0,
    source?: SliceFeatureResult | SampleResult | PromiseLike<SampleResult>,
  ): Promise<SampleResult> {
    const currentHash = this.getCurrentHash();

    const resolvedSource = this.isPromiseLike<SampleResult>(source) ? await source : source;
    const lookupHash =
      resolvedSource instanceof SampleResult
        ? resolvedSource.hash
        : resolvedSource instanceof SliceFeatureResult
          ? resolvedSource.sourceHash
          : currentHash;

    const feature = await window.electron.getMostRecentFeature(lookupHash, "onset-slice");

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

    this.audioManager.setCurrentAudio({
      audioData,
      sampleRate: derivedSample.sample_rate,
      duration,
      filePath: `Slice ${index} from ${lookupHash.substring(0, 8)}`,
      hash: derivedSample.hash,
      visualize: () => "Not available for slices",
      analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Not available" }),
    });
    this.audioManager.clearSlices();

    await this.audioManager.playAudio(
      audioData,
      derivedSample.sample_rate,
      false,
      derivedSample.hash,
    );

    return this.bindSample(
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
  }

  private async playComponentAudio(
    index = 0,
    source?: NmfFeatureResult | NxFeatureResult | SampleResult | PromiseLike<SampleResult>,
  ): Promise<SampleResult> {
    const currentHash = this.getCurrentHash();

    const resolvedSource = this.isPromiseLike<SampleResult>(source) ? await source : source;
    const lookupHash =
      resolvedSource instanceof SampleResult
        ? resolvedSource.hash
        : resolvedSource instanceof NmfFeatureResult || resolvedSource instanceof NxFeatureResult
          ? resolvedSource.sourceHash
          : currentHash;

    const featureType = resolvedSource instanceof NxFeatureResult ? "nmf-cross" : "nmf";
    const feature = await window.electron.getMostRecentFeature(lookupHash, featureType);
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

    this.audioManager.setCurrentAudio({
      audioData: componentAudio,
      sampleRate: derivedSample.sample_rate,
      duration,
      filePath: `Component ${index} from ${lookupHash.substring(0, 8)}`,
      hash: derivedSample.hash,
      visualize: () => "Not available for components",
      analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Not available" }),
    });
    this.audioManager.clearSlices();

    await this.audioManager.playAudio(
      componentAudio,
      derivedSample.sample_rate,
      false,
      derivedSample.hash,
    );

    return this.bindSample(
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
  }

  private async granularizeSample(
    source?: string | SampleResult | PromiseLike<SampleResult> | GranularizeOptions,
    options?: GranularizeOptions,
  ): Promise<GrainCollection> {
    const resolvedSource = this.isPromiseLike<SampleResult>(source) ? await source : source;
    const isOptionsArg =
      resolvedSource !== null &&
      resolvedSource !== undefined &&
      typeof resolvedSource === "object" &&
      !(resolvedSource instanceof SampleResult);
    const opts = isOptionsArg ? (resolvedSource as GranularizeOptions) : options;

    let hash: string;
    if (typeof resolvedSource === "string") {
      const loaded = await this.loadByHash(resolvedSource);
      hash = loaded.hash;
    } else if (resolvedSource instanceof SampleResult) {
      hash = resolvedSource.hash;
    } else {
      hash = this.getCurrentHash();
    }

    this.terminal.writeln("\x1b[36mGranularizing...\x1b[0m");

    const result = await window.electron.granularizeSample(hash, opts);

    const grains: Array<SampleResult | null> = result.grainHashes.map(
      (grainHash: string | null) => {
        if (grainHash === null) return null;
        return this.bindSample(
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
  }

  private async getAudioInputs(): Promise<AudioInputDevice[]> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label, groupId: d.groupId }));
  }

  private recordSample(
    deviceId: string,
    deviceLabel: string,
    sampleId: string,
    opts?: RecordOptions,
  ): Promise<RecordingHandleResult> | SamplePromise {
    const pipeline = async (): Promise<{
      recorder: MediaRecorder;
      storagePromise: Promise<SampleResult>;
    }> => {
      const existing = await window.electron.getSampleByName(sampleId);
      if (existing && !opts?.overwrite) {
        throw new Error(
          `SampleResult '${sampleId}' already exists. Use { overwrite: true } to replace it.`,
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
        } as MediaTrackConstraints,
      });

      const chunks: Blob[] = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const storagePromise = new Promise<SampleResult>((resolve, reject) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType });
          blob
            .arrayBuffer()
            .then((ab) => {
              const audioCtx = new AudioContext();
              return audioCtx.decodeAudioData(ab).then((decoded) => {
                audioCtx.close();
                return decoded;
              });
            })
            .then(async (decoded) => {
              const channelData = decoded.getChannelData(0);
              const sr = decoded.sampleRate;
              const ch = decoded.numberOfChannels;
              const dur = channelData.length / sr;

              const result = await window.electron.storeRecording(
                sampleId,
                Array.from(channelData),
                sr,
                ch,
                dur,
                opts?.overwrite ?? false,
              );

              if (result.status === "exists") {
                throw new Error(`SampleResult '${sampleId}' already exists.`);
              }

              resolve(
                this.bindSample({
                  hash: result.hash!,
                  filePath: sampleId,
                  sampleRate: sr,
                  channels: ch,
                  duration: dur,
                  id: result.id,
                }),
              );
            })
            .catch(reject);
        };
      });

      recorder.start();
      return { recorder, storagePromise };
    };

    if (opts?.duration !== undefined) {
      const duration = opts.duration;
      return new SamplePromise(
        pipeline().then(({ recorder, storagePromise }) => {
          setTimeout(() => recorder.stop(), duration * 1000);
          return storagePromise;
        }),
      );
    }

    return pipeline().then(
      ({ recorder, storagePromise }) =>
        new RecordingHandleResult(deviceLabel, () => recorder.stop(), storagePromise),
    );
  }
}

/** @deprecated Use `new SampleNamespace(deps)` directly. Kept for backward compatibility. */
export function buildSampleNamespace(deps: NamespaceDeps): {
  sn: SampleNamespace;
  sampleBinder: SampleBinder;
} {
  const sn = new SampleNamespace(deps);
  return { sn, sampleBinder: sn };
}
