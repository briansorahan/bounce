import { ipcMain } from "electron";
import type { HandlerDeps } from "./register";

export function registerCorpusHandlers(deps: HandlerDeps): void {
  const { dbManager, corpusManager } = deps;

  ipcMain.handle(
    "corpus-build",
    async (_event, sourceHash: string, featureHash: string) => {
      try {
        if (!dbManager) throw new Error("Database not ready.");
        return corpusManager.build(dbManager, sourceHash, featureHash);
      } catch (error) {
        throw new Error(`corpus-build failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle(
    "corpus-query",
    async (_event, segmentIndex: number, k = 5) => {
      try {
        return corpusManager.query(segmentIndex, k);
      } catch (error) {
        throw new Error(`corpus-query failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle(
    "corpus-resynthesize",
    async (_event, indices: number[]) => {
      try {
        return corpusManager.resynthesize(indices);
      } catch (error) {
        throw new Error(`corpus-resynthesize failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
