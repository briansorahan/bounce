import type { RpcContract } from "./types";

// ---------------------------------------------------------------------------
// Option types (mirrors src/electron/ipc-types.ts — kept separate so this
// file has no Electron dependencies)
// ---------------------------------------------------------------------------

export interface OnsetSliceOptions {
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  frameDelta?: number;
}

export interface AmpSliceOptions {
  onThreshold?: number;
  offThreshold?: number;
  minSliceLength?: number;
}

export interface NoveltySliceOptions {
  threshold?: number;
  kernelSize?: number;
  filterSize?: number;
}

export interface TransientSliceOptions {
  order?: number;
  blockSize?: number;
  padSize?: number;
  skew?: number;
  threshFwd?: number;
  threshBack?: number;
  windowSize?: number;
  clumpLength?: number;
}

export interface BufNMFOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
}

export interface MFCCOptions {
  numCoeffs?: number;
  numBands?: number;
  freqRange?: [number, number];
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface OnsetSliceResult {
  /** Frame positions of detected onset boundaries. */
  onsets: number[];
}

export interface BufNMFResult {
  /** Per-component audio data as flat Float32 arrays. */
  components: number[][];
  /** Activation matrix (rows = components, cols = frames). */
  activations: number[][];
}

export interface MFCCResult {
  /** numCoeffs × numFrames matrix of coefficients. */
  coefficients: number[][];
}

// ---------------------------------------------------------------------------
// Contract
// AnalysisService runs in a dedicated utility process to avoid blocking the
// main process during CPU-intensive FluCoMa operations. All methods receive
// raw PCM data and return pure analysis results — no database access.
// ---------------------------------------------------------------------------

export interface AnalysisRpc extends RpcContract {
  onsetSlice: {
    params: {
      audioData: number[];
      options?: OnsetSliceOptions;
    };
    result: OnsetSliceResult;
  };

  ampSlice: {
    params: {
      audioData: number[];
      options?: AmpSliceOptions;
    };
    result: OnsetSliceResult;
  };

  noveltySlice: {
    params: {
      audioData: number[];
      options?: NoveltySliceOptions;
    };
    result: OnsetSliceResult;
  };

  transientSlice: {
    params: {
      audioData: number[];
      options?: TransientSliceOptions;
    };
    result: OnsetSliceResult;
  };

  bufNMF: {
    params: {
      audioData: number[];
      sampleRate: number;
      options?: BufNMFOptions;
    };
    result: BufNMFResult;
  };

  mfcc: {
    params: {
      audioData: number[];
      options?: MFCCOptions;
    };
    result: MFCCResult;
  };
}
