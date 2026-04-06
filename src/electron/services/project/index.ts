import type { MessageConnection } from "vscode-jsonrpc";
import {
  registerProjectHandlers,
  createProjectClient,
} from "../../../shared/rpc/project.rpc";
import type { ProjectHandlers, ProjectRpc } from "../../../shared/rpc/project.rpc";
import type { ProjectListEntry, ProjectRecord } from "../../../shared/domain-types";
import type { EventBus } from "../../../shared/event-bus";
import type { IProjectQuery } from "../../../shared/query-interfaces";

/**
 * Minimal write interface for ProjectService.
 *
 * ProjectService uses strong-consistency writes (direct storage access)
 * rather than going through the event bus. The event bus receives only
 * informational events so other subscribers can react to project switches.
 */
export interface IProjectStorage {
  loadProject(name: string): ProjectListEntry;
  removeProject(name: string): { removedName: string; currentProject: ProjectListEntry };
  getCurrentProject(): ProjectRecord;
}

/**
 * ProjectService — handles project lifecycle operations.
 *
 * Writes are synchronous (via IProjectStorage) to ensure strong consistency:
 * the current-project context affects ALL subsequent query scoping, so we
 * cannot tolerate eventual consistency here.
 *
 * Informational ProjectLoaded / ProjectRemoved events are still emitted on
 * the bus so that other services can react (e.g. clear caches).
 * PersistenceService MUST NOT handle these events to avoid double-writes.
 */
export class ProjectService implements ProjectHandlers {
  constructor(
    private storage: IProjectStorage,
    private bus: EventBus,
    private query: IProjectQuery,
  ) {}

  async loadProject(params: { name: string }): Promise<ProjectListEntry> {
    const result = this.storage.loadProject(params.name);
    this.bus.emit({ type: "ProjectLoaded", name: params.name });
    return result;
  }

  async removeProject(params: { name: string }): Promise<ProjectRpc["removeProject"]["result"]> {
    const result = this.storage.removeProject(params.name);
    this.bus.emit({ type: "ProjectRemoved", name: params.name });
    return result;
  }

  listen(connection: MessageConnection): void {
    registerProjectHandlers(connection, this);
  }

  asClient(clientConnection: MessageConnection): ReturnType<typeof createProjectClient> {
    return createProjectClient(clientConnection);
  }
}
