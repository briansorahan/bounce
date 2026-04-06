import { ipcMain } from "electron";
import { ReplIntelligence } from "../repl-intelligence.js";
import type { HandlerDeps } from "./register.js";

/** Lazily-created intelligence instance, shared across requests. */
let intelligence: ReplIntelligence | null = null;

function getIntelligence(deps: HandlerDeps): ReplIntelligence {
  if (!intelligence) {
    intelligence = new ReplIntelligence({
      dbManager: deps.dbManager,
    });
  }
  return intelligence;
}

export function registerCompletionHandlers(deps: HandlerDeps): void {
  ipcMain.handle(
    "completion:request",
    async (_event, buffer: string, cursor: number, _requestId: number) => {
      try {
        const context = await deps.languageServiceManager.parse(buffer, cursor);
        return getIntelligence(deps).predict(context);
      } catch (err) {
        console.error("[completion-handlers] predict failed:", err);
        return [];
      }
    },
  );
}
