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

interface NxOptions {
  sourceHash?: string;
  targetHash?: string;
  components?: number;
}

interface VisualizeNmfOptions {
  featureHash?: string;
}

interface VisualizeNxOptions {
  featureHash?: string;
}

interface OnsetSliceVisOptions {
  featureHash?: string;
}

interface NmfVisOptions {
  featureHash?: string;
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

declare class BounceResult {
  toString(): string;
}

type ReplValue<T> = T extends PromiseLike<infer U> ? U : T;

declare class Sample extends BounceResult {
  readonly hash: string;
  readonly filePath: string | undefined;
  readonly sampleRate: number;
  readonly channels: number;
  readonly duration: number;
  readonly id: number | undefined;

  help(): BounceResult;
  play(): ReplValue<Promise<Sample>>;
  loop(): ReplValue<Promise<Sample>>;
  stop(): BounceResult;
  display(): ReplValue<Promise<Sample>>;
  slice(options?: SliceOptions): ReplValue<Promise<BounceResult>>;
  sep(options?: SepOptions): ReplValue<Promise<BounceResult>>;
  granularize(options?: GranularizeOptions): ReplValue<Promise<GrainCollection>>;
  onsets(options?: AnalyzeOptions): ReplValue<Promise<OnsetFeature>>;
  nmf(options?: NmfOptions): ReplValue<Promise<NmfFeature>>;
  mfcc(options?: MFCCOptions): ReplValue<Promise<MfccFeature>>;
}

declare class FeatureResult extends BounceResult {
  readonly source: Sample | undefined;
  readonly sourceHash: string;
  readonly featureHash: string;
  readonly featureType: string;
  readonly options: Record<string, unknown> | undefined;
  help(): BounceResult;
}

declare class OnsetFeature extends FeatureResult {
  readonly slices: number[];
  readonly count: number;
  slice(options?: SliceOptions): ReplValue<Promise<BounceResult>>;
  playSlice(index?: number): ReplValue<Promise<Sample>>;
}

declare class NmfFeature extends FeatureResult {
  readonly components: number | undefined;
  readonly iterations: number | undefined;
  readonly converged: boolean | undefined;
  readonly bases: number[][] | Float32Array[] | undefined;
  readonly activations: number[][] | Float32Array[] | undefined;
  sep(options?: SepOptions): ReplValue<Promise<BounceResult>>;
  playComponent(index?: number): ReplValue<Promise<Sample>>;
}

declare class MfccFeature extends FeatureResult {
  readonly numFrames: number;
  readonly numCoeffs: number;
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
  readonly samples: Sample[];
  readonly features: SampleSummaryFeature[];
  readonly length: number;
  help(): BounceResult;
  [Symbol.iterator](): Iterator<Sample>;
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
  forEach(callback: (grain: Sample, index: number) => void | Promise<void>): Promise<void>;
  map<T>(callback: (grain: Sample, index: number) => T): T[];
  filter(predicate: (grain: Sample, index: number) => boolean): GrainCollection;
}

interface SampleNamespace {
  help(): BounceResult;
  stop(): BounceResult;
  read: {
    (pathOrHash: string): ReplValue<Promise<Sample>>;
    help(): BounceResult;
  };
  list: {
    (): ReplValue<Promise<SampleListResult>>;
    help(): BounceResult;
  };
  current: {
    (): ReplValue<Promise<Sample | null>>;
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

declare class VisScene extends BounceResult {
  readonly sample: Sample;
  readonly overlays: Array<OnsetFeature | NmfFeature>;
  readonly panels: NmfFeature[];
  readonly sceneId: string | undefined;
  readonly titleText: string | undefined;
  help(): BounceResult;
  title(text: string): VisScene;
  overlay(feature: OnsetFeature | NmfFeature): VisScene;
  panel(feature: NmfFeature): VisScene;
  show(): ReplValue<Promise<BounceResult>>;
}

declare class VisStack extends BounceResult {
  readonly scenes: VisScene[];
  help(): BounceResult;
  waveform(sample: Sample): VisStack;
  title(text: string): VisStack;
  overlay(feature: OnsetFeature | NmfFeature): VisStack;
  panel(feature: NmfFeature): VisStack;
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
    (sample: Sample): VisScene;
    help(): BounceResult;
  };
  stack: {
    (): VisStack;
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

declare const nx: {
  (options?: NxOptions): ReplValue<Promise<BounceResult>>;
  help(): BounceResult;
};

declare const visualizeNmf: {
  (options?: VisualizeNmfOptions): ReplValue<Promise<BounceResult>>;
  help(): BounceResult;
};

declare const visualizeNx: {
  (options?: VisualizeNxOptions): ReplValue<Promise<BounceResult>>;
  help(): BounceResult;
};

declare const onsetSlice: {
  (options?: OnsetSliceVisOptions): ReplValue<Promise<BounceResult>>;
  help(): BounceResult;
};

declare const nmf: {
  (options?: NmfVisOptions): ReplValue<Promise<BounceResult>>;
  help(): BounceResult;
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
  build(source?: string | Sample | Promise<Sample>, featureHashOverride?: string): ReplValue<Promise<BounceResult>>;
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
