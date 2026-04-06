import type { MessageConnection } from "vscode-jsonrpc";
import {
  registerStateHandlers,
  createStateClient,
} from "../../../shared/rpc/state.rpc";
import type {
  StateHandlers,
  StateRpc,
  SampleRecord,
  SampleListRecord,
  RawSampleMetadata,
  ProjectRecord,
  ProjectListEntry,
} from "../../../shared/rpc/state.rpc";
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
 * Usage:
 *   const { client, server } = createInProcessPair();
 *   stateService.listen(server);   // registers JSON-RPC handlers
 *   server.listen();
 *   client.listen();
 *   const stateClient = createStateClient(client);
 */
export class StateService implements StateHandlers {
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

  async getSampleByHash(params: StateRpc["getSampleByHash"]["params"]): Promise<SampleRecord | null> {
    return this.storage.getSampleByHash(params.hash);
  }

  async getRawMetadata(params: StateRpc["getRawMetadata"]["params"]): Promise<RawSampleMetadata | null> {
    return this.storage.getRawMetadata(params.hash);
  }

  async listSamples(_params: Record<string, never>): Promise<SampleListRecord[]> {
    return this.storage.listSamples();
  }

  async getCwd(_params: Record<string, never>): Promise<string> {
    return this.storage.getCwd();
  }

  async setCwd(params: StateRpc["setCwd"]["params"]): Promise<string> {
    this.storage.setCwd(params.cwd);
    return params.cwd;
  }

  async getCurrentProject(_params: Record<string, never>): Promise<ProjectRecord> {
    return this.storage.getCurrentProject();
  }

  async listProjects(_params: Record<string, never>): Promise<ProjectListEntry[]> {
    return this.storage.listProjects();
  }

  async loadProject(params: StateRpc["loadProject"]["params"]): Promise<ProjectListEntry> {
    return this.storage.loadProject(params.name);
  }

  async removeProject(params: StateRpc["removeProject"]["params"]): Promise<StateRpc["removeProject"]["result"]> {
    return this.storage.removeProject(params.name);
  }

  /**
   * Register all handlers on the given JSON-RPC connection.
   * The caller must call `connection.listen()` after this.
   */
  listen(connection: MessageConnection): void {
    registerStateHandlers(connection, this);
  }

  /**
   * Convenience: wire up an in-process client/server pair and return a
   * typed client. Used by services that depend on StateService and need
   * a ServiceClient<StateRpc>-compatible handle.
   */
  asClient(clientConnection: MessageConnection): ReturnType<typeof createStateClient> {
    return createStateClient(clientConnection);
  }

  close(): void {
    this.storage.close();
  }
}
