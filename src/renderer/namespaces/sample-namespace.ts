/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  Sample,
  SliceFeature,
  NmfFeature,
  NxFeature,
  MfccFeature,
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
  AudioDevice,
  RecordingHandle,
  type AudioInputDevice,
  type RecordOptions,
  InstrumentResult,
} from "../bounce-result.js";
import { GrainCollection } from "../grain-collection.js";
import { renderNamespaceHelp, withHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";
import { snCommands, snDescription } from "./sn-commands.generated.js";
export { snCommands } from "./sn-commands.generated.js";

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
  ): Sample;
}

/**
 * Load and play audio samples; entry point for all audio analysis
 * @namespace sn
 */
export function buildSampleNamespace(deps: NamespaceDeps) {
  const { terminal, audioManager } = deps;

  const supportedExtensions = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".opus"];

  function sampleLabel(filePath: string | undefined, hash: string): string {
    return filePath?.split("/").pop() ?? hash.substring(0, 8);
  }

  function ensureSupportedInput(filePath: string): void {
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

  function loopHelpText(): BounceResult {
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

  function onsetHelpText(feature: SliceFeature): BounceResult {
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

  function nxFeatureHelpText(feature: NxFeature): BounceResult {
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
        loop: Object.assign(
          (opts?: { loopStart?: number; loopEnd?: number }) => loop(bound, opts),
          { help: loopHelpText },
        ),
        stop: () => stop(bound),
        display: () => loadByHash(bound.hash),
        slice: (options) => slice(bound, options),
        sep: (options) => sep(bound, options),
        granularize: (options) => granularize(bound, options),
        onsetSlice: (options) => analyze(bound, options),
        ampSlice: (options) => analyzeAmpSlice(bound, options),
        noveltySlice: (options) => analyzeNoveltySlice(bound, options),
        transientSlice: (options) => analyzeTransientSlice(bound, options),
        nmf: (options) => analyzeNmf(bound, options),
        mfcc: (options) => analyzeMFCC(bound, options),
        nx: (other, options) => analyzeNx(bound, other, options),
      },
    );
    return bound;
  }

  function bindSliceFeature(
    source: Sample,
    featureHash: string,
    slices: number[],
    options?: Record<string, unknown>,
    displayText = `\x1b[32mFound ${slices.length} onset slices (feature: ${featureHash.substring(0, 8)})\x1b[0m`,
  ): SliceFeature {
    const bound: SliceFeature = new SliceFeature(
      displayText,
      source,
      featureHash,
      options,
      slices,
      {
        help: (): BounceResult => onsetHelpText(bound),
        slice: (sliceOptions) => slice(bound, sliceOptions),
        playSlice: (index = 0) => playSlice(index, bound),
        toSampler: (opts) => toSamplerBinding(source, featureHash, opts),
      },
    );
    return bound;
  }

  async function toSamplerBinding(
    sample: Sample,
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

  function bindNxFeature(
    target: Sample,
    featureHash: string,
    components: number,
    sourceSampleHash: string,
    sourceFeatureHash: string,
    bases: number[][] | undefined,
    activations: number[][] | undefined,
  ): NxFeature {
    const bound: NxFeature = new NxFeature(
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
        playComponent: (index = 0) => playComponent(index, bound),
        help: () => nxFeatureHelpText(bound),
      },
    );
    return bound;
  }

  async function display(filePath: string): Promise<Sample> {
    ensureSupportedInput(filePath);

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

    audioManager.setCurrentAudio(audio);

    const existing = await window.electron.getSampleByHash(audioFileData.hash);
    return bindSample(
      {
        id: existing?.id,
        hash: audioFileData.hash,
        filePath: audioFileData.filePath ?? filePath,
        sampleRate: audioFileData.sampleRate,
        channels: existing?.channels ?? 1,
        duration: audioFileData.duration,
      },
      [
        `\x1b[32mLoaded: ${sampleLabel(audioFileData.filePath ?? filePath, audioFileData.hash)}\x1b[0m`,
        `\x1b[32mHash: ${audioFileData.hash.substring(0, 8)}\x1b[0m`,
      ].join("\n"),
    );
  }

  async function loadByHash(hash: string): Promise<Sample> {
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

    audioManager.setCurrentAudio(audio);

    const existing = await window.electron.getSampleByHash(audioFileData.hash);
    return bindSample(
      {
        id: existing?.id,
        hash: audioFileData.hash,
        filePath: audioFileData.filePath ?? undefined,
        sampleRate: audioFileData.sampleRate,
        channels: existing?.channels ?? 1,
        duration: audioFileData.duration,
      },
      [
        `\x1b[32mLoaded: ${sampleLabel(audioFileData.filePath ?? undefined, audioFileData.hash)}\x1b[0m`,
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
    loopOpts?: { loopStart?: number; loopEnd?: number },
  ): Promise<Sample> {
    let loadedSample: Sample | undefined;

    if (typeof source === "string") {
      const isHash =
        /^[0-9a-f]{8,}$/i.test(source) &&
        !source.includes("/") &&
        !source.includes("\\");
      loadedSample = isHash ? await loadByHash(source) : await display(source);
    } else if (source !== undefined) {
      const resolved = await resolveSample(source);
      if (audioManager.getCurrentAudio()?.hash !== resolved.hash) {
        loadedSample = await loadByHash(resolved.hash);
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
      loopOpts?.loopStart,
      loopOpts?.loopEnd,
    );

    const loopRangeLabel =
      loopPlayback && (loopOpts?.loopStart !== undefined || loopOpts?.loopEnd !== undefined)
        ? ` [${loopOpts?.loopStart ?? 0}s – ${loopOpts?.loopEnd !== undefined ? `${loopOpts.loopEnd}s` : "end"}]`
        : "";

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
        `\x1b[32m${loopPlayback ? "Looping" : "Playing"}${loopRangeLabel}: ${sampleLabel(activeSample.filePath, activeSample.hash)}\x1b[0m`,
      ].join("\n"),
    );
  }

  async function play(source?: string | Sample | PromiseLike<Sample>): Promise<Sample> {
    return startPlayback(source, false);
  }

  async function loop(
    source?: string | Sample | PromiseLike<Sample>,
    opts?: { loopStart?: number; loopEnd?: number },
  ): Promise<Sample> {
    return startPlayback(source, true, opts);
  }

  async function analyze(
    source?: Sample | PromiseLike<Sample> | AnalyzeOptions,
    options?: AnalyzeOptions,
  ): Promise<SliceFeature> {
    const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
    const sample = resolvedSource instanceof Sample ? resolvedSource : await loadByHash(getCurrentHash());
    const opts = resolvedSource instanceof Sample ? options : (resolvedSource as AnalyzeOptions | undefined);

    if (audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await loadByHash(sample.hash);
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

    return bindSliceFeature(sample, feature.feature_hash, slices, opts as Record<string, unknown> | undefined);
  }

  async function analyzeAmpSlice(
    sample: Sample,
    options?: AmpSliceOptions,
  ): Promise<SliceFeature> {
    if (audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await loadByHash(sample.hash);
    }
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    terminal.writeln("\x1b[36mAnalyzing amplitude slices...\x1b[0m");

    const slices = await window.electron.analyzeAmpSlice(audio.audioData, options);
    await window.electron.storeFeature(audio.hash, "amp-slice", slices, options as FeatureOptions | undefined);
    const feature = await window.electron.getMostRecentFeature(audio.hash, "amp-slice");
    if (!feature) {
      throw new Error("Failed to load stored amp-slice feature.");
    }

    return bindSliceFeature(
      sample,
      feature.feature_hash,
      slices,
      options as Record<string, unknown> | undefined,
      `\x1b[32mFound ${slices.length} amplitude slices (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  async function analyzeNoveltySlice(
    sample: Sample,
    options?: NoveltySliceOptions,
  ): Promise<SliceFeature> {
    if (audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await loadByHash(sample.hash);
    }
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    terminal.writeln("\x1b[36mAnalyzing novelty slices...\x1b[0m");

    const slices = await window.electron.analyzeNoveltySlice(audio.audioData, options);
    await window.electron.storeFeature(audio.hash, "novelty-slice", slices, options as FeatureOptions | undefined);
    const feature = await window.electron.getMostRecentFeature(audio.hash, "novelty-slice");
    if (!feature) {
      throw new Error("Failed to load stored novelty-slice feature.");
    }

    return bindSliceFeature(
      sample,
      feature.feature_hash,
      slices,
      options as Record<string, unknown> | undefined,
      `\x1b[32mFound ${slices.length} novelty slices (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  async function analyzeTransientSlice(
    sample: Sample,
    options?: TransientSliceOptions,
  ): Promise<SliceFeature> {
    if (audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await loadByHash(sample.hash);
    }
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
    }

    terminal.writeln("\x1b[36mAnalyzing transient slices...\x1b[0m");

    const slices = await window.electron.analyzeTransientSlice(audio.audioData, options);
    await window.electron.storeFeature(audio.hash, "transient-slice", slices, options as FeatureOptions | undefined);
    const feature = await window.electron.getMostRecentFeature(audio.hash, "transient-slice");
    if (!feature) {
      throw new Error("Failed to load stored transient-slice feature.");
    }

    return bindSliceFeature(
      sample,
      feature.feature_hash,
      slices,
      options as Record<string, unknown> | undefined,
      `\x1b[32mFound ${slices.length} transient slices (feature: ${feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  async function analyzeNmf(
    source?: Sample | PromiseLike<Sample> | NmfOptions,
    options?: NmfOptions,
  ): Promise<NmfFeature> {
    const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
    const sample = resolvedSource instanceof Sample ? resolvedSource : await loadByHash(getCurrentHash());
    const opts = resolvedSource instanceof Sample ? options : (resolvedSource as NmfOptions | undefined);

    if (audioManager.getCurrentAudio()?.hash !== sample.hash) {
      await loadByHash(sample.hash);
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

  async function analyzeNx(
    target: Sample,
    other: Sample | PromiseLike<Sample>,
    options?: { components?: number },
  ): Promise<NxFeature> {
    const resolvedOther = await Promise.resolve(other);
    const existingNmf = await window.electron.getMostRecentFeature(resolvedOther.hash, "nmf");
    if (!existingNmf) {
      terminal.writeln("\x1b[36mAuto-computing NMF on source sample...\x1b[0m");
      const nmfResult = await window.electron.analyzeNMF([resolvedOther.hash]);
      if (!nmfResult.success) {
        throw new Error(`Failed to auto-compute NMF on source: ${nmfResult.message}`);
      }
    }
    terminal.writeln("\x1b[36mRunning NMF cross-synthesis...\x1b[0m");
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
    return bindNxFeature(
      target,
      feature.feature_hash,
      data.bases.length,
      data.sourceSampleHash,
      data.sourceFeatureHash,
      data.bases,
      data.activations,
    );
  }

  const slice = Object.assign(
    async function slice(
      source?: SliceFeature | Sample | PromiseLike<Sample> | SliceOptions,
      options?: SliceOptions,
    ): Promise<BounceResult> {
      const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
      const explicitOptions =
        resolvedSource instanceof SliceFeature || resolvedSource instanceof Sample
          ? options
          : (resolvedSource as SliceOptions | undefined);
      let feature: FeatureData | null;
      let sampleHash: string;
      if (resolvedSource instanceof SliceFeature) {
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

  const list = Object.assign(
    async function list(): Promise<SampleListResult> {
      const samples = await window.electron.listSamples();
      const features = await window.electron.listFeatures();
      const lines: string[] = [];
      const sampleObjects = samples.map((sample) =>
        bindSample({
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
    async function playSlice(index = 0, source?: SliceFeature | Sample | PromiseLike<Sample>): Promise<Sample> {
      const currentHash = getCurrentHash();

      const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
      const lookupHash = resolvedSource instanceof Sample
        ? resolvedSource.hash
        : resolvedSource instanceof SliceFeature
          ? resolvedSource.sourceHash
          : currentHash;

      const feature = resolvedSource instanceof SliceFeature
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
        "\x1b[1;36mSliceFeature.playSlice(index?)\x1b[0m",
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
    async function playComponent(index = 0, source?: NmfFeature | NxFeature | Sample | PromiseLike<Sample>): Promise<Sample> {
      const currentHash = getCurrentHash();

      const resolvedSource = isPromiseLike<Sample>(source) ? await source : source;
      const lookupHash = resolvedSource instanceof Sample
        ? resolvedSource.hash
        : (resolvedSource instanceof NmfFeature || resolvedSource instanceof NxFeature)
          ? resolvedSource.sourceHash
          : currentHash;

      const featureType = resolvedSource instanceof NxFeature ? "nmf-cross" : "nmf";
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
        const loaded = await loadByHash(resolvedSource);
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

  async function getAudioInputs(): Promise<AudioInputDevice[]> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label, groupId: d.groupId }));
  }

  function recordSample(
    deviceId: string,
    deviceLabel: string,
    sampleId: string,
    opts?: RecordOptions,
  ): Promise<RecordingHandle> | SamplePromise {
    const pipeline = async (): Promise<{ recorder: MediaRecorder; storagePromise: Promise<Sample> }> => {
      const existing = await window.electron.getSampleByName(sampleId);
      if (existing && !opts?.overwrite) {
        throw new Error(
          `Sample '${sampleId}' already exists. Use { overwrite: true } to replace it.`,
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints,
      });

      const chunks: Blob[] = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const storagePromise = new Promise<Sample>((resolve, reject) => {
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
                throw new Error(`Sample '${sampleId}' already exists.`);
              }

              resolve(
                bindSample({
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
        new RecordingHandle(deviceLabel, () => recorder.stop(), storagePromise),
    );
  }

  const sn = {
    description: snDescription,
    toString(): string {
      return renderNamespaceHelp("sn", snDescription, sampleNamespaceCommands).toString();
    },

    help(): BounceResult {
      return renderNamespaceHelp("sn", snDescription, sampleNamespaceCommands);
    },

    read: withHelp(
      /**
       * Load an audio file from disk and return a Sample object
       *
       * Load an audio file from disk and return a Sample object.
       * The sample is stored in the project database for future access via sn.load().
       *
       * @param path File path (absolute, relative, or ~). Supports WAV, MP3, OGG, FLAC, M4A, AAC, OPUS.
       * @example const samp = sn.read("kick.wav")
       * @example const samp = sn.read("samples/loop.flac")
       */
      function read(path: string): SamplePromise {
        return new SamplePromise(display(path));
      },
      sampleNamespaceCommands[0],
    ),

    load: withHelp(
      /**
       * Load a stored sample by hash and return a Sample object
       *
       * Load a stored sample by its hash (or hash prefix) and return a Sample object.
       * Use sn.list() to see available sample hashes.
       *
       * @param hash Full or prefix hash from sn.list().
       * @example const samp = sn.load("a1b2c3d4")
       */
      function load(hash: string): SamplePromise {
        return new SamplePromise(loadByHash(hash));
      },
      sampleNamespaceCommands[1],
    ),

    list: withHelp(
      /**
       * List stored samples and features
       *
       * Show all stored samples and features in the database.
       *
       * @example sn.list()
       */
      (): Promise<SampleListResult> => list(),
      sampleNamespaceCommands[2],
    ),

    current: withHelp(
      /**
       * Return the currently loaded sample, or null
       *
       * Return the currently loaded sample or null if no sample is active.
       *
       * @example const current = sn.current()
       * @example current?.help()
       */
      function current(): CurrentSamplePromise {
        return new CurrentSamplePromise(
          (async () => {
            const hash = audioManager.getCurrentAudio()?.hash;
            if (!hash) return null;
            const cur = await window.electron.getSampleByHash(hash);
            if (!cur) return null;
            return bindSample({
              id: cur.id,
              hash: cur.hash,
              filePath: cur.display_name ?? undefined,
              sampleRate: cur.sample_rate,
              channels: cur.channels,
              duration: cur.duration,
            });
          })(),
        );
      },
      sampleNamespaceCommands[3],
    ),

    stop: withHelp(
      /**
       * Stop all active sample playback and looping voices
       *
       * @example sn.stop()
       */
      (): BounceResult => stop(),
      sampleNamespaceCommands[4],
    ),

    inputs: withHelp(
      /**
       * List available audio input devices
       *
       * List all available audio input devices.
       * Triggers a microphone permission request on first call.
       * Use the index shown to open a device with sn.dev(index).
       *
       * @example sn.inputs()
       * @example sn.dev(0)
       */
      async function inputs(): Promise<InputsResult> {
        return getAudioInputs().then((devs) => new InputsResult(devs));
      },
      sampleNamespaceCommands[5],
    ),

    dev: withHelp(
      /**
       * Open an audio input device by index for recording
       *
       * Open an audio input device by index (from sn.inputs()) and return an AudioDevice.
       * Use AudioDevice.record() to start recording.
       *
       * @param index Device index from sn.inputs().
       * @example const mic = sn.dev(0)
       * @example const h = mic.record("take1")
       * @example h.stop()
       * @example mic.record("take2", { duration: 5 })
       */
      async function dev(index: number): Promise<AudioDevice> {
        const devs = await getAudioInputs();
        if (index < 0 || index >= devs.length) {
          throw new Error(
            `Device index ${index} out of range. Run sn.inputs() to see available devices (0–${devs.length - 1}).`,
          );
        }
        const d = devs[index];
        return new AudioDevice(index, d.deviceId, d.label, 1, {
          record: (sampleId, opts) => recordSample(d.deviceId, d.label, sampleId, opts),
        });
      },
      sampleNamespaceCommands[6],
    ),
  };

  const sampleBinder: SampleBinder = { bindSample };

  return { sn, sampleBinder };
}
