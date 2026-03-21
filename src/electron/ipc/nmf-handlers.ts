import { ipcMain, BrowserWindow } from "electron";
import { DatabaseManager } from "../database";
import { debugLog } from "../logger";
import { BufNMF } from "../BufNMF";
import { BufNMFCross } from "../BufNMFCross";
import { BounceError } from "../../shared/bounce-error.js";
import { resolveAudioData } from "../audio-resolver";
import type { HandlerDeps } from "./register";

interface CommandResult {
  success: boolean;
  message: string;
}

async function executeAnalyzeNmf(
  args: string[],
  mainWindow: BrowserWindow,
  dbManager?: DatabaseManager,
): Promise<CommandResult> {
  debugLog("info", "[AnalyzeNMF] Command executed", { args });

  if (args.length === 0) {
    return {
      success: false,
      message: "Usage: analyze-nmf <sample-hash> [options]",
    };
  }

  const sampleHash = args[0];

  // Parse options
  let components = 10;
  let iterations = 100;
  let fftSize = 2048;

  for (let i = 1; i < args.length; i += 2) {
    const option = args[i];
    const value = args[i + 1];

    if (option === "--components" && value) {
      components = parseInt(value, 10);
    } else if (option === "--iterations" && value) {
      iterations = parseInt(value, 10);
    } else if (option === "--fft-size" && value) {
      fftSize = parseInt(value, 10);
    }
  }

  debugLog("info", "[AnalyzeNMF] Parsed options", {
    components,
    iterations,
    fftSize,
  });

  if (!dbManager) {
    return { success: false, message: "Database not initialized" };
  }

  try {
    // Look up sample in the current project context
    const sample = dbManager.getSampleByHash(sampleHash);

    if (!sample) {
      debugLog("error", "[AnalyzeNMF] Sample not found", { sampleHash });
      return {
        success: false,
        message: `No sample found with hash starting with: ${sampleHash}`,
      };
    }

    debugLog("info", "[AnalyzeNMF] Sample found", {
      hash: sample.hash,
      duration: sample.duration,
      sampleRate: sample.sample_rate,
    });

    // Resolve audio data for this sample
    const resolved = await resolveAudioData(dbManager, sample.hash);
    const audioData = resolved.audioData;

    if (!audioData || audioData.length === 0) {
      debugLog("error", "[AnalyzeNMF] No audio data in sample");
      return { success: false, message: "Sample has no audio data." };
    }

    debugLog("info", "[AnalyzeNMF] Starting NMF analysis", {
      audioDataLength: audioData.length,
      components,
      iterations,
    });

    // Perform NMF analysis
    const nmf = new BufNMF({ components, iterations, fftSize });
    const result = nmf.process(audioData, sample.sample_rate);

    debugLog("info", "[AnalyzeNMF] Analysis complete", {
      basesShape: [result.bases.length, result.bases[0]?.length || 0],
      activationsShape: [
        result.activations.length,
        result.activations[0]?.length || 0,
      ],
    });

    const featurePayload = {
      bases: result.bases,
      activations: result.activations,
    };
    dbManager.storeFeature(
      sample.hash,
      "nmf",
      featurePayload as unknown as number[],
      { components, iterations, fftSize } as Record<string, unknown>,
    );
    const storedFeature = dbManager.getMostRecentFeature(sample.hash, "nmf");
    if (!storedFeature) {
      throw new Error("NMF feature could not be loaded after storage.");
    }

    debugLog("info", "[AnalyzeNMF] Computed feature hash", {
      featureHash: storedFeature.feature_hash.substring(0, 8),
    });

    debugLog("info", "[AnalyzeNMF] Feature stored in database");

    return {
      success: true,
      message:
        `NMF analysis complete for sample ${sample.hash.substring(0, 8)}\r\n` +
        `Components: ${components}, Iterations: ${iterations}\r\n` +
        `Feature hash: ${storedFeature.feature_hash.substring(0, 8)}`,
    };
  } catch (error: any) {
    debugLog("error", "[AnalyzeNMF] Error during analysis", {
      error: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      message: `NMF analysis failed: ${error.message}`,
    };
  }
}

async function executeVisualizeNmf(
  args: string[],
  mainWindow: BrowserWindow,
  dbManager?: DatabaseManager,
): Promise<CommandResult> {
  debugLog("info", "[VisualizeNMF] Command called", { args });

  const hash = args[0];
  if (!hash) {
    debugLog("info", "[VisualizeNMF] No hash provided");
    return { success: false, message: "Usage: visualize-nmf <sample-hash>" };
  }

  try {
    debugLog("info", "[VisualizeNMF] Looking up NMF feature", { hash });

    if (!dbManager) {
      return { success: false, message: "Database not initialized" };
    }

    // Find sample by hash prefix
    const sample = dbManager.getSampleByHash(hash);

    if (!sample) {
      return {
        success: false,
        message: `No sample found with hash starting with: ${hash}`,
      };
    }

    debugLog("info", "[VisualizeNMF] Found sample", {
      sampleHash: sample.hash,
    });

    // Find NMF feature for this sample
    const feature = dbManager.getFeature(sample.hash, "nmf");

    if (!feature) {
      return {
        success: false,
        message: `No NMF analysis found for sample ${hash}. Run 'analyze-nmf ${hash}' first.`,
      };
    }

    debugLog("info", "[VisualizeNMF] Found NMF feature", {
      featureHash: feature.feature_hash,
    });

    // Parse the NMF data
    const nmfData = JSON.parse(feature.feature_data);

    debugLog("info", "[VisualizeNMF] Parsed NMF data", {
      components: nmfData.bases?.length,
      basisRows: nmfData.bases?.length,
      basisCols: nmfData.bases?.[0]?.length,
      activationsRows: nmfData.activations?.length,
      activationsCols: nmfData.activations?.[0]?.length,
    });

    // Send to renderer to overlay on waveform
    debugLog("info", "[VisualizeNMF] Sending to renderer", {
      sampleHash: sample.hash,
      components: nmfData.bases?.length || 0,
    });

    mainWindow.webContents.send("overlay-nmf-visualization", {
      sampleHash: sample.hash,
      nmfData: {
        components: nmfData.bases?.length || 0,
        basis: nmfData.bases,
        activations: nmfData.activations,
      },
      featureHash: feature.feature_hash,
    });

    debugLog("info", "[VisualizeNMF] Sent to renderer successfully");

    return {
      success: true,
      message: `NMF visualization overlaid for sample ${hash.substring(0, 8)}`,
    };
  } catch (error) {
    debugLog("error", "[VisualizeNMF] Error", { error: String(error) });
    return {
      success: false,
      message: `Error visualizing NMF: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeVisualizeNx(
  args: string[],
  mainWindow: BrowserWindow,
  dbManager?: DatabaseManager,
): Promise<CommandResult> {
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
}

async function executeSep(
  args: string[],
  mainWindow: BrowserWindow,
  dbManager?: DatabaseManager,
): Promise<CommandResult> {
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

    // Resolve audio data for this sample
    const resolved = await resolveAudioData(dbManager, sample.hash);
    const audioData = resolved.audioData;

    debugLog("info", "[Sep] Starting component resynthesis", {
      numComponents,
      audioLength: audioData.length,
      sampleRate: sample.sample_rate,
    });

    // Create BufNMF instance for resynthesis
    const nmf = new BufNMF({ fftSize, hopSize, windowSize });

    // Resynthesize and store each component
    const derivedHashes: string[] = [];

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

      const derivedHash = dbManager.createDerivedSample(
        sample.hash,
        feature.feature_hash,
        i,
        sample.sample_rate,
        sample.channels,
        componentAudio.length / sample.sample_rate,
      );

      derivedHashes.push(derivedHash);
    }

    debugLog("info", "[Sep] All components resynthesized and stored", {
      derivedHashes,
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
}

async function executeNx(
  args: string[],
  mainWindow: BrowserWindow,
  dbManager?: DatabaseManager,
): Promise<CommandResult> {
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

    // Resolve target audio data
    const resolved = await resolveAudioData(dbManager, targetSample.hash);
    const targetAudioData = resolved.audioData;

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
    const featurePayload = {
      bases: crossResult.bases,
      activations: crossResult.activations,
      sourceSampleHash: sourceSample.hash,
      sourceFeatureHash: sourceFeature.feature_hash,
    };
    dbManager.storeFeature(
      targetSample.hash,
      "nmf-cross",
      featurePayload as unknown as number[],
      { fftSize, hopSize, windowSize } as Record<string, unknown>,
    );
    const storedFeature = dbManager.getMostRecentFeature(
      targetSample.hash,
      "nmf-cross",
    );
    if (!storedFeature) {
      throw new Error("Cross-synthesis feature could not be loaded after storage.");
    }

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

      const derivedHash = dbManager.createDerivedSample(
        targetSample.hash,
        storedFeature.feature_hash,
        i,
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
}

export function registerNmfHandlers(deps: HandlerDeps): void {
  const { getMainWindow } = deps;

  ipcMain.handle("analyze-nmf", async (_event, args: string[]) => {
    try {
      const mainWindow = getMainWindow()!;
      return await executeAnalyzeNmf(args, mainWindow, deps.dbManager);
    } catch (error) {
      console.error("Failed to execute analyze-nmf:", error);
      throw error instanceof BounceError ? error : new BounceError("ANALYSIS_NMF_COMMAND_FAILED", `Failed to execute analyze-nmf: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("visualize-nmf", async (_event, sampleHash: string) => {
    try {
      const mainWindow = getMainWindow()!;
      return await executeVisualizeNmf([sampleHash], mainWindow, deps.dbManager);
    } catch (error) {
      console.error("Failed to execute visualize-nmf:", error);
      throw error instanceof BounceError ? error : new BounceError("ANALYSIS_VISUALIZE_NMF_FAILED", `Failed to execute visualize-nmf: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("sep", async (_event, args: string[]) => {
    try {
      const mainWindow = getMainWindow()!;
      return await executeSep(args, mainWindow, deps.dbManager);
    } catch (error) {
      console.error("Failed to execute sep:", error);
      throw error instanceof BounceError ? error : new BounceError("ANALYSIS_SEP_FAILED", `Failed to execute sep: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("nx", async (_event, args: string[]) => {
    try {
      const mainWindow = getMainWindow()!;
      return await executeNx(args, mainWindow, deps.dbManager);
    } catch (error) {
      console.error("Failed to execute nx:", error);
      throw error instanceof BounceError ? error : new BounceError("ANALYSIS_NX_FAILED", `Failed to execute nx: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle(
    "send-command",
    async (_event, commandName: string, args: string[]) => {
      try {
        const commands: Record<string, (args: string[], mainWindow: BrowserWindow, dbManager?: DatabaseManager) => Promise<CommandResult>> = {
          "visualize-nmf": executeVisualizeNmf,
          "visualize-nx": executeVisualizeNx,
          "sep": executeSep,
          "nx": executeNx,
        };

        const command = commands[commandName];
        if (!command) {
          return `Unknown command: ${commandName}`;
        }

        const mainWindow = getMainWindow()!;
        return await command(args, mainWindow, deps.dbManager);
      } catch (error) {
        console.error(`Failed to execute command ${commandName}:`, error);
        throw error instanceof BounceError ? error : new BounceError("ANALYSIS_COMMAND_FAILED", `Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
