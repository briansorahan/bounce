// Type declarations for the Bounce TypeScript REPL global functions.
// These are injected into the REPL evaluation context by ReplEvaluator
// and available to users without any import.

interface PlayOptions {
  loop?: boolean;
  offset?: number;
}

interface AnalyzeOptions {
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  frameDelta?: number;
  metric?: number;
}

interface OnsetResult {
  slices: number[];
  count: number;
}

interface NmfOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  seed?: number;
}

interface NmfResult {
  components: number;
  iterations: number;
  converged: boolean;
  bases: number[][];
  activations: number[][];
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
  /** Number of cepstral coefficients per frame. Default: 13 */
  numCoeffs?: number;
  /** Number of Mel filter bands. Default: 40 */
  numBands?: number;
  /** Low frequency bound in Hz. Default: 20 */
  minFreq?: number;
  /** High frequency bound in Hz. Default: 20000 */
  maxFreq?: number;
  /** Analysis window size in samples. Default: 1024 */
  windowSize?: number;
  /** FFT size in samples. Default: 1024 */
  fftSize?: number;
  /** Hop size between frames in samples. Default: 512 */
  hopSize?: number;
  /** Sample rate in Hz. Default: 44100 */
  sampleRate?: number;
}

interface GranularizeOptions {
  /** Duration of each grain in milliseconds. Defaults to 20. */
  grainSize?: number;
  /** Distance between grain start positions in ms. Defaults to grainSize (non-overlapping). */
  hopSize?: number;
  /** Random offset (0–1) applied to grain starts as a fraction of hopSize. Defaults to 0. */
  jitter?: number;
  /** Process from this time offset in ms. Defaults to 0. */
  startTime?: number;
  /** Stop processing at this time offset in ms. Defaults to end of sample. */
  endTime?: number;
  /** Normalize each grain's peak amplitude at playback time. Defaults to false. */
  normalize?: boolean;
  /** Skip grains whose RMS falls below this dBFS level. Defaults to -60. Use -Infinity to disable. */
  silenceThreshold?: number;
}

interface Sample {
  id: number;
  hash: string;
  file_path: string | null;
  sample_rate: number;
  channels: number;
  duration: number;
  data_size: number;
  created_at: string;
}

declare class BounceResult {
  toString(): string;
}

declare class AudioResult extends BounceResult {
  readonly hash: string;
  readonly filePath: string | undefined;
  readonly sampleRate: number;
  readonly duration: number;
}

declare class FeatureResult extends BounceResult {
  readonly sourceHash: string;
  readonly featureHash: string;
  readonly featureType: string;
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

declare class GrainCollection extends BounceResult {
  length(): number;
  forEach(callback: (grain: AudioResult, index: number) => void | Promise<void>): Promise<void>;
  map<T>(callback: (grain: AudioResult, index: number) => T): T[];
  filter(predicate: (grain: AudioResult, index: number) => boolean): GrainCollection;
}

declare const display: {
  (fileOrHash: string): Promise<AudioResult>;
  hide(): void;
  help(): BounceResult;
};
declare const play: {
  (source?: string | AudioResult | Promise<AudioResult>): Promise<AudioResult>;
  help(): BounceResult;
};
declare const stop: {
  (): BounceResult;
  help(): BounceResult;
};
declare const analyze: {
  (source?: AudioResult | Promise<AudioResult> | AnalyzeOptions, options?: AnalyzeOptions): Promise<FeatureResult>;
  help(): BounceResult;
};
declare const analyzeNmf: {
  (source?: AudioResult | Promise<AudioResult> | NmfOptions, options?: NmfOptions): Promise<FeatureResult>;
  help(): BounceResult;
};
declare const slice: {
  (source?: FeatureResult | AudioResult | Promise<AudioResult> | SliceOptions, options?: SliceOptions): Promise<BounceResult>;
  help(): BounceResult;
};
declare const sep: {
  (source?: AudioResult | Promise<AudioResult> | FeatureResult | SepOptions, options?: SepOptions): Promise<BounceResult>;
  help(): BounceResult;
};
declare const nx: {
  (options?: NxOptions): Promise<BounceResult>;
  help(): BounceResult;
};
declare const list: {
  (): Promise<BounceResult>;
  help(): BounceResult;
};
declare const playSlice: {
  (index?: number, source?: FeatureResult | AudioResult | Promise<AudioResult>): Promise<AudioResult>;
  help(): BounceResult;
};
declare const playComponent: {
  (index?: number, source?: FeatureResult | AudioResult | Promise<AudioResult>): Promise<AudioResult>;
  help(): BounceResult;
};
declare const visualizeNmf: {
  (options?: VisualizeNmfOptions): Promise<BounceResult>;
  help(): BounceResult;
};
declare const visualizeNx: {
  (options?: VisualizeNxOptions): Promise<BounceResult>;
  help(): BounceResult;
};
declare const onsetSlice: {
  (options?: OnsetSliceVisOptions): Promise<BounceResult>;
  help(): BounceResult;
};
declare const nmf: {
  (options?: NmfVisOptions): Promise<BounceResult>;
  help(): BounceResult;
};
declare const clearDebug: {
  (): Promise<BounceResult>;
  help(): BounceResult;
};
declare const debug: {
  (limit?: number): Promise<BounceResult>;
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
declare const analyzeMFCC: {
  (sample: AudioResult | Promise<AudioResult>, options?: MFCCOptions): Promise<FeatureResult>;
  help(): BounceResult;
};
declare const granularize: {
  (source?: string | AudioResult | Promise<AudioResult> | GranularizeOptions, options?: GranularizeOptions): Promise<GrainCollection>;
  help(): BounceResult;
};
declare const corpus: {
  help(): BounceResult;
  build(source?: string | AudioResult | Promise<AudioResult>, featureHashOverride?: string): Promise<BounceResult>;
  query(segmentIndex: number, k?: number): Promise<BounceResult>;
  resynthesize(queryIndices: number[]): Promise<BounceResult>;
};

declare const enum FileType {
  File        = "file",
  Directory   = "directory",
  Symlink     = "symlink",
  BlockDevice = "blockDevice",
  CharDevice  = "charDevice",
  FIFO        = "fifo",
  Socket      = "socket",
  Unknown     = "unknown",
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
    (dirPath?: string): LsResultPromise;
    help(): BounceResult;
  };
  la: {
    (dirPath?: string): LsResultPromise;
    help(): BounceResult;
  };
  cd: {
    (dirPath: string): Promise<BounceResult>;
    help(): BounceResult;
  };
  pwd: {
    (): Promise<BounceResult>;
    help(): BounceResult;
  };
  glob: {
    (pattern: string): GlobResultPromise;
    help(): BounceResult;
  };
  walk: {
    (dirPath: string, handler: WalkCatchAll | WalkHandlers): Promise<BounceResult | undefined>;
    help(): BounceResult;
  };
}

declare const fs: FsApi;
