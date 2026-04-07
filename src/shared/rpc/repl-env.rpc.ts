import { RequestType, ResponseError, type MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";
import type { ReplEnvEntry } from "../domain-types";

export interface ReplEnvRpc extends RpcContract {
  saveReplEnv: {
    params: { entries: ReplEnvEntry[] };
    result: void;
  };
  getReplEnv: {
    params: Record<string, never>;
    result: ReplEnvEntry[];
  };
}

type E = ResponseError;

export const ReplEnvRequest = {
  saveReplEnv: new RequestType<ReplEnvRpc["saveReplEnv"]["params"], void,          E>("replEnv/saveReplEnv"),
  getReplEnv:  new RequestType<ReplEnvRpc["getReplEnv"]["params"],  ReplEnvEntry[], E>("replEnv/getReplEnv"),
} as const;

export interface ReplEnvHandlers {
  saveReplEnv(params: ReplEnvRpc["saveReplEnv"]["params"]): Promise<void>;
  getReplEnv(params: ReplEnvRpc["getReplEnv"]["params"]): Promise<ReplEnvEntry[]>;
}

export function registerReplEnvHandlers(
  connection: MessageConnection,
  handlers: ReplEnvHandlers,
): void {
  for (const [key, reqType] of Object.entries(ReplEnvRequest)) {
    const method = key as keyof ReplEnvHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

export function createReplEnvClient(connection: MessageConnection): {
  invoke<K extends keyof ReplEnvRpc & string>(
    method: K,
    params: ReplEnvRpc[K]["params"],
  ): Promise<ReplEnvRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = ReplEnvRequest[method as keyof typeof ReplEnvRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, ReplEnvRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
