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
  silenceThreshold?: number; // dBFS, default -60; use -Infinity or -100 to disable
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
}

// ---------------------------------------------------------------------------
// JSON-RPC RequestType objects
// ---------------------------------------------------------------------------

type E = ResponseError;

export const GrainsRequest = {
  grains: new RequestType<GrainsRpc["grains"]["params"], GrainsResult, E>("grains/grains"),
} as const;

// ---------------------------------------------------------------------------
// Handlers interface
// ---------------------------------------------------------------------------

export interface GrainsHandlers {
  grains(params: GrainsRpc["grains"]["params"]): Promise<GrainsResult>;
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
