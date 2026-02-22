import { BrowserWindow } from "electron";
import { DatabaseManager } from "../database";
import { debugLog } from "../logger";
import { BufNMF } from "../BufNMF";
import { Command } from "./types";

export const sepCommand: Command = {
  name: "sep",
  description: "Separate NMF components for playback",
  usage: "sep <sample-hash> [feature-hash]",
  help: `Separate and resynthesize NMF components for individual playback.

Usage: sep <sample-hash> [feature-hash]

This command requires that you have already run 'analyze-nmf' on the sample.
If feature-hash is not provided, uses the most recent NMF analysis.
Component audio will be resynthesized and stored in the database.

Example:
  analyze-nmf 82a4b173 --components 5
  sep 82a4b173                    # Use most recent analysis
  sep 82a4b173 a3f5e8b2            # Use specific analysis
  play-component 82a4b173 0       # Play first component`,

  execute: async (
    args: string[],
    mainWindow: BrowserWindow,
    dbManager?: DatabaseManager,
  ) => {
    debugLog("info", "[Sep] Command executed", { args });

    if (args.length === 0) {
      return {
        success: false,
        message: "Usage: sep <sample-hash>",
      };
    }

    const sampleHash = args[0];
    const featureHash = args[1]; // Optional feature hash

    if (!dbManager) {
      return { success: false, message: "Database not initialized" };
    }

    try {
      // Look up sample in database
      const sample = dbManager.getSampleByHash(sampleHash);

      if (!sample) {
        debugLog("error", "[Sep] Sample not found", { sampleHash });
        return {
          success: false,
          message: `No sample found with hash starting with: ${sampleHash}`,
        };
      }

      debugLog("info", "[Sep] Sample found", {
        hash: sample.hash,
        duration: sample.duration,
        sampleRate: sample.sample_rate,
      });

      // Look up NMF feature (specific or most recent)
      let feature;
      if (featureHash) {
        feature = dbManager.getFeatureByHash(sample.hash, featureHash);
        if (!feature) {
          return {
            success: false,
            message: `No NMF feature found with hash starting with: ${featureHash}`,
          };
        }
      } else {
        feature = dbManager.getFeature(sample.hash, "nmf");
        if (!feature) {
          return {
            success: false,
            message: `No NMF analysis found for sample ${sampleHash}. Run 'analyze-nmf ${sampleHash}' first.`,
          };
        }
      }

      debugLog("info", "[Sep] NMF feature found", {
        featureHash: feature.feature_hash,
      });

      // Parse NMF data
      const nmfData = JSON.parse(feature.feature_data);
      const bases = nmfData.bases as number[][];
      const activations = nmfData.activations as number[][];
      const numComponents = bases.length;

      debugLog("info", "[Sep] Parsed NMF data", {
        numComponents,
        basisDims: [bases.length, bases[0]?.length || 0],
      });

      // Get NMF parameters from feature options
      const options = JSON.parse(feature.options || "{}");
      const fftSize = options.fftSize || 2048;
      const hopSize = options.hopSize || fftSize / 2;
      const windowSize = options.windowSize || fftSize;

      // Get original audio data
      const audioBuffer = sample.audio_data as Buffer;
      const audioData = new Float32Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );

      debugLog("info", "[Sep] Starting component resynthesis", {
        numComponents,
        audioLength: audioData.length,
        sampleRate: sample.sample_rate,
      });

      // Create BufNMF instance for resynthesis
      const nmf = new BufNMF({ fftSize, hopSize, windowSize });

      // Get feature ID
      const featureRecord = dbManager.db
        .prepare("SELECT id FROM features WHERE feature_hash = ?")
        .get(feature.feature_hash) as { id: number } | undefined;

      if (!featureRecord) {
        return { success: false, message: "Feature ID not found" };
      }

      // Resynthesize and store each component
      const componentIds: number[] = [];

      for (let i = 0; i < numComponents; i++) {
        debugLog("info", `[Sep] Resynthesizing component ${i}/${numComponents}`);

        // Use NMF resynthesis to generate component audio
        const componentAudio = nmf.resynthesize(
          audioData,
          sample.sample_rate,
          bases,
          activations,
          i,
        );

        // Convert to Buffer for storage
        const componentBuffer = Buffer.from(componentAudio.buffer);

        // Store component with actual audio data
        const result = dbManager.db
          .prepare(
            `INSERT OR REPLACE INTO components (sample_hash, feature_id, component_index, audio_data) 
             VALUES (?, ?, ?, ?)`,
          )
          .run(sample.hash, featureRecord.id, i, componentBuffer);

        componentIds.push(result.lastInsertRowid as number);
      }

      debugLog("info", "[Sep] All components resynthesized and stored", {
        componentIds,
      });

      return {
        success: true,
        message:
          `NMF components separated for sample ${sample.hash.substring(0, 8)}\r\n` +
          `Feature: ${feature.feature_hash.substring(0, 8)}\r\n` +
          `${numComponents} components resynthesized (indices: 0-${numComponents - 1})\r\n` +
          `Use 'play-component ${sampleHash.substring(0, 8)} <index>' to play individual components`,
      };
    } catch (error: any) {
      debugLog("error", "[Sep] Error during separation", {
        error: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        message: `Sep command failed: ${error.message}`,
      };
    }
  },
};
