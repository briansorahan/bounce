import type { ServiceHandlers, ServiceClient } from "../../../shared/rpc/types";
import { createInProcessClient } from "../../../shared/rpc/types";
import type { StateRpc } from "../../../shared/rpc/state.rpc";
import type { IStateStorage } from "./storage";

/**
 * StateService — single source of truth for all durable application state.
 *
 * Accepts any IStateStorage implementation so that:
 *   - Production code uses DatabaseStateStorage (SQLite + settings file).
 *   - Workflow tests use InMemoryStateStorage (no native deps, runs under tsx).
 *
 * No Electron imports here. StateService is pure business logic.
 *
 * Constructor dependency: IStateStorage (leaf node — injected by caller).
 */
export class StateService implements ServiceHandlers<StateRpc> {
  constructor(private storage: IStateStorage) {}

  async storeRawSample(params: StateRpc["storeRawSample"]["params"]): Promise<void> {
    this.storage.storeRawSample(
      params.hash,
      params.filePath,
      params.sampleRate,
      params.channels,
      params.duration,
    );
  }

  async getSampleByHash(params: StateRpc["getSampleByHash"]["params"]) {
    return this.storage.getSampleByHash(params.hash);
  }

  async getRawMetadata(params: StateRpc["getRawMetadata"]["params"]) {
    return this.storage.getRawMetadata(params.hash);
  }

  async listSamples(_params: Record<string, never>) {
    return this.storage.listSamples();
  }

  async getCwd(_params: Record<string, never>) {
    return this.storage.getCwd();
  }

  async getCurrentProject(_params: Record<string, never>) {
    return this.storage.getCurrentProject();
  }

  /** Expose a type-safe ServiceClient backed by direct in-process calls. */
  asClient(): ServiceClient<StateRpc> {
    return createInProcessClient<StateRpc>(this);
  }

  close(): void {
    this.storage.close();
  }
}
