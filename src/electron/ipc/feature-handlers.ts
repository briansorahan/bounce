import { ipcMain } from "electron";
import { FeatureOptions } from "../database";
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
          throw new Error("Database not initialized");
        }
        const featureId = dbManager.storeFeature(
          sampleHash,
          featureType,
          featureData,
          options,
        );
        return featureId;
      } catch (error) {
        throw new Error(
          `Failed to store feature: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  ipcMain.handle(
    "get-most-recent-feature",
    async (_event, sampleHash?: string, featureType?: string) => {
      try {
        if (!dbManager) {
          return null;
        }
        return dbManager.getMostRecentFeature(sampleHash, featureType);
      } catch (error) {
        console.error("Failed to get most recent feature:", error);
        return null;
      }
    },
  );

  ipcMain.handle("list-features", async () => {
    try {
      if (!dbManager) {
        return [];
      }
      return dbManager.listFeatures();
    } catch (error) {
      console.error("Failed to list features:", error);
      return [];
    }
  });
}
