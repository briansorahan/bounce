import { ipcMain } from "electron";
import { ProjectListRecord } from "../database";
import { BounceError } from "../../shared/bounce-error.js";
import type { HandlerDeps } from "./register";

function toProjectData(
  deps: HandlerDeps,
  project: ProjectListRecord,
): ProjectListRecord & { current: boolean } {
  return {
    ...project,
    current: project.name === deps.dbManager?.getCurrentProjectName(),
  };
}

export function registerProjectHandlers(deps: HandlerDeps): void {
  const { dbManager, settingsStore } = deps;

  ipcMain.handle("get-current-project", async () => {
    try {
      if (!dbManager) {
        throw new BounceError("PROJECT_DB_NOT_READY", "Database not initialized");
      }
      return toProjectData(deps, dbManager.getCurrentProject());
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to get current project:", error);
      throw new BounceError("PROJECT_LOAD_FAILED", `Failed to get current project: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("list-projects", async () => {
    try {
      if (!dbManager) {
        throw new BounceError("PROJECT_DB_NOT_READY", "Database not initialized");
      }
      return dbManager.listProjects().map((p) => toProjectData(deps, p));
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to list projects:", error);
      throw new BounceError("PROJECT_LIST_FAILED", `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("load-project", async (_event, name: string) => {
    try {
      if (!dbManager || !settingsStore) {
        throw new BounceError("PROJECT_NOT_INITIALIZED", "Project services not initialized");
      }
      const project = dbManager.loadOrCreateProject(name);
      settingsStore.setCurrentProjectName(project.name);
      return toProjectData(deps, project);
    } catch (error) {
      if (error instanceof BounceError) throw error;
      throw new BounceError("PROJECT_LOAD_FAILED", `Failed to load project: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("remove-project", async (_event, name: string) => {
    try {
      if (!dbManager || !settingsStore) {
        throw new BounceError("PROJECT_NOT_INITIALIZED", "Project services not initialized");
      }
      const currentProject = dbManager.removeProject(name);
      settingsStore.setCurrentProjectName(currentProject.name);
      return {
        removedName: name,
        currentProject: toProjectData(deps, currentProject),
      };
    } catch (error) {
      if (error instanceof BounceError) throw error;
      throw new BounceError("PROJECT_REMOVE_FAILED", `Failed to remove project: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
