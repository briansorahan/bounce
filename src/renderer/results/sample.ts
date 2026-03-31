import type { GrainCollection } from "../grain-collection.js";
import { BounceResult, HelpableResult, defaultHelp, type HelpFactory } from "./base.js";
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
  loop: ((opts?: LoopOptions) => Promise<SampleResult>) & { help: () => BounceResult };
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
  const loopUnavailable = Object.assign(
    async () => { throw new Error(`${name} cannot be looped in this context.`); },
    { help: () => new BounceResult(`\x1b[33m${name} loop is not available in this context\x1b[0m`) },
  );
  return {
    help: () => defaultHelp(name),
    play: async () => {
      throw new Error(`${name} cannot be played in this context.`);
    },
    loop: loopUnavailable,
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
 * User-facing sample object in the REPL.
 */
export class SampleResult extends HelpableResult {
  readonly loop: ((opts?: LoopOptions) => SamplePromise) & { help: () => BounceResult };

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
    this.loop = Object.assign(
      (opts?: LoopOptions): SamplePromise => new SamplePromise(bindings.loop(opts)),
      { help: () => bindings.loop.help() },
    );
  }

  play(): SamplePromise {
    return new SamplePromise(this.bindings.play());
  }

  stop(): BounceResult {
    return this.bindings.stop();
  }

  display(): SamplePromise {
    return new SamplePromise(this.bindings.display());
  }

  slice(options?: SliceOptions): Promise<BounceResult> {
    return this.bindings.slice(options);
  }

  sep(options?: SepOptions): Promise<BounceResult> {
    return this.bindings.sep(options);
  }

  granularize(options?: GranularizeOptions): GrainCollectionPromise {
    return new GrainCollectionPromise(this.bindings.granularize(options));
  }

  onsetSlice(options?: AnalyzeOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.bindings.onsetSlice(options));
  }

  ampSlice(options?: AmpSliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.bindings.ampSlice(options));
  }

  noveltySlice(options?: NoveltySliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.bindings.noveltySlice(options));
  }

  transientSlice(options?: TransientSliceOptions): SliceFeaturePromise {
    return new SliceFeaturePromise(this.bindings.transientSlice(options));
  }

  nmf(options?: NmfOptions): NmfFeaturePromise {
    return new NmfFeaturePromise(this.bindings.nmf(options));
  }

  mfcc(options?: MFCCOptions): MfccFeaturePromise {
    return new MfccFeaturePromise(this.bindings.mfcc(options));
  }

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
