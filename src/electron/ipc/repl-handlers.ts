import { ipcMain } from "electron";
import { ReplEnvRecord } from "../database";
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
        if (dbManager) {
          dbManager.saveReplEnv(entries);
        }
      } catch (error) {
        console.error("Failed to save repl env to database:", error);
      }
    },
  );

  ipcMain.handle("get-repl-env", async (): Promise<ReplEnvRecord[]> => {
    try {
      if (!dbManager) {
        return [];
      }
      return dbManager.getReplEnv();
    } catch (error) {
      console.error("Failed to get repl env from database:", error);
      return [];
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
