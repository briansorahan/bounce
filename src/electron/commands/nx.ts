import { BrowserWindow } from "electron";
import { DatabaseManager } from "../database";
import { debugLog } from "../logger";
import { BufNMFCross } from "../BufNMFCross";
import { BufNMF } from "../BufNMF";
import * as crypto from "crypto";
import { Command } from "./types";

export const nxCommand: Command = {
  name: "nx",
  description: "NMF cross-synthesis using source dictionary",
  usage: "nx <target-hash> <source-hash> [source-feature-hash]",
  help: `Apply NMF bases from a source sample to decompose a target sample.

Usage: nx <target-hash> <source-hash> [source-feature-hash]

Uses the NMF bases (dictionary) learned from the source sample to analyze
and resynthesize the target sample. If source-feature-hash is not provided,
uses the most recent NMF analysis of the source sample.

This is useful for:
- Applying a "drum dictionary" from one sample to separate drums in another
- Transferring learned spectral templates across recordings
- Style transfer and audio mosaicing

Example:
  # Analyze a drum loop to learn drum patterns
  analyze-nmf drums.wav --components 10
  
  # Apply drum dictionary to a different recording
  nx song.wav drums.wav
  
  # Use a specific source analysis
  nx song.wav drums.wav a3f5e8b2
  
  # Play the resynthesized components
  play-component song.wav 0`,

  execute: async (
    args: string[],
    mainWindow: BrowserWindow,
    dbManager?: DatabaseManager,
  ) => {
    debugLog("info", "[NX] Command executed", { args });

    if (args.length < 2) {
      return {
        success: false,
        message: "Usage: nx <target-hash> <source-hash> [source-feature-hash]",
      };
    }

    const targetHash = args[0];
    const sourceHash = args[1];
    const sourceFeatureHash = args[2];

    if (!dbManager) {
      return { success: false, message: "Database not initialized" };
    }

    try {
      // Look up target sample
      const targetSample = dbManager.getSampleByHash(targetHash);
      if (!targetSample) {
        return {
          success: false,
          message: `Target sample not found: ${targetHash}`,
        };
      }

      // Look up source sample
      const sourceSample = dbManager.getSampleByHash(sourceHash);
      if (!sourceSample) {
        return {
          success: false,
          message: `Source sample not found: ${sourceHash}`,
        };
      }

      debugLog("info", "[NX] Samples found", {
        target: targetSample.hash.substring(0, 8),
        source: sourceSample.hash.substring(0, 8),
      });

      // Get source NMF feature (specific or most recent)
      let sourceFeature;
      if (sourceFeatureHash) {
        sourceFeature = dbManager.getFeatureByHash(
          sourceSample.hash,
          sourceFeatureHash,
        );
        if (!sourceFeature) {
          return {
            success: false,
            message: `No NMF feature found for source with hash: ${sourceFeatureHash}`,
          };
        }
      } else {
        sourceFeature = dbManager.getFeature(sourceSample.hash, "nmf");
        if (!sourceFeature) {
          return {
            success: false,
            message: `No NMF analysis found for source ${sourceHash}. Run 'analyze-nmf ${sourceHash}' first.`,
          };
        }
      }

      debugLog("info", "[NX] Source feature found", {
        featureHash: sourceFeature.feature_hash.substring(0, 8),
      });

      // Parse source NMF data
      const sourceNMFData = JSON.parse(sourceFeature.feature_data);
      const sourceBases = sourceNMFData.bases as number[][];
      const sourceActivations = sourceNMFData.activations as number[][];
      const numComponents = sourceBases.length;

      debugLog("info", "[NX] Source NMF data parsed", {
        numComponents,
        basisDims: [sourceBases.length, sourceBases[0]?.length || 0],
      });

      // Get NMF parameters from source feature options
      const sourceOptions = JSON.parse(sourceFeature.options || "{}");
      const fftSize = sourceOptions.fftSize || 2048;
      const hopSize = sourceOptions.hopSize || fftSize / 2;
      const windowSize = sourceOptions.windowSize || fftSize;

      // Get target audio data
      const targetAudioBuffer = targetSample.audio_data as Buffer;
      const targetAudioData = new Float32Array(
        targetAudioBuffer.buffer,
        targetAudioBuffer.byteOffset,
        targetAudioBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );

      debugLog("info", "[NX] Starting cross-synthesis", {
        targetLength: targetAudioData.length,
        targetSampleRate: targetSample.sample_rate,
        numComponents,
      });

      // Perform NMF cross-synthesis
      debugLog("info", "[NX] Creating NMFCross instance");
      const nmfCross = new BufNMFCross({
        fftSize,
        hopSize,
        windowSize,
        iterations: 50,
      });

      debugLog("info", "[NX] Running cross-synthesis process");
      const crossResult = nmfCross.process(
        targetAudioData,
        targetSample.sample_rate,
        sourceBases,
        sourceActivations,
      );

      debugLog("info", "[NX] Cross-synthesis complete", {
        targetActivationsShape: [
          crossResult.activations.length,
          crossResult.activations[0]?.length || 0,
        ],
      });

      // Store cross-synthesis result as a new feature
      const featureData = JSON.stringify({
        bases: crossResult.bases,
        activations: crossResult.activations,
        sourceSampleHash: sourceSample.hash,
        sourceFeatureHash: sourceFeature.feature_hash,
      });

      const featureHash = crypto
        .createHash("sha256")
        .update(featureData)
        .digest("hex");

      const options = JSON.stringify({ fftSize, hopSize, windowSize });
      dbManager.db
        .prepare(
          `INSERT OR REPLACE INTO features (sample_hash, feature_type, feature_hash, feature_data, options, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(targetSample.hash, "nmf-cross", featureHash, featureData, options);

      debugLog("info", "[NX] Cross-synthesis feature stored");

      // Now resynthesize components using the cross-synthesis result
      debugLog("info", "[NX] Resynthesizing components");

      const nmf = new BufNMF({ fftSize, hopSize, windowSize });
      const derivedHashes: string[] = [];

      for (let i = 0; i < numComponents; i++) {
        debugLog("info", `[NX] Resynthesizing component ${i}/${numComponents}`);

        const componentAudio = nmf.resynthesize(
          targetAudioData,
          targetSample.sample_rate,
          crossResult.bases,
          crossResult.activations,
          i,
        );

        const componentBuffer = Buffer.from(componentAudio.buffer);

        const derivedHash = dbManager.createDerivedSample(
          targetSample.hash,
          featureHash,
          i,
          componentBuffer,
          targetSample.sample_rate,
          targetSample.channels,
          componentAudio.length / targetSample.sample_rate,
        );

        derivedHashes.push(derivedHash);
      }

      debugLog("info", "[NX] All components resynthesized", { derivedHashes });

      return {
        success: true,
        message:
          `NMF cross-synthesis complete\r\n` +
          `Target: ${targetSample.hash.substring(0, 8)}\r\n` +
          `Source: ${sourceSample.hash.substring(0, 8)} (feature: ${sourceFeature.feature_hash.substring(0, 8)})\r\n` +
          `${numComponents} components resynthesized (indices: 0-${numComponents - 1})\r\n` +
          `Use 'play-component ${targetHash.substring(0, 8)} <index>' to play components`,
      };
    } catch (error: any) {
      debugLog("error", "[NX] Error during cross-synthesis", {
        error: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        message: `NX command failed: ${error.message}`,
      };
    }
  },
};
