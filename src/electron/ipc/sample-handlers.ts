import { ipcMain } from "electron";
import { GranularizeOptions } from "../database";
import { BounceError } from "../../shared/bounce-error.js";
import type { HandlerDeps } from "./register";

export function registerSampleHandlers(deps: HandlerDeps): void {
  ipcMain.handle("list-samples", async () => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
      }
      return deps.dbManager.listSamples();
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to list samples:", error);
      throw new BounceError("SAMPLE_LIST_FAILED", `Failed to list samples: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("get-sample-by-hash", async (_event, hash: string) => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
      }
      return deps.dbManager.getSampleByHash(hash);
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to get sample:", error);
      throw new BounceError("SAMPLE_LOOKUP_FAILED", `Failed to get sample: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("get-sample-by-name", async (_event, name: string) => {
    if (!deps.dbManager) return null;
    const sample = deps.dbManager.getSampleByPath(name);
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
        if (!deps.dbManager) {
          throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
        }
        return deps.dbManager.createSliceSamples(sampleHash, featureHash);
      } catch (error) {
        if (error instanceof BounceError) throw error;
        throw new BounceError("SAMPLE_SLICE_FAILED", `Failed to create slice samples: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle(
    "get-derived-samples",
    async (_event, sourceHash: string, featureHash: string) => {
      try {
        if (!deps.dbManager) {
          throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
        }
        return deps.dbManager.getDerivedSamples(sourceHash, featureHash);
      } catch (error) {
        if (error instanceof BounceError) throw error;
        console.error("Failed to get derived samples:", error);
        throw new BounceError("SAMPLE_DERIVED_LOOKUP_FAILED", `Failed to get derived samples: ${error instanceof Error ? error.message : String(error)}`);
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
        if (!deps.dbManager) {
          throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
        }
        return deps.dbManager.getDerivedSampleByIndex(sourceHash, featureHash, index) ?? null;
      } catch (error) {
        if (error instanceof BounceError) throw error;
        console.error("Failed to get derived sample by index:", error);
        throw new BounceError("SAMPLE_DERIVED_INDEX_FAILED", `Failed to get derived sample by index: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle("list-derived-samples-summary", async () => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
      }
      return deps.dbManager.listDerivedSamplesSummary();
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to list derived samples summary:", error);
      throw new BounceError("SAMPLE_DERIVED_LIST_FAILED", `Failed to list derived samples summary: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle(
    "granularize-sample",
    async (_event, sourceHash: string, options?: GranularizeOptions) => {
      try {
        if (!deps.dbManager) {
          throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
        }
        return deps.dbManager.granularize(sourceHash, options ?? {});
      } catch (error) {
        if (error instanceof BounceError) throw error;
        throw new BounceError("SAMPLE_GRANULARIZE_FAILED", `Failed to granularize sample: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
