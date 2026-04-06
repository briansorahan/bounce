import type { RpcContract } from "./types";
import type { SampleListRecord } from "./state.rpc";

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
// Contract
// AudioFileService decodes audio files, computes hashes, and stores samples
// via StateService. It never touches SQLite directly.
// ---------------------------------------------------------------------------

export interface AudioFileRpc extends RpcContract {
  /**
   * Decode an audio file and store it in the sample database.
   * `filePathOrHash` may be:
   *   - An absolute or relative filesystem path to an audio file.
   *   - A SHA-256 hex prefix (8+ chars) for a previously stored sample.
   */
  readAudioFile: {
    params: { filePathOrHash: string };
    result: ReadAudioFileResult;
  };

  /** List all samples for the current project (proxied from StateService). */
  listSamples: {
    params: Record<string, never>;
    result: SampleListRecord[];
  };
}
