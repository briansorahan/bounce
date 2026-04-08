import { RequestType, ResponseError, MessageConnection } from "vscode-jsonrpc";
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

export interface BufNMFCrossOptions {
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  timeSparsity?: number;
  polyphony?: number;
  continuity?: number;
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
  /** Number of components decomposed. */
  components: number;
  /** Spectral bases: one array per component (length = fftSize/2 + 1). */
  bases: number[][];
  /** Activation envelopes: one array per component. */
  activations: number[][];
  /** Number of iterations the algorithm actually ran. */
  iterations: number;
  /** Whether the algorithm converged before hitting the iteration limit. */
  converged: boolean;
}

export interface BufNMFCrossResult {
  /** Number of components (inherited from source NMF). */
  components: number;
  /** Spectral bases adapted to the target audio. */
  bases: number[][];
  /** Activation envelopes for the target audio. */
  activations: number[][];
  /** Number of iterations run. */
  iterations: number;
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

  resynthesize: {
    params: {
      audioData: number[];
      sampleRate: number;
      bases: number[][];
      activations: number[][];
      componentIndex: number;
    };
    result: { componentAudio: number[] };
  };

  bufNMFCross: {
    params: {
      targetAudioData: number[];
      sampleRate: number;
      sourceBases: number[][];
      sourceActivations: number[][];
      options?: BufNMFCrossOptions;
    };
    result: BufNMFCrossResult;
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC RequestType objects
// ---------------------------------------------------------------------------

type E = ResponseError;

export const AnalysisRequest = {
  onsetSlice:    new RequestType<AnalysisRpc["onsetSlice"]["params"],    OnsetSliceResult,               E>("analysis/onsetSlice"),
  ampSlice:      new RequestType<AnalysisRpc["ampSlice"]["params"],      OnsetSliceResult,               E>("analysis/ampSlice"),
  noveltySlice:  new RequestType<AnalysisRpc["noveltySlice"]["params"],  OnsetSliceResult,               E>("analysis/noveltySlice"),
  transientSlice:new RequestType<AnalysisRpc["transientSlice"]["params"],OnsetSliceResult,               E>("analysis/transientSlice"),
  bufNMF:        new RequestType<AnalysisRpc["bufNMF"]["params"],        BufNMFResult,                   E>("analysis/bufNMF"),
  mfcc:          new RequestType<AnalysisRpc["mfcc"]["params"],          MFCCResult,                     E>("analysis/mfcc"),
  resynthesize:  new RequestType<AnalysisRpc["resynthesize"]["params"],  { componentAudio: number[] },   E>("analysis/resynthesize"),
  bufNMFCross:   new RequestType<AnalysisRpc["bufNMFCross"]["params"],   BufNMFCrossResult,              E>("analysis/bufNMFCross"),
} as const;

// ---------------------------------------------------------------------------
// AnalysisHandlers — implemented by AnalysisService.
// ---------------------------------------------------------------------------

export interface AnalysisHandlers {
  onsetSlice(params:     AnalysisRpc["onsetSlice"]["params"]):     Promise<OnsetSliceResult>;
  ampSlice(params:       AnalysisRpc["ampSlice"]["params"]):       Promise<OnsetSliceResult>;
  noveltySlice(params:   AnalysisRpc["noveltySlice"]["params"]):   Promise<OnsetSliceResult>;
  transientSlice(params: AnalysisRpc["transientSlice"]["params"]): Promise<OnsetSliceResult>;
  bufNMF(params:         AnalysisRpc["bufNMF"]["params"]):         Promise<BufNMFResult>;
  mfcc(params:           AnalysisRpc["mfcc"]["params"]):           Promise<MFCCResult>;
  resynthesize(params:   AnalysisRpc["resynthesize"]["params"]):   Promise<{ componentAudio: number[] }>;
  bufNMFCross(params:    AnalysisRpc["bufNMFCross"]["params"]):    Promise<BufNMFCrossResult>;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Register all AnalysisService handlers on the given connection.
 * Call `connection.listen()` after this.
 */
export function registerAnalysisHandlers(
  connection: MessageConnection,
  handlers: AnalysisHandlers,
): void {
  for (const [key, reqType] of Object.entries(AnalysisRequest)) {
    const method = key as keyof AnalysisHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

/**
 * Wrap a MessageConnection as a typed AnalysisClient.
 */
export function createAnalysisClient(connection: MessageConnection): {
  invoke<K extends keyof AnalysisRpc & string>(
    method: K,
    params: AnalysisRpc[K]["params"],
  ): Promise<AnalysisRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = AnalysisRequest[method as keyof typeof AnalysisRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, AnalysisRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
