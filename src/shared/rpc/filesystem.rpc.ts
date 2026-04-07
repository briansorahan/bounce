import { RequestType, ResponseError, MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export type FileType =
  | "file"
  | "directory"
  | "symlink"
  | "blockDevice"
  | "charDevice"
  | "fifo"
  | "socket"
  | "unknown";

export interface FsEntry {
  name: string;
  path: string;
  type: FileType;
  isAudio: boolean;
}

export interface WalkEntry {
  path: string;
  type: FileType;
}

export interface LsResult {
  entries: FsEntry[];
  total: number;
  truncated: boolean;
}

export interface WalkResult {
  entries: WalkEntry[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// RpcContract interface
// ---------------------------------------------------------------------------

export interface FilesystemRpc extends RpcContract {
  pwd: {
    params: Record<string, never>;
    result: string;
  };
  cd: {
    params: { dirPath: string };
    result: string;
  };
  ls: {
    params: { dirPath?: string; showHidden?: boolean };
    result: LsResult;
  };
  glob: {
    params: { pattern: string };
    result: string[];
  };
  walk: {
    params: { dirPath: string };
    result: WalkResult;
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC RequestType objects
// ---------------------------------------------------------------------------

type E = ResponseError;

export const FilesystemRequest = {
  pwd:  new RequestType<FilesystemRpc["pwd"]["params"],  string,     E>("fs/pwd"),
  cd:   new RequestType<FilesystemRpc["cd"]["params"],   string,     E>("fs/cd"),
  ls:   new RequestType<FilesystemRpc["ls"]["params"],   LsResult,   E>("fs/ls"),
  glob: new RequestType<FilesystemRpc["glob"]["params"], string[],   E>("fs/glob"),
  walk: new RequestType<FilesystemRpc["walk"]["params"], WalkResult, E>("fs/walk"),
} as const;

// ---------------------------------------------------------------------------
// FilesystemHandlers — implemented by FilesystemService.
// ---------------------------------------------------------------------------

export interface FilesystemHandlers {
  pwd(params: FilesystemRpc["pwd"]["params"]): Promise<string>;
  cd(params: FilesystemRpc["cd"]["params"]): Promise<string>;
  ls(params: FilesystemRpc["ls"]["params"]): Promise<LsResult>;
  glob(params: FilesystemRpc["glob"]["params"]): Promise<string[]>;
  walk(params: FilesystemRpc["walk"]["params"]): Promise<WalkResult>;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function registerFilesystemHandlers(
  connection: MessageConnection,
  handlers: FilesystemHandlers,
): void {
  for (const [key, reqType] of Object.entries(FilesystemRequest)) {
    const method = key as keyof FilesystemHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

export function createFilesystemClient(connection: MessageConnection): {
  invoke<K extends keyof FilesystemRpc & string>(
    method: K,
    params: FilesystemRpc[K]["params"],
  ): Promise<FilesystemRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = FilesystemRequest[method as keyof typeof FilesystemRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, FilesystemRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
