import { ipcMain } from "electron";
import { GranularizeOptions } from "../database";
import type { HandlerDeps } from "./register";

export function registerSampleHandlers(deps: HandlerDeps): void {
  const { dbManager } = deps;

  ipcMain.handle("list-samples", async () => {
    try {
      if (!dbManager) {
        return [];
      }
      return dbManager.listSamples();
    } catch (error) {
      console.error("Failed to list samples:", error);
      return [];
    }
  });

  ipcMain.handle("get-sample-by-hash", async (_event, hash: string) => {
    try {
      if (!dbManager) {
        return null;
      }
      return dbManager.getSampleByHash(hash);
    } catch (error) {
      console.error("Failed to get sample:", error);
      return null;
    }
  });

  ipcMain.handle("get-sample-by-name", async (_event, name: string) => {
    if (!dbManager) return null;
    const sample = dbManager.getSampleByPath(name);
    if (!sample) return null;
    return {
      id: sample.id,
      hash: sample.hash,
      file_path: sample.file_path,
      sample_rate: sample.sample_rate,
      channels: sample.channels,
      duration: sample.duration,
    };
  });

  ipcMain.handle(
    "create-slice-samples",
    async (_event, sampleHash: string, featureHash: string) => {
      try {
        if (!dbManager) {
          throw new Error("Database not initialized");
        }
        return dbManager.createSliceSamples(sampleHash, featureHash);
      } catch (error) {
        throw new Error(
          `Failed to create slice samples: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  ipcMain.handle(
    "get-derived-samples",
    async (_event, sourceHash: string, featureHash: string) => {
      try {
        if (!dbManager) {
          return [];
        }
        return dbManager.getDerivedSamples(sourceHash, featureHash);
      } catch (error) {
        console.error("Failed to get derived samples:", error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "get-derived-sample-by-index",
    async (
      _event,
      sourceHash: string,
      featureHash: string,
      index: number,
    ) => {
      try {
        if (!dbManager) {
          return null;
        }
        return dbManager.getDerivedSampleByIndex(sourceHash, featureHash, index) ?? null;
      } catch (error) {
        console.error("Failed to get derived sample by index:", error);
        return null;
      }
    },
  );

  ipcMain.handle("list-derived-samples-summary", async () => {
    try {
      if (!dbManager) {
        return [];
      }
      return dbManager.listDerivedSamplesSummary();
    } catch (error) {
      console.error("Failed to list derived samples summary:", error);
      return [];
    }
  });

  ipcMain.handle(
    "granularize-sample",
    async (_event, sourceHash: string, options?: GranularizeOptions) => {
      try {
        if (!dbManager) {
          throw new Error("Database not initialized");
        }
        return dbManager.granularize(sourceHash, options ?? {});
      } catch (error) {
        throw new Error(
          `Failed to granularize sample: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
