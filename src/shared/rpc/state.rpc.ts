import type { RpcContract } from "./types";

// ---------------------------------------------------------------------------
// Data shapes
// These are pure data types — no Electron imports — so they can be imported
// by any layer (shared, renderer, tests) without pulling in Electron.
// ---------------------------------------------------------------------------

export type SampleType = "raw" | "derived" | "recorded" | "freesound";

export interface SampleRecord {
  id: number;
  hash: string;
  sample_type: SampleType;
  sample_rate: number;
  channels: number;
  duration: number;
}

export interface SampleListRecord {
  id: number;
  hash: string;
  sample_type: SampleType;
  display_name: string | null;
  sample_rate: number;
  channels: number;
  duration: number;
  created_at: string;
}

export interface RawSampleMetadata {
  sample_id: number;
  file_path: string;
}

export interface ProjectRecord {
  id: number;
  name: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Contract
// StateService is the single source of truth for all durable application
// state. No other service reads from or writes to SQLite directly — all
// persistence goes through this contract.
// ---------------------------------------------------------------------------

export interface StateRpc extends RpcContract {
  /** Persist a raw (file-backed) sample record. Idempotent on hash. */
  storeRawSample: {
    params: {
      hash: string;
      filePath: string;
      sampleRate: number;
      channels: number;
      duration: number;
    };
    result: void;
  };

  /** Look up a sample by its full SHA-256 hash. */
  getSampleByHash: {
    params: { hash: string };
    result: SampleRecord | null;
  };

  /** Look up the filesystem metadata for a raw sample. */
  getRawMetadata: {
    params: { hash: string };
    result: RawSampleMetadata | null;
  };

  /** List all samples for the current project. */
  listSamples: {
    params: Record<string, never>;
    result: SampleListRecord[];
  };

  /** Current working directory for relative path resolution. */
  getCwd: {
    params: Record<string, never>;
    result: string;
  };

  /** The currently active project. */
  getCurrentProject: {
    params: Record<string, never>;
    result: ProjectRecord;
  };
}
