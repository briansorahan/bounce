import { RequestType, ResponseError, type MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";

// ---------------------------------------------------------------------------
// Option / result types
// ---------------------------------------------------------------------------

export interface GrainsOptions {
  grainSize?: number;        // ms, default 20
  hopSize?: number;          // ms, default = grainSize
  startTime?: number;        // ms into source, default 0
  endTime?: number;          // ms into source, default = duration * 1000
  jitter?: number;           // 0–1 timing randomness, default 0
  normalize?: boolean;
  silenceThreshold?: number; // dBFS, default -Infinity (disabled)
}

export interface GrainsResult {
  /** Per-grain derived sample hashes. null = silent grain (below threshold). */
  grainHashes: Array<string | null>;
  /** Deterministic SHA-256 hash of the feature (grain positions + options). */
  featureHash: string;
  sampleRate: number;
  /** Duration of one grain in seconds. */
  grainDuration: number;
  /** Grain start positions in samples — needed by storage layer for storeFeature(). */
  grainStartPositions: number[];
}

export interface BounceGrainsOptions {
  density?: number;       // grains/sec, default 20
  pitch?: number;         // playback rate, default 1.0 (range 0.25–4.0)
  envelope?: number;      // 0=Hann, 1=Hamming, 2=Triangle, 3=Tukey, default 0
  duration?: number;      // output duration in seconds, default = input duration
  normalize?: boolean;    // peak-normalize output to prevent clipping, default true
}

export interface BounceGrainsResult {
  outputData: number[];       // resynthesized PCM
  outputHash: string;         // SHA-256 of output audio bytes
  sampleRate: number;
  duration: number;           // output duration in seconds
  channels: number;           // always 1 (mono output)
  grainCount: number;         // number of grains placed
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export interface GrainsRpc extends RpcContract {
  grains: {
    params: {
      sourceHash: string;    // hash of the source sample — used for derived hash computation
      audioData: number[];   // decoded PCM, float32 range [-1, 1]
      sampleRate: number;
      channels: number;
      duration: number;      // seconds — used for endTime default
      options: GrainsOptions;
    };
    result: GrainsResult;
  };
  bounceGrains: {
    params: {
      sourceHash: string;
      audioData: number[];
      sampleRate: number;
      channels: number;
      duration: number;           // source duration in seconds
      grainPositions: number[];   // source sample offsets (non-null only)
      grainSizeSamples: number;
      options: BounceGrainsOptions;
    };
    result: BounceGrainsResult;
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC RequestType objects
// ---------------------------------------------------------------------------

type E = ResponseError;

export const GrainsRequest = {
  grains: new RequestType<GrainsRpc["grains"]["params"], GrainsResult, E>("grains/grains"),
  bounceGrains: new RequestType<GrainsRpc["bounceGrains"]["params"], BounceGrainsResult, E>("grains/bounceGrains"),
} as const;

// ---------------------------------------------------------------------------
// Handlers interface
// ---------------------------------------------------------------------------

export interface GrainsHandlers {
  grains(params: GrainsRpc["grains"]["params"]): Promise<GrainsResult>;
  bounceGrains(params: GrainsRpc["bounceGrains"]["params"]): Promise<BounceGrainsResult>;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function registerGrainsHandlers(
  connection: MessageConnection,
  handlers: GrainsHandlers,
): void {
  for (const [key, reqType] of Object.entries(GrainsRequest)) {
    const method = key as keyof GrainsHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

export function createGrainsClient(connection: MessageConnection): {
  invoke<K extends keyof GrainsRpc & string>(
    method: K,
    params: GrainsRpc[K]["params"],
  ): Promise<GrainsRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = GrainsRequest[method as keyof typeof GrainsRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, GrainsRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
