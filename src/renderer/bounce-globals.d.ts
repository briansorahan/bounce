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

declare function display(fileOrHash: string): Promise<void>;
declare function play(fileOrHash?: string): Promise<void>;
declare function stop(): void;
declare function analyze(options?: AnalyzeOptions): Promise<OnsetResult>;
declare function analyzeNmf(options?: NmfOptions): Promise<NmfResult>;
declare function slice(options?: SliceOptions): Promise<void>;
declare function sep(options?: SepOptions): Promise<void>;
declare function nx(options?: NxOptions): Promise<void>;
declare function list(): Promise<Sample[]>;
declare function playSlice(index?: number): Promise<void>;
declare function playComponent(index?: number): Promise<void>;
declare function visualizeNmf(options?: VisualizeNmfOptions): void;
declare function visualizeNx(options?: VisualizeNxOptions): void;
declare function onsetSlice(options?: OnsetSliceVisOptions): void;
declare function nmf(options?: NmfVisOptions): void;
declare function clearDebug(): Promise<void>;
declare function debug(limit?: number): Promise<DebugLogEntry[]>;
declare function help(): void;
declare function clear(): void;
