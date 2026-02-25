import { BrowserWindow } from "electron";
import { DatabaseManager } from "../database";
import { debugLog } from "../logger";
import { Command } from "./types";

export const visualizeNxCommand: Command = {
  name: "visualize-nx",
  description: "Visualize NMF cross-synthesis result",
  usage: "visualize-nx <target-hash>",
  help: `Visualize NMF cross-synthesis showing source bases against target activations.

Usage: visualize-nx <target-hash>

Displays an overlay visualization showing:
- Source bases (spectral templates from dictionary)
- Target activations (how those templates are used over time in target)
- Cross-synthesis reconstruction

Requires that 'nx' has been run on the target sample.

Example:
  nx target-sample source-sample
  visualize-nx target-sample`,

  execute: async (
    args: string[],
    mainWindow: BrowserWindow,
    dbManager?: DatabaseManager,
  ) => {
    if (args.length === 0) {
      return {
        success: false,
        message: "Usage: visualize-nx <target-hash>",
      };
    }

    if (!dbManager) {
      return { success: false, message: "Database not initialized" };
    }

    const targetHash = args[0];

    try {
      const sample = dbManager.getSampleByHash(targetHash);
      if (!sample) {
        return {
          success: false,
          message: `Sample not found: ${targetHash}`,
        };
      }

      const feature = dbManager.getFeature(sample.hash, "nmf-cross");
      if (!feature) {
        return {
          success: false,
          message: `No NMF cross-synthesis found for sample ${targetHash}. Run 'nx <target> <source>' first.`,
        };
      }

      const nmfData = JSON.parse(feature.feature_data);
      const bases = nmfData.bases as number[][];
      const activations = nmfData.activations as number[][];
      const sourceSampleHash = nmfData.sourceSampleHash as string;
      const sourceFeatureHash = nmfData.sourceFeatureHash as string;

      debugLog("info", "[VisualizeNX] Sending visualization", {
        targetHash: sample.hash.substring(0, 8),
        sourceHash: sourceSampleHash.substring(0, 8),
        sourceFeatureHash: sourceFeatureHash.substring(0, 8),
        components: bases.length,
      });

      mainWindow.webContents.send("overlay-nx-visualization", {
        targetSampleHash: sample.hash,
        sourceSampleHash,
        sourceFeatureHash,
        bases,
        activations,
        options: JSON.parse(feature.options || "{}"),
      });

      return {
        success: true,
        message: `Visualizing NMF cross-synthesis for ${sample.hash.substring(0, 8)}`,
      };
    } catch (error: any) {
      debugLog("error", "[VisualizeNX] Error", {
        error: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        message: `Visualization failed: ${error.message}`,
      };
    }
  },
};
