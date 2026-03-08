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

declare function display(fileOrHash: string): Promise<AudioResult>;
declare function play(source?: string | AudioResult): Promise<AudioResult>;
declare function stop(): BounceResult;
declare function analyze(source?: AudioResult | AnalyzeOptions, options?: AnalyzeOptions): Promise<FeatureResult>;
declare function analyzeNmf(source?: AudioResult | NmfOptions, options?: NmfOptions): Promise<FeatureResult>;
declare function slice(source?: FeatureResult | AudioResult | SliceOptions, options?: SliceOptions): Promise<BounceResult>;
declare function sep(source?: AudioResult | FeatureResult | SepOptions, options?: SepOptions): Promise<BounceResult>;
declare function nx(options?: NxOptions): Promise<BounceResult>;
declare function list(): Promise<BounceResult>;
declare function playSlice(index?: number, source?: FeatureResult | AudioResult): Promise<AudioResult>;
declare function playComponent(index?: number, source?: FeatureResult | AudioResult): Promise<AudioResult>;
declare function visualizeNmf(options?: VisualizeNmfOptions): Promise<BounceResult>;
declare function visualizeNx(options?: VisualizeNxOptions): Promise<BounceResult>;
declare function onsetSlice(options?: OnsetSliceVisOptions): Promise<BounceResult>;
declare function nmf(options?: NmfVisOptions): Promise<BounceResult>;
declare function clearDebug(): Promise<BounceResult>;
declare function debug(limit?: number): Promise<BounceResult>;
declare function help(): BounceResult;
declare function clear(): void;
declare function analyzeMFCC(source?: AudioResult | MFCCOptions, options?: MFCCOptions): Promise<number[][]>;
