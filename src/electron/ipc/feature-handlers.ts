import { ipcMain } from "electron";
import { FeatureOptions } from "../database";
import { BounceError } from "../../shared/bounce-error.js";
import type { HandlerDeps } from "./register";

export function registerFeatureHandlers(deps: HandlerDeps): void {
  const { dbManager } = deps;

  ipcMain.handle(
    "store-feature",
    async (
      _event,
      sampleHash: string,
      featureType: string,
      featureData: number[],
      options?: FeatureOptions,
    ) => {
      try {
        if (!dbManager) {
          throw new BounceError("FEATURE_DB_NOT_READY", "Database not initialized");
        }
        const featureId = dbManager.storeFeature(
          sampleHash,
          featureType,
          featureData,
          options,
        );
        return featureId;
      } catch (error) {
        if (error instanceof BounceError) throw error;
        throw new BounceError("FEATURE_STORE_FAILED", `Failed to store feature: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle(
    "get-most-recent-feature",
    async (_event, sampleHash?: string, featureType?: string) => {
      try {
        if (!dbManager) {
          throw new BounceError("FEATURE_DB_NOT_READY", "Database not initialized");
        }
        return dbManager.getMostRecentFeature(sampleHash, featureType);
      } catch (error) {
        if (error instanceof BounceError) throw error;
        console.error("Failed to get most recent feature:", error);
        throw new BounceError("FEATURE_LOOKUP_FAILED", `Failed to get most recent feature: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle("list-features", async () => {
    try {
      if (!dbManager) {
        throw new BounceError("FEATURE_DB_NOT_READY", "Database not initialized");
      }
      return dbManager.listFeatures();
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to list features:", error);
      throw new BounceError("FEATURE_LIST_FAILED", `Failed to list features: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
