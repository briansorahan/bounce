import { ipcMain } from "electron";
import { ReplEnvRecord } from "../database";
import { BounceError } from "../../shared/bounce-error.js";
import type { HandlerDeps } from "./register";

// Lazily loaded TypeScript transpiler — runs in the main process where require() is always available
let _ts: typeof import("typescript") | null = null;
function getMainTs(): typeof import("typescript") {
  if (!_ts) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _ts = require("typescript") as typeof import("typescript");
  }
  return _ts;
}

export function registerReplHandlers(deps: HandlerDeps): void {
  const { dbManager } = deps;

  ipcMain.handle(
    "save-repl-env",
    async (
      _event,
      entries: Array<{ name: string; kind: "json" | "function"; value: string }>,
    ) => {
      try {
        if (!dbManager) {
          throw new BounceError("REPL_DB_NOT_READY", "Database not initialized");
        }
        dbManager.saveReplEnv(entries);
      } catch (error) {
        if (error instanceof BounceError) throw error;
        console.error("Failed to save repl env to database:", error);
        throw new BounceError("REPL_SAVE_ENV_FAILED", `Failed to save REPL env: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle("get-repl-env", async (): Promise<ReplEnvRecord[]> => {
    try {
      if (!dbManager) {
        throw new BounceError("REPL_DB_NOT_READY", "Database not initialized");
      }
      return dbManager.getReplEnv();
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to get repl env from database:", error);
      throw new BounceError("REPL_LOAD_ENV_FAILED", `Failed to get REPL env: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("transpile-typescript", (_event, source: string): string => {
    return getMainTs().transpileModule(source, {
      compilerOptions: {
        target: 99 /* ScriptTarget.ESNext */,
        module: 1 /* ModuleKind.CommonJS */,
        esModuleInterop: true,
      },
    }).outputText;
  });
}
