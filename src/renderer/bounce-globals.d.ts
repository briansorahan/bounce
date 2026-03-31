// Type declarations for the Bounce TypeScript REPL globals.
// These are injected into the REPL evaluation context by ReplEvaluator.

interface AnalyzeOptions {
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  frameDelta?: number;
  metric?: number;
}

interface NmfOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  seed?: number;
}

interface SliceOptions {
  featureHash?: string;
}

interface SepOptions {
  components?: number;
  iterations?: number;
}


interface MFCCOptions {
  numCoeffs?: number;
  numBands?: number;
  minFreq?: number;
  maxFreq?: number;
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
  sampleRate?: number;
}

interface GranularizeOptions {
  grainSize?: number;
  hopSize?: number;
  jitter?: number;
  startTime?: number;
  endTime?: number;
  normalize?: boolean;
  silenceThreshold?: number;
}

interface AmpSliceOptions {
  fastRampUp?: number;
  fastRampDown?: number;
  slowRampUp?: number;
  slowRampDown?: number;
  onThreshold?: number;
  offThreshold?: number;
  floor?: number;
  minSliceLength?: number;
  highPassFreq?: number;
}

interface NoveltySliceOptions {
  kernelSize?: number;
  threshold?: number;
  filterSize?: number;
  minSliceLength?: number;
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
}

interface TransientSliceOptions {
  order?: number;
  blockSize?: number;
  padSize?: number;
  skew?: number;
  threshFwd?: number;
  threshBack?: number;
  windowSize?: number;
  clumpLength?: number;
  minSliceLength?: number;
}

interface ToSamplerOptions {
  name: string;
  startNote?: number;
  polyphony?: number;
}

declare class BounceResult {
  toString(): string;
}

type ReplValue<T> = T extends PromiseLike<infer U> ? U : T;

declare class SampleResult extends BounceResult {
  readonly hash: string;
  readonly filePath: string | undefined;
  readonly sampleRate: number;
  readonly channels: number;
  readonly duration: number;
  readonly id: number | undefined;

  help(): BounceResult;
  play(): ReplValue<Promise<SampleResult>>;
  readonly loop: ((opts?: { loopStart?: number; loopEnd?: number }) => ReplValue<Promise<SampleResult>>) & { help: () => BounceResult };
  stop(): BounceResult;
  display(): ReplValue<Promise<SampleResult>>;
  slice(options?: SliceOptions): ReplValue<Promise<BounceResult>>;
  sep(options?: SepOptions): ReplValue<Promise<BounceResult>>;
  granularize(options?: GranularizeOptions): ReplValue<Promise<GrainCollection>>;
  onsetSlice(options?: AnalyzeOptions): ReplValue<Promise<SliceFeatureResult>>;
  ampSlice(options?: AmpSliceOptions): ReplValue<Promise<SliceFeatureResult>>;
  noveltySlice(options?: NoveltySliceOptions): ReplValue<Promise<SliceFeatureResult>>;
  transientSlice(options?: TransientSliceOptions): ReplValue<Promise<SliceFeatureResult>>;
  nmf(options?: NmfOptions): ReplValue<Promise<NmfFeatureResult>>;
  mfcc(options?: MFCCOptions): ReplValue<Promise<MfccFeatureResult>>;
}

declare class FeatureResult extends BounceResult {
  readonly source: SampleResult | undefined;
  readonly sourceHash: string;
  readonly featureHash: string;
  readonly featureType: string;
  readonly options: Record<string, unknown> | undefined;
  help(): BounceResult;
}

declare class SliceFeatureResult extends FeatureResult {
  readonly slices: number[];
  readonly count: number;
  slice(options?: SliceOptions): ReplValue<Promise<BounceResult>>;
  playSlice(index?: number): ReplValue<Promise<SampleResult>>;
  toSampler(opts: ToSamplerOptions): ReplValue<Promise<InstrumentResult>>;
}

declare class NmfFeatureResult extends FeatureResult {
  readonly components: number | undefined;
  readonly iterations: number | undefined;
  readonly converged: boolean | undefined;
  readonly bases: number[][] | Float32Array[] | undefined;
  readonly activations: number[][] | Float32Array[] | undefined;
  sep(options?: SepOptions): ReplValue<Promise<BounceResult>>;
  playComponent(index?: number): ReplValue<Promise<SampleResult>>;
}

declare class MfccFeatureResult extends FeatureResult {
  readonly numFrames: number;
  readonly numCoeffs: number;
}

declare class InstrumentResult extends BounceResult {
  readonly instrumentId: string;
  readonly name: string;
  readonly kind: string;
  readonly polyphony: number;
  readonly sampleCount: number;
  help(): BounceResult;
}

interface SampleSummaryFeature {
  sampleHash: string;
  featureHash: string | undefined;
  featureType: string;
  featureCount: number;
  filePath: string | undefined;
  options: string | null;
}

declare class SampleListResult extends BounceResult {
  readonly samples: SampleResult[];
  readonly features: SampleSummaryFeature[];
  readonly length: number;
  help(): BounceResult;
  [Symbol.iterator](): Iterator<SampleResult>;
}

declare class ProjectResult extends BounceResult {
  readonly id: number;
  readonly name: string;
  readonly createdAt: string;
  readonly sampleCount: number;
  readonly featureCount: number;
  readonly commandCount: number;
  readonly current: boolean;
  help(): BounceResult;
}

interface ProjectSummary {
  id: number;
  name: string;
  createdAt: string;
  sampleCount: number;
  featureCount: number;
  commandCount: number;
  current: boolean;
}

declare class ProjectListResult extends BounceResult {
  readonly projects: ProjectSummary[];
  readonly length: number;
  help(): BounceResult;
}

type EnvEntryScope = "user" | "global";
type EnvInspectScope = EnvEntryScope | "value";

interface EnvEntrySummary {
  name: string;
  scope: EnvEntryScope;
  typeLabel: string;
  callable: boolean;
  preview: string;
}

declare class EnvScopeResult extends BounceResult {
  readonly entries: EnvEntrySummary[];
  readonly length: number;
  help(): BounceResult;
  [Symbol.iterator](): Iterator<EnvEntrySummary>;
}

declare class EnvInspectionResult extends BounceResult {
  readonly name: string | undefined;
  readonly scope: EnvInspectScope;
  readonly typeLabel: string;
  readonly callable: boolean;
  readonly preview: string;
  readonly callableMembers: string[];
  help(): BounceResult;
}

declare class EnvFunctionListResult extends BounceResult {
  readonly targetType: string;
  readonly functions: string[];
  readonly length: number;
  help(): BounceResult;
  [Symbol.iterator](): Iterator<string>;
}

declare class GrainCollection extends BounceResult {
  length(): number;
  forEach(callback: (grain: SampleResult, index: number) => void | Promise<void>): Promise<void>;
  map<T>(callback: (grain: SampleResult, index: number) => T): T[];
  filter(predicate: (grain: SampleResult, index: number) => boolean): GrainCollection;
}

interface SampleNamespace {
  help(): BounceResult;
  stop(): BounceResult;
  read: {
    (pathOrHash: string): ReplValue<Promise<SampleResult>>;
    help(): BounceResult;
  };
  list: {
    (): ReplValue<Promise<SampleListResult>>;
    help(): BounceResult;
  };
  current: {
    (): ReplValue<Promise<SampleResult | null>>;
    help(): BounceResult;
  };
}

declare const sn: SampleNamespace;

declare const env: {
  help(): BounceResult;
  vars: {
    (): EnvScopeResult;
    help(): BounceResult;
  };
  globals: {
    (): EnvScopeResult;
    help(): BounceResult;
  };
  inspect: {
    (nameOrValue: unknown): EnvInspectionResult;
    help(): BounceResult;
  };
  functions: {
    (nameOrValue: unknown): EnvFunctionListResult;
    help(): BounceResult;
  };
};

interface ProjectNamespace {
  help(): BounceResult;
  current: {
    (): ReplValue<Promise<ProjectResult>>;
    help(): BounceResult;
  };
  list: {
    (): ReplValue<Promise<ProjectListResult>>;
    help(): BounceResult;
  };
  load: {
    (name: string): ReplValue<Promise<ProjectResult>>;
    help(): BounceResult;
  };
  rm: {
    (name: string): ReplValue<Promise<BounceResult>>;
    help(): BounceResult;
  };
}

declare const proj: ProjectNamespace;

declare class VisSceneResult extends BounceResult {
  readonly sample: SampleResult;
  readonly overlays: Array<SliceFeatureResult | NmfFeatureResult>;
  readonly panels: NmfFeatureResult[];
  readonly sceneId: string | undefined;
  readonly titleText: string | undefined;
  help(): BounceResult;
  title(text: string): VisSceneResult;
  overlay(feature: SliceFeatureResult | NmfFeatureResult): VisSceneResult;
  panel(feature: NmfFeatureResult): VisSceneResult;
  show(): ReplValue<Promise<BounceResult>>;
}

declare class VisStackResult extends BounceResult {
  readonly scenes: VisSceneResult[];
  help(): BounceResult;
  waveform(sample: SampleResult): VisStackResult;
  title(text: string): VisStackResult;
  overlay(feature: SliceFeatureResult | NmfFeatureResult): VisStackResult;
  panel(feature: NmfFeatureResult): VisStackResult;
  show(): ReplValue<Promise<BounceResult>>;
}

interface VisSceneSummary {
  id: string;
  title: string;
  sampleHash: string;
  sampleLabel: string;
  overlayCount: number;
  panelCount: number;
}

declare class VisSceneListResult extends BounceResult {
  readonly scenes: VisSceneSummary[];
  readonly length: number;
  help(): BounceResult;
}

declare const vis: {
  help(): BounceResult;
  waveform: {
    (sample: SampleResult): VisSceneResult;
    help(): BounceResult;
  };
  stack: {
    (): VisStackResult;
    help(): BounceResult;
  };
  list: {
    (): VisSceneListResult;
    help(): BounceResult;
  };
  remove: {
    (id: string): BounceResult;
    help(): BounceResult;
  };
  clear: {
    (): BounceResult;
    help(): BounceResult;
  };
};

declare const clearDebug: {
  (): ReplValue<Promise<BounceResult>>;
  help(): BounceResult;
};

declare const debug: {
  (limit?: number): ReplValue<Promise<BounceResult>>;
  help(): BounceResult;
};

declare const help: {
  (): BounceResult;
  help(): BounceResult;
};

declare const clear: {
  (): void;
  help(): BounceResult;
};

declare const corpus: {
  help(): BounceResult;
  build(source?: string | SampleResult | Promise<SampleResult>, featureHashOverride?: string): ReplValue<Promise<BounceResult>>;
  query(segmentIndex: number, k?: number): ReplValue<Promise<BounceResult>>;
  resynthesize(queryIndices: number[]): ReplValue<Promise<BounceResult>>;
};

declare const enum FileType {
  File = "file",
  Directory = "directory",
  Symlink = "symlink",
  BlockDevice = "blockDevice",
  CharDevice = "charDevice",
  FIFO = "fifo",
  Socket = "socket",
  Unknown = "unknown",
}

type WalkCatchAll = (filePath: string, type: FileType) => Promise<void>;
type WalkHandlers = Partial<Record<FileType, (filePath: string) => Promise<void>>>;

interface FsApi {
  readonly FileType: {
    readonly File: "file";
    readonly Directory: "directory";
    readonly Symlink: "symlink";
    readonly BlockDevice: "blockDevice";
    readonly CharDevice: "charDevice";
    readonly FIFO: "fifo";
    readonly Socket: "socket";
    readonly Unknown: "unknown";
  };
  help(): BounceResult;
  ls: {
    (dirPath?: string): ReplValue<LsResultPromise>;
    help(): BounceResult;
  };
  la: {
    (dirPath?: string): ReplValue<LsResultPromise>;
    help(): BounceResult;
  };
  cd: {
    (dirPath: string): ReplValue<Promise<BounceResult>>;
    help(): BounceResult;
  };
  pwd: {
    (): ReplValue<Promise<BounceResult>>;
    help(): BounceResult;
  };
  glob: {
    (pattern: string): ReplValue<GlobResultPromise>;
    help(): BounceResult;
  };
  walk: {
    (dirPath: string, handler: WalkCatchAll | WalkHandlers): ReplValue<Promise<BounceResult | undefined>>;
    help(): BounceResult;
  };
}

declare class LsResult extends BounceResult {
  readonly entries: FsLsEntry[];
  readonly total: number;
  readonly truncated: boolean;
  readonly length: number;
  filter(fn: (entry: FsLsEntry) => boolean): FsLsEntry[];
  map<T>(fn: (entry: FsLsEntry) => T): T[];
  find(fn: (entry: FsLsEntry) => boolean): FsLsEntry | undefined;
  forEach(fn: (entry: FsLsEntry) => void): void;
  some(fn: (entry: FsLsEntry) => boolean): boolean;
  every(fn: (entry: FsLsEntry) => boolean): boolean;
  [Symbol.iterator](): Iterator<FsLsEntry>;
}

declare class LsResultPromise implements PromiseLike<LsResult> {
  then<TResult1 = LsResult, TResult2 = never>(
    onfulfilled?: ((value: LsResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  filter(fn: (entry: FsLsEntry) => boolean): LsResultPromise;
  map<T>(fn: (entry: FsLsEntry) => T): Promise<T[]>;
  find(fn: (entry: FsLsEntry) => boolean): Promise<FsLsEntry | undefined>;
  forEach(fn: (entry: FsLsEntry) => void): Promise<void>;
  some(fn: (entry: FsLsEntry) => boolean): Promise<boolean>;
  every(fn: (entry: FsLsEntry) => boolean): Promise<boolean>;
}

declare class GlobResult extends BounceResult {
  readonly paths: string[];
  readonly length: number;
  filter(fn: (path: string) => boolean): string[];
  map<T>(fn: (path: string) => T): T[];
  find(fn: (path: string) => boolean): string | undefined;
  forEach(fn: (path: string) => void): void;
  some(fn: (path: string) => boolean): boolean;
  every(fn: (path: string) => boolean): boolean;
  [Symbol.iterator](): Iterator<string>;
}

declare class GlobResultPromise implements PromiseLike<GlobResult> {
  then<TResult1 = GlobResult, TResult2 = never>(
    onfulfilled?: ((value: GlobResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  filter(fn: (path: string) => boolean): GlobResultPromise;
  map<T>(fn: (path: string) => T): Promise<T[]>;
  find(fn: (path: string) => boolean): Promise<string | undefined>;
  forEach(fn: (path: string) => void): Promise<void>;
  some(fn: (path: string) => boolean): Promise<boolean>;
  every(fn: (path: string) => boolean): Promise<boolean>;
}

declare const fs: FsApi;

declare const transport: import('./namespaces/transport-namespace').TransportNamespace;
declare const pat: import('./namespaces/pat-namespace').PatNamespace;
