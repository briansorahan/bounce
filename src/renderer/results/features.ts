import { attachMethodHelp } from "../help.js";
import { BounceResult, FeatureResult, type HelpFactory } from "./base.js";
import { SamplePromise, type SampleResult } from "./sample.js";
import { InstrumentResult } from "./instrument.js";
import { porcelainTypeHelps } from "./porcelain-types.generated.js";

const sliceMethodHelps = porcelainTypeHelps.find(t => t.name === "SliceFeature")?.methods ?? [];
const nmfMethodHelps = porcelainTypeHelps.find(t => t.name === "NmfFeature")?.methods ?? [];
const nxMethodHelps = porcelainTypeHelps.find(t => t.name === "NxFeature")?.methods ?? [];
const mfccMethodHelps = porcelainTypeHelps.find(t => t.name === "MfccFeature")?.methods ?? [];

export interface ToSamplerOptions {
  name: string;
  startNote?: number;
  polyphony?: number;
}

export interface SliceFeatureBindings {
  help: HelpFactory;
  slice: (options?: SliceOptions) => Promise<BounceResult>;
  playSlice: (index?: number) => Promise<SampleResult>;
  toSampler: (opts: ToSamplerOptions) => Promise<InstrumentResult>;
}

export interface NmfFeatureBindings {
  help: HelpFactory;
  sep: (options?: SepOptions) => Promise<BounceResult>;
  playComponent: (index?: number) => Promise<SampleResult>;
}

export interface NxFeatureBindings {
  help: HelpFactory;
  playComponent: (index?: number) => Promise<SampleResult>;
}

export interface MfccFeatureBindings {
  help: HelpFactory;
}

export class SliceFeatureResult extends FeatureResult {
  constructor(
    display: string,
    source: SampleResult,
    featureHash: string,
    options: Record<string, unknown> | undefined,
    public readonly slices: number[],
    private readonly bindings: SliceFeatureBindings,
  ) {
    super(display, source, featureHash, "onset-slice", options, bindings.help);
    attachMethodHelp(this, "SliceFeature", sliceMethodHelps);
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

  toSampler(opts: ToSamplerOptions): Promise<InstrumentResult> {
    return this.bindings.toSampler(opts);
  }
}

export class NmfFeatureResult extends FeatureResult {
  constructor(
    display: string,
    source: SampleResult,
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
    attachMethodHelp(this, "NmfFeature", nmfMethodHelps);
  }

  sep(options?: SepOptions): Promise<BounceResult> {
    return this.bindings.sep(options);
  }

  playComponent(index = 0): SamplePromise {
    return new SamplePromise(this.bindings.playComponent(index));
  }
}

export class NxFeatureResult extends FeatureResult {
  constructor(
    display: string,
    source: SampleResult,
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
    attachMethodHelp(this, "NxFeature", nxMethodHelps);
  }

  playComponent(index = 0): SamplePromise {
    return new SamplePromise(this.bindings.playComponent(index));
  }
}

export class MfccFeatureResult extends FeatureResult {
  constructor(
    display: string,
    source: SampleResult,
    featureHash: string,
    options: MFCCOptions | undefined,
    public readonly numFrames: number,
    public readonly numCoeffs: number,
    private readonly bindings: MfccFeatureBindings,
  ) {
    super(display, source, featureHash, "mfcc", options, bindings.help);
    attachMethodHelp(this, "MfccFeature", mfccMethodHelps);
  }
}

export class SliceFeaturePromise implements PromiseLike<SliceFeatureResult> {
  constructor(private readonly promise: Promise<SliceFeatureResult>) {}

  then<TResult1 = SliceFeatureResult, TResult2 = never>(
    onfulfilled?: ((value: SliceFeatureResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<SliceFeatureResult | TResult> {
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

  toSampler(opts: ToSamplerOptions): Promise<InstrumentResult> {
    return this.promise.then((feature) => feature.toSampler(opts));
  }
}

export class NmfFeaturePromise implements PromiseLike<NmfFeatureResult> {
  constructor(private readonly promise: Promise<NmfFeatureResult>) {}

  then<TResult1 = NmfFeatureResult, TResult2 = never>(
    onfulfilled?: ((value: NmfFeatureResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<NmfFeatureResult | TResult> {
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

export class NxFeaturePromise implements PromiseLike<NxFeatureResult> {
  constructor(private readonly promise: Promise<NxFeatureResult>) {}

  then<TResult1 = NxFeatureResult, TResult2 = never>(
    onfulfilled?: ((value: NxFeatureResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<NxFeatureResult | TResult> {
    return this.promise.catch(onrejected);
  }

  help(): Promise<BounceResult> {
    return this.promise.then((feature) => feature.help());
  }

  playComponent(index = 0): SamplePromise {
    return new SamplePromise(this.promise.then((feature) => feature.playComponent(index)));
  }
}

export class MfccFeaturePromise implements PromiseLike<MfccFeatureResult> {
  constructor(private readonly promise: Promise<MfccFeatureResult>) {}

  then<TResult1 = MfccFeatureResult, TResult2 = never>(
    onfulfilled?: ((value: MfccFeatureResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<MfccFeatureResult | TResult> {
    return this.promise.catch(onrejected);
  }

  help(): Promise<BounceResult> {
    return this.promise.then((feature) => feature.help());
  }
}
