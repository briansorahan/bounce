import { RequestType, ResponseError, type MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";

// ---------------------------------------------------------------------------
// Option / result types
// ---------------------------------------------------------------------------

export interface GranularizeOptions {
  grainSize?: number;        // ms, default 20
  hopSize?: number;          // ms, default = grainSize
  startTime?: number;        // ms into source, default 0
  endTime?: number;          // ms into source, default = duration * 1000
  jitter?: number;           // 0–1 timing randomness, default 0
  normalize?: boolean;
  silenceThreshold?: number; // dBFS, default -60; use -Infinity or -100 to disable
}

export interface GranularizeResult {
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

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export interface GranularizeRpc extends RpcContract {
  granularize: {
    params: {
      sourceHash: string;    // hash of the source sample — used for derived hash computation
      audioData: number[];   // decoded PCM, float32 range [-1, 1]
      sampleRate: number;
      channels: number;
      duration: number;      // seconds — used for endTime default
      options: GranularizeOptions;
    };
    result: GranularizeResult;
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC RequestType objects
// ---------------------------------------------------------------------------

type E = ResponseError;

export const GranularizeRequest = {
  granularize: new RequestType<GranularizeRpc["granularize"]["params"], GranularizeResult, E>("granularize/granularize"),
} as const;

// ---------------------------------------------------------------------------
// Handlers interface
// ---------------------------------------------------------------------------

export interface GranularizeHandlers {
  granularize(params: GranularizeRpc["granularize"]["params"]): Promise<GranularizeResult>;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function registerGranularizeHandlers(
  connection: MessageConnection,
  handlers: GranularizeHandlers,
): void {
  for (const [key, reqType] of Object.entries(GranularizeRequest)) {
    const method = key as keyof GranularizeHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

export function createGranularizeClient(connection: MessageConnection): {
  invoke<K extends keyof GranularizeRpc & string>(
    method: K,
    params: GranularizeRpc[K]["params"],
  ): Promise<GranularizeRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = GranularizeRequest[method as keyof typeof GranularizeRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, GranularizeRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
