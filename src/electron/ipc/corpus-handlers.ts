import { ipcMain } from "electron";
import { BounceError } from "../../shared/bounce-error.js";
import type { HandlerDeps } from "./register";

export function registerCorpusHandlers(deps: HandlerDeps): void {
  const { corpusManager } = deps;

  ipcMain.handle(
    "corpus-build",
    async (_event, sourceHash: string, featureHash: string) => {
      try {
        if (!deps.dbManager) throw new BounceError("CORPUS_DB_NOT_READY", "Database not ready.");
        return await corpusManager.build(deps.dbManager, sourceHash, featureHash);
      } catch (error) {
        if (error instanceof BounceError) throw error;
        throw new BounceError("CORPUS_BUILD_FAILED", `corpus-build failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle(
    "corpus-query",
    async (_event, segmentIndex: number, k = 5) => {
      try {
        return corpusManager.query(segmentIndex, k);
      } catch (error) {
        throw new BounceError("CORPUS_QUERY_FAILED", `corpus-query failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle(
    "corpus-resynthesize",
    async (_event, indices: number[]) => {
      try {
        return corpusManager.resynthesize(indices);
      } catch (error) {
        throw new BounceError("CORPUS_RESYNTHESIZE_FAILED", `corpus-resynthesize failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
