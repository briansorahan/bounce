import { RequestType, ResponseError, MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";
import type { SampleListRecord } from "../domain-types";

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export interface ReadAudioFileResult {
  /** Float32 PCM channel data as a plain number array for IPC serialisation. */
  channelData: number[];
  sampleRate: number;
  duration: number;
  /** SHA-256 hex digest of the PCM data. */
  hash: string;
  /** Resolved filesystem path, if the input was a file path. */
  filePath?: string;
}

// ---------------------------------------------------------------------------
// RpcContract interface (retained for the generic ServiceClient<T> pattern).
// ---------------------------------------------------------------------------

export interface AudioFileRpc extends RpcContract {
  readAudioFile: {
    params: { filePathOrHash: string };
    result: ReadAudioFileResult;
  };
  listSamples: {
    params: Record<string, never>;
    result: SampleListRecord[];
  };
  storeRecording: {
    params: { name: string; pcm: number[]; sampleRate: number; channels: number; duration: number; overwrite: boolean };
    result: { status: "ok" | "exists"; hash?: string; id?: number };
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC RequestType objects
// ---------------------------------------------------------------------------

type E = ResponseError;

export const AudioFileRequest = {
  readAudioFile:   new RequestType<AudioFileRpc["readAudioFile"]["params"],   ReadAudioFileResult,  E>("audioFile/readAudioFile"),
  listSamples:     new RequestType<AudioFileRpc["listSamples"]["params"],     SampleListRecord[],  E>("audioFile/listSamples"),
  storeRecording:  new RequestType<AudioFileRpc["storeRecording"]["params"],  { status: "ok" | "exists"; hash?: string; id?: number }, E>("audioFile/storeRecording"),
} as const;

// ---------------------------------------------------------------------------
// AudioFileHandlers — implemented by AudioFileService.
// ---------------------------------------------------------------------------

export interface AudioFileHandlers {
  readAudioFile(params: AudioFileRpc["readAudioFile"]["params"]): Promise<ReadAudioFileResult>;
  listSamples(params: AudioFileRpc["listSamples"]["params"]): Promise<SampleListRecord[]>;
  storeRecording(params: AudioFileRpc["storeRecording"]["params"]): Promise<{ status: "ok" | "exists"; hash?: string; id?: number }>;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Register all AudioFileService handlers on the given connection.
 * Call `connection.listen()` after this.
 */
export function registerAudioFileHandlers(
  connection: MessageConnection,
  handlers: AudioFileHandlers,
): void {
  for (const [key, reqType] of Object.entries(AudioFileRequest)) {
    const method = key as keyof AudioFileHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

/**
 * Wrap a MessageConnection as a typed AudioFileClient.
 */
export function createAudioFileClient(connection: MessageConnection): {
  invoke<K extends keyof AudioFileRpc & string>(
    method: K,
    params: AudioFileRpc[K]["params"],
  ): Promise<AudioFileRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = AudioFileRequest[method as keyof typeof AudioFileRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, AudioFileRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
