import type { GrainCollection } from "./grain-collection.js";

/**
 * Base class for all Bounce REPL command results.
 * Subclasses carry typed data enabling command composition.
 * toString() returns the pre-formatted ANSI string shown in the terminal.
 */
export class BounceResult {
  constructor(private readonly displayText: string) {}

  toString(): string {
    return this.displayText;
  }
}

type HelpFactory = () => BounceResult;

function defaultHelp(name: string): BounceResult {
  return new BounceResult(`\x1b[1;36m${name}\x1b[0m`);
}

class HelpableResult extends BounceResult {
  constructor(
    display: string,
    private readonly helpFactory: HelpFactory,
  ) {
    super(display);
  }

  help(): BounceResult {
    return this.helpFactory();
  }
}

export interface SampleMethodBindings {
  help: HelpFactory;
  play: () => Promise<Sample>;
  loop: () => Promise<Sample>;
  stop: () => BounceResult;
  display: () => Promise<Sample>;
  slice: (options?: SliceOptions) => Promise<BounceResult>;
  sep: (options?: SepOptions) => Promise<BounceResult>;
  granularize: (options?: GranularizeOptions) => Promise<GrainCollection>;
  onsets: (options?: AnalyzeOptions) => Promise<OnsetFeature>;
  nmf: (options?: NmfOptions) => Promise<NmfFeature>;
  mfcc: (options?: MFCCOptions) => Promise<MfccFeature>;
}

function unavailableSampleBindings(name: string): SampleMethodBindings {
  return {
    help: () => defaultHelp(name),
    play: async () => {
      throw new Error(`${name} cannot be played in this context.`);
    },
    loop: async () => {
      throw new Error(`${name} cannot be looped in this context.`);
    },
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
  };
}

/**
 * User-facing sample object in the REPL.
 */
export class Sample extends HelpableResult {
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
  }

  play(): SamplePromise {
    return new SamplePromise(this.bindings.play());
  }

  loop(): SamplePromise {
    return new SamplePromise(this.bindings.loop());
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

export interface MfccFeatureBindings {
  help: HelpFactory;
}

/**
 * Base feature result object.
 */
export class FeatureResult extends HelpableResult {
  public readonly source: Sample | undefined;
  public readonly sourceHash: string;

  constructor(
    display: string,
    source: Sample | string,
    public readonly featureHash: string,
    public readonly featureType: string,
    public readonly options: unknown,
    helpFactory: HelpFactory = () => defaultHelp(featureType),
  ) {
    super(display, helpFactory);
    this.source = typeof source === "string" ? undefined : source;
    this.sourceHash = typeof source === "string" ? source : source.hash;
  }
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

export interface VisSceneBindings {
  help: HelpFactory;
  show: (scene: VisScene) => Promise<BounceResult>;
}

export interface VisStackBindings {
  help: HelpFactory;
  show: (stack: VisStack) => Promise<BounceResult>;
}

export interface VisSceneSummary {
  id: string;
  title: string;
  sampleHash: string;
  sampleLabel: string;
  overlayCount: number;
  panelCount: number;
}

export class VisScene extends HelpableResult {
  readonly overlays: Array<OnsetFeature | NmfFeature> = [];
  readonly panels: NmfFeature[] = [];
  private shownSceneId: string | undefined;
  public titleText: string | undefined;

  constructor(
    public readonly sample: Sample,
    titleText: string | undefined,
    private readonly bindings: VisSceneBindings,
  ) {
    super("", bindings.help);
    this.titleText = titleText;
  }

  override toString(): string {
    const label = this.sample.filePath?.split(/[/\\]/).pop() ?? this.sample.hash.substring(0, 8);
    return [
      `\x1b[1;36mVisScene${this.shownSceneId ? ` ${this.shownSceneId}` : ""}\x1b[0m`,
      "",
      `  sample:   ${label}`,
      `  overlays: ${this.overlays.length}`,
      `  panels:   ${this.panels.length}`,
      `  shown:    ${this.shownSceneId ? "yes" : "no"}`,
      this.titleText ? `  title:    ${this.titleText}` : "",
    ].filter(Boolean).join("\n");
  }

  get sceneId(): string | undefined {
    return this.shownSceneId;
  }

  title(text: string): VisScene {
    this.titleText = text;
    return this;
  }

  overlay(feature: OnsetFeature | NmfFeature): VisScene {
    this.overlays.push(feature);
    return this;
  }

  panel(feature: NmfFeature): VisScene {
    this.panels.push(feature);
    return this;
  }

  show(): Promise<BounceResult> {
    return this.bindings.show(this);
  }

  markShown(id: string): void {
    this.shownSceneId = id;
  }
}

export class VisSceneListResult extends HelpableResult {
  constructor(
    display: string,
    public readonly scenes: VisSceneSummary[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }

  get length(): number {
    return this.scenes.length;
  }
}

export class VisStack extends HelpableResult {
  readonly scenes: VisScene[] = [];

  constructor(private readonly bindings: VisStackBindings) {
    super("", bindings.help);
  }

  override toString(): string {
    return [
      "\x1b[1;36mVisStack\x1b[0m",
      "",
      `  scenes: ${this.scenes.length}`,
      this.scenes.length > 0
        ? `  latest: ${this.scenes[this.scenes.length - 1].sample.filePath?.split(/[/\\]/).pop() ?? this.scenes[this.scenes.length - 1].sample.hash.substring(0, 8)}`
        : "  latest: none",
    ].join("\n");
  }

  waveform(_sample: Sample): VisStack {
    throw new Error("Use vis.stack().waveform(sample) from the vis namespace.");
  }

  addScene(scene: VisScene): VisStack {
    this.scenes.push(scene);
    return this;
  }

  title(text: string): VisStack {
    this.requireLatestScene().title(text);
    return this;
  }

  overlay(feature: OnsetFeature | NmfFeature): VisStack {
    this.requireLatestScene().overlay(feature);
    return this;
  }

  panel(feature: NmfFeature): VisStack {
    this.requireLatestScene().panel(feature);
    return this;
  }

  show(): Promise<BounceResult> {
    return this.bindings.show(this);
  }

  private requireLatestScene(): VisScene {
    const latest = this.scenes[this.scenes.length - 1];
    if (!latest) {
      throw new Error("No scenes in stack. Call stack.waveform(sample) first.");
    }
    return latest;
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

export interface ProjectSummary {
  id: number;
  name: string;
  createdAt: string;
  sampleCount: number;
  featureCount: number;
  commandCount: number;
  current: boolean;
}

export class ProjectResult extends HelpableResult {
  constructor(
    display: string,
    public readonly id: number,
    public readonly name: string,
    public readonly createdAt: string,
    public readonly sampleCount: number,
    public readonly featureCount: number,
    public readonly commandCount: number,
    public readonly current: boolean,
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }
}

export class ProjectListResult extends HelpableResult {
  constructor(
    display: string,
    public readonly projects: ProjectSummary[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }

  get length(): number {
    return this.projects.length;
  }
}

export interface ProjectNamespaceBindings {
  help: HelpFactory;
  current: () => Promise<ProjectResult>;
  list: () => Promise<ProjectListResult>;
  load: (name: string) => Promise<ProjectResult>;
  rm: (name: string) => Promise<BounceResult>;
}

export class ProjectNamespace extends HelpableResult {
  constructor(
    display: string,
    private readonly bindings: ProjectNamespaceBindings,
  ) {
    super(display, bindings.help);
  }

  current(): Promise<ProjectResult> {
    return this.bindings.current();
  }

  list(): Promise<ProjectListResult> {
    return this.bindings.list();
  }

  load(name: string): Promise<ProjectResult> {
    return this.bindings.load(name);
  }

  rm(name: string): Promise<BounceResult> {
    return this.bindings.rm(name);
  }
}

export interface SampleNamespaceBindings {
  help: HelpFactory;
  read: (pathOrHash: string) => Promise<Sample>;
  list: () => Promise<SampleListResult>;
  current: () => Promise<Sample | null>;
  stop: () => BounceResult;
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

  loop(): SamplePromise {
    return new SamplePromise(this.promise.then((sample) => sample.loop()));
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

  loop(): SamplePromise {
    return new SamplePromise(this.requireSample().then((sample) => sample.loop()));
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

/** Formats FsLsEntry array into an ANSI-colored ls-style string. */
export function formatLsEntries(
  entries: Array<{ name: string; type: string; isAudio: boolean }>,
  truncated: boolean,
  total: number,
): string {
  const lines = entries.map((e) => {
    if (e.type === "directory") return `\x1b[34m${e.name}/\x1b[0m`;
    if (e.isAudio) return `\x1b[32m${e.name}\x1b[0m`;
    return e.name;
  });
  if (truncated) {
    lines.push(`\x1b[33m... ${total - 200} more items\x1b[0m`);
  }
  return lines.join("\n");
}

/**
 * Returned by fs.ls() and fs.la().
 * Displays as unix-style ls output, but is filterable/iterable as a collection of entries.
 */
export class LsResult extends BounceResult {
  readonly total: number;
  readonly truncated: boolean;

  constructor(
    display: string,
    public readonly entries: FsLsEntry[],
    total: number,
    truncated: boolean,
  ) {
    super(display);
    this.total = total;
    this.truncated = truncated;
  }

  get length(): number {
    return this.entries.length;
  }

  filter(fn: (entry: FsLsEntry) => boolean): FsLsEntry[] {
    return this.entries.filter(fn);
  }

  map<T>(fn: (entry: FsLsEntry) => T): T[] {
    return this.entries.map(fn);
  }

  find(fn: (entry: FsLsEntry) => boolean): FsLsEntry | undefined {
    return this.entries.find(fn);
  }

  forEach(fn: (entry: FsLsEntry) => void): void {
    this.entries.forEach(fn);
  }

  some(fn: (entry: FsLsEntry) => boolean): boolean {
    return this.entries.some(fn);
  }

  every(fn: (entry: FsLsEntry) => boolean): boolean {
    return this.entries.every(fn);
  }

  [Symbol.iterator](): Iterator<FsLsEntry> {
    return this.entries[Symbol.iterator]();
  }
}

/**
 * Returned by fs.glob().
 * Displays as one path per line, but is filterable/iterable as a string collection.
 */
export class GlobResult extends BounceResult {
  readonly paths: string[];

  constructor(paths: string[]) {
    super(paths.length === 0 ? "\x1b[90m(no matches)\x1b[0m" : paths.join("\n"));
    this.paths = paths;
  }

  get length(): number {
    return this.paths.length;
  }

  filter(fn: (path: string) => boolean): string[] {
    return this.paths.filter(fn);
  }

  map<T>(fn: (path: string) => T): T[] {
    return this.paths.map(fn);
  }

  find(fn: (path: string) => boolean): string | undefined {
    return this.paths.find(fn);
  }

  forEach(fn: (path: string) => void): void {
    this.paths.forEach(fn);
  }

  some(fn: (path: string) => boolean): boolean {
    return this.paths.some(fn);
  }

  every(fn: (path: string) => boolean): boolean {
    return this.paths.every(fn);
  }

  [Symbol.iterator](): Iterator<string> {
    return this.paths[Symbol.iterator]();
  }
}

/**
 * A thenable wrapper around Promise<LsResult> that exposes LsResult's array methods
 * directly, so users can chain without await: fs.ls().filter(f => f.isAudio)
 */
export class LsResultPromise implements PromiseLike<LsResult> {
  constructor(private readonly promise: Promise<LsResult>) {}

  then<TResult1 = LsResult, TResult2 = never>(
    onfulfilled?: ((value: LsResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<LsResult | TResult> {
    return this.promise.catch(onrejected);
  }

  filter(fn: (entry: FsLsEntry) => boolean): LsResultPromise {
    return new LsResultPromise(
      this.promise.then((r) => {
        const filtered = r.entries.filter(fn);
        return new LsResult(formatLsEntries(filtered, false, filtered.length), filtered, filtered.length, false);
      }),
    );
  }

  map<T>(fn: (entry: FsLsEntry) => T): Promise<T[]> {
    return this.promise.then((r) => r.map(fn));
  }

  find(fn: (entry: FsLsEntry) => boolean): Promise<FsLsEntry | undefined> {
    return this.promise.then((r) => r.find(fn));
  }

  forEach(fn: (entry: FsLsEntry) => void): Promise<void> {
    return this.promise.then((r) => r.forEach(fn));
  }

  some(fn: (entry: FsLsEntry) => boolean): Promise<boolean> {
    return this.promise.then((r) => r.some(fn));
  }

  every(fn: (entry: FsLsEntry) => boolean): Promise<boolean> {
    return this.promise.then((r) => r.every(fn));
  }
}

/**
 * A thenable wrapper around Promise<GlobResult> that exposes GlobResult's array methods
 * directly, so users can chain without await: fs.glob("**\/*.wav").filter(p => p.includes("drum"))
 */
export class GlobResultPromise implements PromiseLike<GlobResult> {
  constructor(private readonly promise: Promise<GlobResult>) {}

  then<TResult1 = GlobResult, TResult2 = never>(
    onfulfilled?: ((value: GlobResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<GlobResult | TResult> {
    return this.promise.catch(onrejected);
  }

  filter(fn: (path: string) => boolean): GlobResultPromise {
    return new GlobResultPromise(this.promise.then((r) => new GlobResult(r.paths.filter(fn))));
  }

  map<T>(fn: (path: string) => T): Promise<T[]> {
    return this.promise.then((r) => r.map(fn));
  }

  find(fn: (path: string) => boolean): Promise<string | undefined> {
    return this.promise.then((r) => r.find(fn));
  }

  forEach(fn: (path: string) => void): Promise<void> {
    return this.promise.then((r) => r.forEach(fn));
  }

  some(fn: (path: string) => boolean): Promise<boolean> {
    return this.promise.then((r) => r.some(fn));
  }

  every(fn: (path: string) => boolean): Promise<boolean> {
    return this.promise.then((r) => r.every(fn));
  }
}
