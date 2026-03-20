import { ipcMain } from "electron";
import type { HandlerDeps } from "./register";

export function registerHistoryHandlers(deps: HandlerDeps): void {
  const { dbManager } = deps;

  ipcMain.handle("save-command", async (_event, command: string) => {
    try {
      if (dbManager) {
        dbManager.addCommand(command);
      }
    } catch (error) {
      console.error("Failed to save command to database:", error);
    }
  });

  ipcMain.handle("get-command-history", async (_event, limit?: number) => {
    try {
      return dbManager ? dbManager.getCommandHistory(limit || 1000) : [];
    } catch (error) {
      console.error("Failed to load command history:", error);
      return [];
    }
  });

  ipcMain.handle("clear-command-history", async () => {
    try {
      if (dbManager) {
        dbManager.clearCommandHistory();
      }
    } catch (error) {
      console.error("Failed to clear command history:", error);
    }
  });

  ipcMain.handle("dedupe-command-history", async () => {
    try {
      return dbManager ? dbManager.dedupeCommandHistory() : { removed: 0 };
    } catch (error) {
      console.error("Failed to dedupe command history:", error);
      return { removed: 0 };
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
        if (dbManager) {
          dbManager.addDebugLog(level, message, data);
        }
      } catch (error) {
        console.error("Failed to save debug log:", error);
      }
    },
  );

  ipcMain.handle("get-debug-logs", async (_event, limit?: number) => {
    try {
      return dbManager ? dbManager.getDebugLogs(limit || 100) : [];
    } catch (error) {
      console.error("Failed to get debug logs:", error);
      return [];
    }
  });

  ipcMain.handle("clear-debug-logs", async () => {
    try {
      if (dbManager) {
        dbManager.clearDebugLogs();
      }
    } catch (error) {
      console.error("Failed to clear debug logs:", error);
    }
  });
}
