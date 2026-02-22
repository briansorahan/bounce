import { DatabaseManager } from "./database";

let dbManagerInstance: DatabaseManager | null = null;

export function setDatabaseManager(dbManager: DatabaseManager): void {
  dbManagerInstance = dbManager;
}

export function debugLog(
  level: "info" | "debug" | "error",
  message: string,
  data?: Record<string, unknown>,
): void {
  if (dbManagerInstance) {
    dbManagerInstance.addDebugLog(level, message, data);
  }
}
