import { ipcMain } from "electron";
import { BounceError } from "../../shared/bounce-error.js";
import type { HandlerDeps } from "./register";

export function registerHistoryHandlers(deps: HandlerDeps): void {
  ipcMain.handle("save-command", async (_event, command: string) => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("HISTORY_DB_NOT_READY", "Database not initialized");
      }
      deps.dbManager.addCommand(command);
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to save command to database:", error);
      throw new BounceError("HISTORY_SAVE_FAILED", `Failed to save command: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("get-command-history", async (_event, limit?: number) => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("HISTORY_DB_NOT_READY", "Database not initialized");
      }
      return deps.dbManager.getCommandHistory(limit || 1000);
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to load command history:", error);
      throw new BounceError("HISTORY_LOAD_FAILED", `Failed to load command history: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("clear-command-history", async () => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("HISTORY_DB_NOT_READY", "Database not initialized");
      }
      deps.dbManager.clearCommandHistory();
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to clear command history:", error);
      throw new BounceError("HISTORY_CLEAR_FAILED", `Failed to clear command history: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("dedupe-command-history", async () => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("HISTORY_DB_NOT_READY", "Database not initialized");
      }
      return deps.dbManager.dedupeCommandHistory();
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to dedupe command history:", error);
      throw new BounceError("HISTORY_DEDUPE_FAILED", `Failed to dedupe command history: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle(
    "debug-log",
    async (
      _event,
      level: string,
      message: string,
      data?: Record<string, unknown>,
    ) => {
      try {
        if (deps.dbManager) {
          deps.dbManager.addDebugLog(level, message, data);
        }
      } catch (error) {
        console.warn("Failed to save debug log:", error);
      }
    },
  );

  ipcMain.handle("get-debug-logs", async (_event, limit?: number) => {
    try {
      return deps.dbManager ? deps.dbManager.getDebugLogs(limit || 100) : [];
    } catch (error) {
      console.warn("Failed to get debug logs:", error);
      return [];
    }
  });

  ipcMain.handle("clear-debug-logs", async () => {
    try {
      if (deps.dbManager) {
        deps.dbManager.clearDebugLogs();
      }
    } catch (error) {
      console.warn("Failed to clear debug logs:", error);
    }
  });
}
