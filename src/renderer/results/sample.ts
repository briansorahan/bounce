import type { GrainCollection } from "../grain-collection.js";
import { attachMethodHelpFromRegistry } from "../help.js";
import { BounceResult, HelpableResult, defaultHelp, type HelpFactory } from "./base.js";
import { replType, describe, param, registerMethod } from "../../shared/repl-registry.js";
import {
  SliceFeaturePromise,
  NmfFeaturePromise,
  MfccFeaturePromise,
  NxFeaturePromise,
  type SliceFeatureResult,
  type NmfFeatureResult,
  type MfccFeatureResult,
  type NxFeatureResult,
} from "./features.js";
import type { InputsResult, AudioDeviceResult } from "./recording.js";

export interface LoopOptions {
  loopStart?: number;
  loopEnd?: number;
}

export interface SampleMethodBindings {
  help: HelpFactory;
  play: () => Promise<SampleResult>;
  loop: (opts?: LoopOptions) => Promise<SampleResult>;
  stop: () => BounceResult;
  display: () => Promise<SampleResult>;
  slice: (options?: SliceOptions) => Promise<BounceResult>;
  sep: (options?: SepOptions) => Promise<BounceResult>;
  granularize: (options?: GranularizeOptions) => Promise<GrainCollection>;
  onsetSlice: (options?: AnalyzeOptions) => Promise<SliceFeatureResult>;
  ampSlice: (options?: AmpSliceOptions) => Promise<SliceFeatureResult>;
  noveltySlice: (options?: NoveltySliceOptions) => Promise<SliceFeatureResult>;
  transientSlice: (options?: TransientSliceOptions) => Promise<SliceFeatureResult>;
  nmf: (options?: NmfOptions) => Promise<NmfFeatureResult>;
  mfcc: (options?: MFCCOptions) => Promise<MfccFeatureResult>;
  nx: (other: SampleResult | PromiseLike<SampleResult>, options?: { components?: number }) => Promise<NxFeatureResult>;
}

function unavailableSampleBindings(name: string): SampleMethodBindings {
  return {
    help: () => defaultHelp(name),
    play: async () => {
      throw new Error(`${name} cannot be played in this context.`);
    },
    loop: async () => { throw new Error(`${name} cannot be looped in this context.`); },
    stop: () => new BounceResult("\x1b[33mPlayback is not available for this object\x1b[0m"),
    display: async () => {
      throw new Error(`${name} cannot be displayed in this context.`);
    },
    slice: async () => {
      throw new Error(`${name} does not support slicing in this context.`);
    },
    sep: async () => {
      throw new Error(`${name} does not support separation in this context.`);
    },
    granularize: async () => {
      throw new Error(`${name} does not support granularization in this context.`);
    },
    onsetSlice: async () => {
      throw new Error(`${name} does not support onset analysis in this context.`);
    },
    ampSlice: async () => {
      throw new Error(`${name} does not support amplitude slice analysis in this context.`);
    },
    noveltySlice: async () => {
      throw new Error(`${name} does not support novelty slice analysis in this context.`);
    },
    transientSlice: async () => {
      throw new Error(`${name} does not support transient slice analysis in this context.`);
    },
    nmf: async () => {
      throw new Error(`${name} does not support NMF analysis in this context.`);
    },
    mfcc: async () => {
      throw new Error(`${name} does not support MFCC analysis in this context.`);
    },
    nx: async () => {
      throw new Error(`${name} does not support NMF cross-synthesis in this context.`);
    },
  };
}

/**
 * Class decorator that registers `loop` method metadata into the registry
 * before @replType reads it. Because class decorators run bottom-up (closest
 * to the class first), placing this below @replType ensures it executes first.
 */
function withLoopMeta(): ClassDecorator {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return (target: Function) => {
    registerMethod(
      target.prototype as object,
      "loop",
      { summary: "Play this sample in a loop.", returns: "SamplePromise" },
      [{ name: "opts?", summary: "Loop start/end in seconds: loopStart?, loopEnd?.", kind: "options" }],
    );
  };
}

/**
 * User-facing sample object in the REPL.
 */
@replType("Sample", { summary: "A loaded audio sample with analysis and playback methods", instanceName: "sample" })
@withLoopMeta()
export class SampleResult extends HelpableResult {
  /**
   * Play this sample in a loop.
   * Declared as an instance field (not a prototype method) so TypeScript can express
   * the `.help()` property that attachMethodHelpFromRegistry attaches at runtime.
   */
  loop!: ((opts?: LoopOptions) => SamplePromise) & { help: () => BounceResult };

  constructor(
    display: string,
    public readonly hash: string,
    public readonly filePath: string | undefined,
    public readonly sampleRate: number,
    public readonly channels: number,
    public readonly duration: number,
    public readonly id: number | undefined,
    private readonly bindings: SampleMethodBindings,
  ) {
    super(display, bindings.help);
    // Assign the bare loop function first; attachMethodHelpFromRegistry will attach .help().
    // @ts-expect-error — .help() is not present yet; it is attached on the next line.
    this.loop = (opts?: LoopOptions): SamplePromise => new SamplePromise(this.bindings.loop(opts));
    attachMethodHelpFromRegistry(this, "Sample");
  }

  @describe({ summary: "Play this sample from start to finish.", returns: "SamplePromise" })
  play(): SamplePromise {
    return new SamplePromise(this.bindings.play());
  }

  @describe({ summary: "Stop playback.", returns: "BounceResult" })
  stop(): BounceResult {
    return this.bindings.stop();
  }

  @describe({ summary: "Display the waveform in the visualization panel.", returns: "SamplePromise" })
  display(): SamplePromise {
    return new SamplePromise(this.bindings.display());
  }

  @describe({ summary: "Onset-slice the sample and store segment boundaries.", returns: "BounceResult" })
  @param("options", { summary: "Slice analysis options.", kind: "options" })
  slice(options?: SliceOptions): Promise<BounceResult> {
    return this.bindings.slice(options);
  }

  @describe({ summary: "Separate the sample into NMF components via BufNMF.", returns: "BounceResult" })
  @param("options", { summary: "NMF separation options.", kind: "options" })
  sep(options?: SepOptions): Promise<BounceResult> {
    return this.bindings.sep(options);
  }

  @describe({ summary: "Create a GrainCollection for granular synthesis.", returns: "GrainCollectionPromise" })
  @param("options", { summary: "Granularize options.", kind: "options" })
  granularize(options?: GranularizeOptions): GrainCollectionPromise {
    return new GrainCollectionPromise(this.bindings.granularize(options));
  }

  @describe({ summary: "Analyse onset positions using FluidOnsetSlice.", returns: "SliceFeaturePromise" })
  @param("opts?", { summary: "Onset analysis options.", kind: "options" })
  onsetSlice(options?: AnalyzeOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.bindings.onsetSlice(options));
  }

  @describe({ summary: "Analyse amplitude-based segment boundaries.", returns: "SliceFeaturePromise" })
  @param("options", { summary: "Amplitude slice options.", kind: "options" })
  ampSlice(options?: AmpSliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.bindings.ampSlice(options));
  }

  @describe({ summary: "Analyse novelty-based segment boundaries.", returns: "SliceFeaturePromise" })
  @param("options", { summary: "Novelty slice options.", kind: "options" })
  noveltySlice(options?: NoveltySliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.bindings.noveltySlice(options));
  }

  @describe({ summary: "Analyse transient-based segment boundaries.", returns: "SliceFeaturePromise" })
  @param("options", { summary: "Transient slice options.", kind: "options" })
  transientSlice(options?: TransientSliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.bindings.transientSlice(options));
  }

  @describe({ summary: "Run BufNMF on the sample and return component matrices.", returns: "NmfFeaturePromise" })
  @param("opts?", { summary: "NMF options.", kind: "options" })
  nmf(options?: NmfOptions): NmfFeaturePromise {
    return new NmfFeaturePromise(this.bindings.nmf(options));
  }

  @describe({ summary: "Compute MFCC coefficients for the sample.", returns: "MfccFeaturePromise" })
  @param("opts?", { summary: "MFCC options.", kind: "options" })
  mfcc(options?: MFCCOptions): MfccFeaturePromise {
    return new MfccFeaturePromise(this.bindings.mfcc(options));
  }

  @describe({ summary: "Run NMF cross-synthesis with another sample as a target.", returns: "NxFeaturePromise" })
  @param("other", { summary: "Target SampleResult for cross-synthesis.", kind: "typed", expectedType: "SampleResult" })
  @param("options", { summary: "Cross-synthesis options: { components? }.", kind: "options" })
  nx(other: SampleResult | PromiseLike<SampleResult>, options?: { components?: number }): NxFeaturePromise {
    return new NxFeaturePromise(this.bindings.nx(other, options));
  }
}

/**
 * Compatibility wrapper retained for internal/tests that still construct
 * simple audio identity objects directly.
 */
export class AudioResult extends SampleResult {
  constructor(
    display: string,
    hash: string,
    filePath: string | undefined,
    sampleRate: number,
    duration: number,
    channels = 1,
    id?: number,
  ) {
    super(
      display,
      hash,
      filePath,
      sampleRate,
      channels,
      duration,
      id,
      unavailableSampleBindings("AudioResult"),
    );
  }
}

export interface SampleSummaryFeature {
  sampleHash: string;
  featureHash: string | undefined;
  featureType: string;
  featureCount: number;
  filePath: string | undefined;
  options: string | null;
}

export class SampleListResult extends HelpableResult {
  constructor(
    display: string,
    public readonly samples: SampleResult[],
    public readonly features: SampleSummaryFeature[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }

  get length(): number {
    return this.samples.length;
  }

  [Symbol.iterator](): Iterator<SampleResult> {
    return this.samples[Symbol.iterator]();
  }
}

export type SampleNamespace = {
  toString(): string;
  help(): BounceResult;
  read: ((path: string) => SamplePromise) & { help: () => BounceResult };
  load: ((hash: string) => SamplePromise) & { help: () => BounceResult };
  list: (() => Promise<SampleListResult>) & { help: () => BounceResult };
  current: (() => CurrentSamplePromise) & { help: () => BounceResult };
  stop: (() => BounceResult) & { help: () => BounceResult };
  inputs: (() => Promise<InputsResult>) & { help: () => BounceResult };
  dev: ((index: number) => Promise<AudioDeviceResult>) & { help: () => BounceResult };
};

export class SamplePromise implements PromiseLike<SampleResult> {
  constructor(protected readonly promise: Promise<SampleResult>) {}

  then<TResult1 = SampleResult, TResult2 = never>(
    onfulfilled?: ((value: SampleResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<SampleResult | TResult> {
    return this.promise.catch(onrejected);
  }

  help(): Promise<BounceResult> {
    return this.promise.then((sample) => sample.help());
  }

  play(): SamplePromise {
    return new SamplePromise(this.promise.then((sample) => sample.play()));
  }

  loop(opts?: LoopOptions): SamplePromise {
    return new SamplePromise(this.promise.then((sample) => sample.loop(opts)));
  }

  stop(): Promise<BounceResult> {
    return this.promise.then((sample) => sample.stop());
  }

  display(): SamplePromise {
    return new SamplePromise(this.promise.then((sample) => sample.display()));
  }

  slice(options?: SliceOptions): Promise<BounceResult> {
    return this.promise.then((sample) => sample.slice(options));
  }

  sep(options?: SepOptions): Promise<BounceResult> {
    return this.promise.then((sample) => sample.sep(options));
  }

  granularize(options?: GranularizeOptions): GrainCollectionPromise {
    return new GrainCollectionPromise(this.promise.then((sample) => sample.granularize(options)));
  }

  onsetSlice(options?: AnalyzeOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.promise.then((sample) => sample.onsetSlice(options)));
  }

  ampSlice(options?: AmpSliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.promise.then((sample) => sample.ampSlice(options)));
  }

  noveltySlice(options?: NoveltySliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.promise.then((sample) => sample.noveltySlice(options)));
  }

  transientSlice(options?: TransientSliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.promise.then((sample) => sample.transientSlice(options)));
  }

  nmf(options?: NmfOptions): NmfFeaturePromise {
    return new NmfFeaturePromise(this.promise.then((sample) => sample.nmf(options)));
  }

  mfcc(options?: MFCCOptions): MfccFeaturePromise {
    return new MfccFeaturePromise(this.promise.then((sample) => sample.mfcc(options)));
  }

  nx(other: SampleResult | PromiseLike<SampleResult>, options?: { components?: number }): NxFeaturePromise {
    return new NxFeaturePromise(this.promise.then((sample) => sample.nx(other, options)));
  }
}

export class CurrentSamplePromise implements PromiseLike<SampleResult | null> {
  constructor(private readonly promise: Promise<SampleResult | null>) {}

  then<TResult1 = SampleResult | null, TResult2 = never>(
    onfulfilled?: ((value: SampleResult | null) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<SampleResult | null | TResult> {
    return this.promise.catch(onrejected);
  }

  private requireSample(): Promise<SampleResult> {
    return this.promise.then((sample) => {
      if (!sample) {
        throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
      }
      return sample;
    });
  }

  help(): Promise<BounceResult> {
    return this.requireSample().then((sample) => sample.help());
  }

  play(): SamplePromise {
    return new SamplePromise(this.requireSample().then((sample) => sample.play()));
  }

  loop(opts?: LoopOptions): SamplePromise {
    return new SamplePromise(this.requireSample().then((sample) => sample.loop(opts)));
  }

  stop(): Promise<BounceResult> {
    return this.requireSample().then((sample) => sample.stop());
  }

  display(): SamplePromise {
    return new SamplePromise(this.requireSample().then((sample) => sample.display()));
  }

  slice(options?: SliceOptions): Promise<BounceResult> {
    return this.requireSample().then((sample) => sample.slice(options));
  }

  sep(options?: SepOptions): Promise<BounceResult> {
    return this.requireSample().then((sample) => sample.sep(options));
  }

  granularize(options?: GranularizeOptions): GrainCollectionPromise {
    return new GrainCollectionPromise(this.requireSample().then((sample) => sample.granularize(options)));
  }

  onsetSlice(options?: AnalyzeOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.requireSample().then((sample) => sample.onsetSlice(options)));
  }

  ampSlice(options?: AmpSliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.requireSample().then((sample) => sample.ampSlice(options)));
  }

  noveltySlice(options?: NoveltySliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.requireSample().then((sample) => sample.noveltySlice(options)));
  }

  transientSlice(options?: TransientSliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.requireSample().then((sample) => sample.transientSlice(options)));
  }

  nmf(options?: NmfOptions): NmfFeaturePromise {
    return new NmfFeaturePromise(this.requireSample().then((sample) => sample.nmf(options)));
  }

  mfcc(options?: MFCCOptions): MfccFeaturePromise {
    return new MfccFeaturePromise(this.requireSample().then((sample) => sample.mfcc(options)));
  }

  nx(other: SampleResult | PromiseLike<SampleResult>, options?: { components?: number }): NxFeaturePromise {
    return new NxFeaturePromise(this.requireSample().then((sample) => sample.nx(other, options)));
  }
}

export class GrainCollectionPromise implements PromiseLike<GrainCollection> {
  constructor(private readonly promise: Promise<GrainCollection>) {}

  then<TResult1 = GrainCollection, TResult2 = never>(
    onfulfilled?: ((value: GrainCollection) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<GrainCollection | TResult> {
    return this.promise.catch(onrejected);
  }

  length(): Promise<number> {
    return this.promise.then((collection) => collection.length());
  }

  forEach(
    callback: (grain: SampleResult, index: number) => void | Promise<void>,
  ): Promise<void> {
    return this.promise.then((collection) => collection.forEach(callback));
  }

  map<T>(callback: (grain: SampleResult, index: number) => T): Promise<T[]> {
    return this.promise.then((collection) => collection.map(callback));
  }

  filter(
    predicate: (grain: SampleResult, index: number) => boolean,
  ): GrainCollectionPromise {
    return new GrainCollectionPromise(this.promise.then((collection) => collection.filter(predicate)));
  }
}
