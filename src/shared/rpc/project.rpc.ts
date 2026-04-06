import { RequestType, ResponseError, type MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";
import type { ProjectListEntry } from "../domain-types";

export interface ProjectRpc extends RpcContract {
  loadProject: {
    params: { name: string };
    result: ProjectListEntry;
  };
  removeProject: {
    params: { name: string };
    result: { removedName: string; currentProject: ProjectListEntry };
  };
}

type E = ResponseError;

export const ProjectRequest = {
  loadProject:   new RequestType<ProjectRpc["loadProject"]["params"],   ProjectListEntry,                           E>("project/loadProject"),
  removeProject: new RequestType<ProjectRpc["removeProject"]["params"], ProjectRpc["removeProject"]["result"],     E>("project/removeProject"),
} as const;

export interface ProjectHandlers {
  loadProject(params: ProjectRpc["loadProject"]["params"]): Promise<ProjectListEntry>;
  removeProject(params: ProjectRpc["removeProject"]["params"]): Promise<ProjectRpc["removeProject"]["result"]>;
}

export function registerProjectHandlers(
  connection: MessageConnection,
  handlers: ProjectHandlers,
): void {
  for (const [key, reqType] of Object.entries(ProjectRequest)) {
    const method = key as keyof ProjectHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

export function createProjectClient(connection: MessageConnection): {
  invoke<K extends keyof ProjectRpc & string>(
    method: K,
    params: ProjectRpc[K]["params"],
  ): Promise<ProjectRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = ProjectRequest[method as keyof typeof ProjectRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, ProjectRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
