import { RequestType, ResponseError, MessageConnection } from "vscode-jsonrpc";
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

export interface ProjectListEntry extends ProjectRecord {
  sample_count: number;
  feature_count: number;
  command_count: number;
  current: boolean;
}

// ---------------------------------------------------------------------------
// RpcContract interface (retained for use with the generic ServiceClient<T>
// type in callers such as AudioFileService that depend on invoke()).
// ---------------------------------------------------------------------------

export interface StateRpc extends RpcContract {
  storeRawSample: {
    params: { hash: string; filePath: string; sampleRate: number; channels: number; duration: number };
    result: void;
  };
  getSampleByHash: {
    params: { hash: string };
    result: SampleRecord | null;
  };
  getRawMetadata: {
    params: { hash: string };
    result: RawSampleMetadata | null;
  };
  listSamples: {
    params: Record<string, never>;
    result: SampleListRecord[];
  };
  getCwd: {
    params: Record<string, never>;
    result: string;
  };
  getCurrentProject: {
    params: Record<string, never>;
    result: ProjectRecord;
  };
  listProjects: {
    params: Record<string, never>;
    result: ProjectListEntry[];
  };
  loadProject: {
    params: { name: string };
    result: ProjectListEntry;
  };
  removeProject: {
    params: { name: string };
    result: { removedName: string; currentProject: ProjectListEntry };
  };

  /** Set the current working directory. Returns the resolved absolute path. */
  setCwd: {
    params: { cwd: string };
    result: string;
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC RequestType objects — one per method.
// These carry the wire method name and the TypeScript param/result types.
// ---------------------------------------------------------------------------

type E = ResponseError;

export const StateRequest = {
  storeRawSample:   new RequestType<StateRpc["storeRawSample"]["params"],   void,                                               E>("state/storeRawSample"),
  getSampleByHash:  new RequestType<StateRpc["getSampleByHash"]["params"],  SampleRecord | null,                                E>("state/getSampleByHash"),
  getRawMetadata:   new RequestType<StateRpc["getRawMetadata"]["params"],   RawSampleMetadata | null,                           E>("state/getRawMetadata"),
  listSamples:      new RequestType<StateRpc["listSamples"]["params"],      SampleListRecord[],                                 E>("state/listSamples"),
  getCwd:           new RequestType<StateRpc["getCwd"]["params"],           string,                                             E>("state/getCwd"),
  getCurrentProject:new RequestType<StateRpc["getCurrentProject"]["params"],ProjectRecord,                                      E>("state/getCurrentProject"),
  listProjects:     new RequestType<StateRpc["listProjects"]["params"],     ProjectListEntry[],                                 E>("state/listProjects"),
  loadProject:      new RequestType<StateRpc["loadProject"]["params"],      ProjectListEntry,                                   E>("state/loadProject"),
  removeProject:    new RequestType<StateRpc["removeProject"]["params"],    StateRpc["removeProject"]["result"],                E>("state/removeProject"),
  setCwd:           new RequestType<StateRpc["setCwd"]["params"],           string,                                             E>("state/setCwd"),
} as const;

// ---------------------------------------------------------------------------
// StateHandlers — implemented by StateService.
// ---------------------------------------------------------------------------

export interface StateHandlers {
  storeRawSample(params: StateRpc["storeRawSample"]["params"]): Promise<void>;
  getSampleByHash(params: StateRpc["getSampleByHash"]["params"]): Promise<SampleRecord | null>;
  getRawMetadata(params: StateRpc["getRawMetadata"]["params"]): Promise<RawSampleMetadata | null>;
  listSamples(params: StateRpc["listSamples"]["params"]): Promise<SampleListRecord[]>;
  getCwd(params: StateRpc["getCwd"]["params"]): Promise<string>;
  getCurrentProject(params: StateRpc["getCurrentProject"]["params"]): Promise<ProjectRecord>;
  listProjects(params: StateRpc["listProjects"]["params"]): Promise<ProjectListEntry[]>;
  loadProject(params: StateRpc["loadProject"]["params"]): Promise<ProjectListEntry>;
  removeProject(params: StateRpc["removeProject"]["params"]): Promise<StateRpc["removeProject"]["result"]>;
  setCwd(params: StateRpc["setCwd"]["params"]): Promise<string>;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Register all StateService handlers on the given connection.
 * Call `connection.listen()` after this.
 */
export function registerStateHandlers(
  connection: MessageConnection,
  handlers: StateHandlers,
): void {
  for (const [key, reqType] of Object.entries(StateRequest)) {
    const method = key as keyof StateHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

/**
 * Wrap a MessageConnection as a typed StateClient.
 * The returned client has the same `invoke(method, params)` API as
 * `ServiceClient<StateRpc>` so existing callers need no changes.
 */
export function createStateClient(connection: MessageConnection): {
  invoke<K extends keyof StateRpc & string>(
    method: K,
    params: StateRpc[K]["params"],
  ): Promise<StateRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = StateRequest[method as keyof typeof StateRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, StateRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
