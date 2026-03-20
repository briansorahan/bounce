import { ipcMain } from "electron";
import { ProjectListRecord } from "../database";
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
        return null;
      }
      return toProjectData(deps, dbManager.getCurrentProject());
    } catch (error) {
      console.error("Failed to get current project:", error);
      return null;
    }
  });

  ipcMain.handle("list-projects", async () => {
    try {
      if (!dbManager) {
        return [];
      }
      return dbManager.listProjects().map((p) => toProjectData(deps, p));
    } catch (error) {
      console.error("Failed to list projects:", error);
      return [];
    }
  });

  ipcMain.handle("load-project", async (_event, name: string) => {
    try {
      if (!dbManager || !settingsStore) {
        throw new Error("Project services not initialized");
      }
      const project = dbManager.loadOrCreateProject(name);
      settingsStore.setCurrentProjectName(project.name);
      return toProjectData(deps, project);
    } catch (error) {
      throw new Error(
        `Failed to load project: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  ipcMain.handle("remove-project", async (_event, name: string) => {
    try {
      if (!dbManager || !settingsStore) {
        throw new Error("Project services not initialized");
      }
      const currentProject = dbManager.removeProject(name);
      settingsStore.setCurrentProjectName(currentProject.name);
      return {
        removedName: name,
        currentProject: toProjectData(deps, currentProject),
      };
    } catch (error) {
      throw new Error(
        `Failed to remove project: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}
