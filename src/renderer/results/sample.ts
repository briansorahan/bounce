import type { GrainCollection } from "../grain-collection.js";
import { BounceResult, HelpableResult, defaultHelp, type HelpFactory } from "./base.js";
import {
  OnsetFeaturePromise,
  NmfFeaturePromise,
  MfccFeaturePromise,
  NxFeaturePromise,
  type OnsetFeature,
  type NmfFeature,
  type MfccFeature,
  type NxFeature,
} from "./features.js";
import type { InputsResult, AudioDevice } from "./recording.js";

export interface LoopOptions {
  loopStart?: number;
  loopEnd?: number;
}

export interface SampleMethodBindings {
  help: HelpFactory;
  play: () => Promise<Sample>;
  loop: ((opts?: LoopOptions) => Promise<Sample>) & { help: () => BounceResult };
  stop: () => BounceResult;
  display: () => Promise<Sample>;
  slice: (options?: SliceOptions) => Promise<BounceResult>;
  sep: (options?: SepOptions) => Promise<BounceResult>;
  granularize: (options?: GranularizeOptions) => Promise<GrainCollection>;
  onsets: (options?: AnalyzeOptions) => Promise<OnsetFeature>;
  nmf: (options?: NmfOptions) => Promise<NmfFeature>;
  mfcc: (options?: MFCCOptions) => Promise<MfccFeature>;
  nx: (other: Sample | PromiseLike<Sample>, options?: { components?: number }) => Promise<NxFeature>;
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
    onsets: async () => {
      throw new Error(`${name} does not support onset analysis in this context.`);
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
export class Sample extends HelpableResult {
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

  onsets(options?: AnalyzeOptions): OnsetFeaturePromise {
    return new OnsetFeaturePromise(this.bindings.onsets(options));
  }

  nmf(options?: NmfOptions): NmfFeaturePromise {
    return new NmfFeaturePromise(this.bindings.nmf(options));
  }

  mfcc(options?: MFCCOptions): MfccFeaturePromise {
    return new MfccFeaturePromise(this.bindings.mfcc(options));
  }

  nx(other: Sample | PromiseLike<Sample>, options?: { components?: number }): NxFeaturePromise {
    return new NxFeaturePromise(this.bindings.nx(other, options));
  }
}

/**
 * Compatibility wrapper retained for internal/tests that still construct
 * simple audio identity objects directly.
 */
export class AudioResult extends Sample {
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
    public readonly samples: Sample[],
    public readonly features: SampleSummaryFeature[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }

  get length(): number {
    return this.samples.length;
  }

  [Symbol.iterator](): Iterator<Sample> {
    return this.samples[Symbol.iterator]();
  }
}

export interface SampleNamespaceBindings {
  help: HelpFactory;
  read: (pathOrHash: string) => Promise<Sample>;
  list: () => Promise<SampleListResult>;
  current: () => Promise<Sample | null>;
  stop: () => BounceResult;
  inputs: () => Promise<InputsResult>;
  dev: (index: number) => Promise<AudioDevice>;
}

export class SampleNamespace extends HelpableResult {
  constructor(
    display: string,
    private readonly bindings: SampleNamespaceBindings,
  ) {
    super(display, bindings.help);
  }

  read(pathOrHash: string): SamplePromise {
    return new SamplePromise(this.bindings.read(pathOrHash));
  }

  list(): Promise<SampleListResult> {
    return this.bindings.list();
  }

  current(): CurrentSamplePromise {
    return new CurrentSamplePromise(this.bindings.current());
  }

  stop(): BounceResult {
    return this.bindings.stop();
  }

  inputs(): Promise<InputsResult> {
    return this.bindings.inputs();
  }

  dev(index: number): Promise<AudioDevice> {
    return this.bindings.dev(index);
  }
}

export class SamplePromise implements PromiseLike<Sample> {
  constructor(protected readonly promise: Promise<Sample>) {}

  then<TResult1 = Sample, TResult2 = never>(
    onfulfilled?: ((value: Sample) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<Sample | TResult> {
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

  onsets(options?: AnalyzeOptions): OnsetFeaturePromise {
    return new OnsetFeaturePromise(this.promise.then((sample) => sample.onsets(options)));
  }

  nmf(options?: NmfOptions): NmfFeaturePromise {
    return new NmfFeaturePromise(this.promise.then((sample) => sample.nmf(options)));
  }

  mfcc(options?: MFCCOptions): MfccFeaturePromise {
    return new MfccFeaturePromise(this.promise.then((sample) => sample.mfcc(options)));
  }

  nx(other: Sample | PromiseLike<Sample>, options?: { components?: number }): NxFeaturePromise {
    return new NxFeaturePromise(this.promise.then((sample) => sample.nx(other, options)));
  }
}

export class CurrentSamplePromise implements PromiseLike<Sample | null> {
  constructor(private readonly promise: Promise<Sample | null>) {}

  then<TResult1 = Sample | null, TResult2 = never>(
    onfulfilled?: ((value: Sample | null) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<Sample | null | TResult> {
    return this.promise.catch(onrejected);
  }

  private requireSample(): Promise<Sample> {
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

  onsets(options?: AnalyzeOptions): OnsetFeaturePromise {
    return new OnsetFeaturePromise(this.requireSample().then((sample) => sample.onsets(options)));
  }

  nmf(options?: NmfOptions): NmfFeaturePromise {
    return new NmfFeaturePromise(this.requireSample().then((sample) => sample.nmf(options)));
  }

  mfcc(options?: MFCCOptions): MfccFeaturePromise {
    return new MfccFeaturePromise(this.requireSample().then((sample) => sample.mfcc(options)));
  }

  nx(other: Sample | PromiseLike<Sample>, options?: { components?: number }): NxFeaturePromise {
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
    callback: (grain: Sample, index: number) => void | Promise<void>,
  ): Promise<void> {
    return this.promise.then((collection) => collection.forEach(callback));
  }

  map<T>(callback: (grain: Sample, index: number) => T): Promise<T[]> {
    return this.promise.then((collection) => collection.map(callback));
  }

  filter(
    predicate: (grain: Sample, index: number) => boolean,
  ): GrainCollectionPromise {
    return new GrainCollectionPromise(this.promise.then((collection) => collection.filter(predicate)));
  }
}
