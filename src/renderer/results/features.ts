import { BounceResult, FeatureResult, type HelpFactory } from "./base.js";
import { SamplePromise, type Sample } from "./sample.js";

export interface OnsetFeatureBindings {
  help: HelpFactory;
  slice: (options?: SliceOptions) => Promise<BounceResult>;
  playSlice: (index?: number) => Promise<Sample>;
}

export interface NmfFeatureBindings {
  help: HelpFactory;
  sep: (options?: SepOptions) => Promise<BounceResult>;
  playComponent: (index?: number) => Promise<Sample>;
}

export interface NxFeatureBindings {
  help: HelpFactory;
  playComponent: (index?: number) => Promise<Sample>;
}

export interface MfccFeatureBindings {
  help: HelpFactory;
}

export class OnsetFeature extends FeatureResult {
  constructor(
    display: string,
    source: Sample,
    featureHash: string,
    options: AnalyzeOptions | undefined,
    public readonly slices: number[],
    private readonly bindings: OnsetFeatureBindings,
  ) {
    super(display, source, featureHash, "onset-slice", options, bindings.help);
  }

  get count(): number {
    return this.slices.length;
  }

  slice(options?: SliceOptions): Promise<BounceResult> {
    return this.bindings.slice(options);
  }

  playSlice(index = 0): SamplePromise {
    return new SamplePromise(this.bindings.playSlice(index));
  }
}

export class NmfFeature extends FeatureResult {
  constructor(
    display: string,
    source: Sample,
    featureHash: string,
    options: NmfOptions | undefined,
    public readonly components: number | undefined,
    public readonly iterations: number | undefined,
    public readonly converged: boolean | undefined,
    public readonly bases: number[][] | Float32Array[] | undefined,
    public readonly activations: number[][] | Float32Array[] | undefined,
    private readonly bindings: NmfFeatureBindings,
  ) {
    super(display, source, featureHash, "nmf", options, bindings.help);
  }

  sep(options?: SepOptions): Promise<BounceResult> {
    return this.bindings.sep(options);
  }

  playComponent(index = 0): SamplePromise {
    return new SamplePromise(this.bindings.playComponent(index));
  }
}

export class NxFeature extends FeatureResult {
  constructor(
    display: string,
    source: Sample,
    featureHash: string,
    options: Record<string, unknown> | undefined,
    public readonly components: number,
    public readonly sourceSampleHash: string,
    public readonly sourceFeatureHash: string,
    public readonly bases: number[][] | undefined,
    public readonly activations: number[][] | undefined,
    private readonly bindings: NxFeatureBindings,
  ) {
    super(display, source, featureHash, "nmf-cross", options, bindings.help);
  }

  playComponent(index = 0): SamplePromise {
    return new SamplePromise(this.bindings.playComponent(index));
  }
}

export class MfccFeature extends FeatureResult {
  constructor(
    display: string,
    source: Sample,
    featureHash: string,
    options: MFCCOptions | undefined,
    public readonly numFrames: number,
    public readonly numCoeffs: number,
    private readonly bindings: MfccFeatureBindings,
  ) {
    super(display, source, featureHash, "mfcc", options, bindings.help);
  }
}

export class OnsetFeaturePromise implements PromiseLike<OnsetFeature> {
  constructor(private readonly promise: Promise<OnsetFeature>) {}

  then<TResult1 = OnsetFeature, TResult2 = never>(
    onfulfilled?: ((value: OnsetFeature) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<OnsetFeature | TResult> {
    return this.promise.catch(onrejected);
  }

  help(): Promise<BounceResult> {
    return this.promise.then((feature) => feature.help());
  }

  slice(options?: SliceOptions): Promise<BounceResult> {
    return this.promise.then((feature) => feature.slice(options));
  }

  playSlice(index = 0): SamplePromise {
    return new SamplePromise(this.promise.then((feature) => feature.playSlice(index)));
  }
}

export class NmfFeaturePromise implements PromiseLike<NmfFeature> {
  constructor(private readonly promise: Promise<NmfFeature>) {}

  then<TResult1 = NmfFeature, TResult2 = never>(
    onfulfilled?: ((value: NmfFeature) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<NmfFeature | TResult> {
    return this.promise.catch(onrejected);
  }

  help(): Promise<BounceResult> {
    return this.promise.then((feature) => feature.help());
  }

  sep(options?: SepOptions): Promise<BounceResult> {
    return this.promise.then((feature) => feature.sep(options));
  }

  playComponent(index = 0): SamplePromise {
    return new SamplePromise(this.promise.then((feature) => feature.playComponent(index)));
  }
}

export class NxFeaturePromise implements PromiseLike<NxFeature> {
  constructor(private readonly promise: Promise<NxFeature>) {}

  then<TResult1 = NxFeature, TResult2 = never>(
    onfulfilled?: ((value: NxFeature) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<NxFeature | TResult> {
    return this.promise.catch(onrejected);
  }

  help(): Promise<BounceResult> {
    return this.promise.then((feature) => feature.help());
  }

  playComponent(index = 0): SamplePromise {
    return new SamplePromise(this.promise.then((feature) => feature.playComponent(index)));
  }
}

export class MfccFeaturePromise implements PromiseLike<MfccFeature> {
  constructor(private readonly promise: Promise<MfccFeature>) {}

  then<TResult1 = MfccFeature, TResult2 = never>(
    onfulfilled?: ((value: MfccFeature) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<MfccFeature | TResult> {
    return this.promise.catch(onrejected);
  }

  help(): Promise<BounceResult> {
    return this.promise.then((feature) => feature.help());
  }
}
