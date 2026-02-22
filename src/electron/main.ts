import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { OnsetSlice, BufNMF } from "../index";
import decode from "audio-decode";
import { DatabaseManager } from "./database";
import { debugLog, setDatabaseManager } from "./logger";

let dbManager: DatabaseManager | undefined = undefined;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Bounce",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

ipcMain.handle("read-audio-file", async (_event, filePathOrHash: string) => {
  try {
    // Check if it's a hash (8+ hex characters without path separators)
    const isHash =
      /^[0-9a-f]{8,}$/i.test(filePathOrHash) &&
      !filePathOrHash.includes("/") &&
      !filePathOrHash.includes("\\");

    if (isHash && dbManager) {
      // Look up in database by hash prefix
      debugLog("info", "[AudioLoader] Looking up sample by hash", {
        hash: filePathOrHash,
      });
      const sample = dbManager.getSampleByHash(filePathOrHash);
      debugLog("info", "[AudioLoader] Sample lookup result", {
        found: !!sample,
      });
      if (sample) {
        const audioData = new Float32Array(sample.audio_data.buffer);
        return {
          channelData: Array.from(audioData),
          sampleRate: sample.sample_rate,
          duration: sample.duration,
          hash: sample.hash,
          filePath: sample.file_path,
        };
      }
      // If not found, fall through to treat as file path
      debugLog("info", "[AudioLoader] Hash not found, treating as file path", {
        input: filePathOrHash,
      });
    }

    let resolvedPath = filePathOrHash;

    if (!path.isAbsolute(filePathOrHash)) {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [
          {
            name: "Audio Files",
            extensions: ["wav", "mp3", "ogg", "flac", "m4a", "aac", "opus"],
          },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        throw new Error("File selection canceled");
      }

      resolvedPath = result.filePaths[0];
    }

    const fileBuffer = fs.readFileSync(resolvedPath);
    const audioBuffer = await decode(fileBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    // Compute hash of the audio data
    const audioDataBuffer = Buffer.from(channelData.buffer);
    const hash = crypto
      .createHash("sha256")
      .update(audioDataBuffer)
      .digest("hex");

    // Store in database
    if (dbManager) {
      dbManager.storeSample(
        hash,
        resolvedPath,
        audioDataBuffer,
        sampleRate,
        audioBuffer.numberOfChannels,
        duration,
      );
    }

    return {
      channelData: Array.from(channelData),
      sampleRate,
      duration,
      hash,
      filePath: resolvedPath,
    };
  } catch (error) {
    throw new Error(
      `Failed to read audio file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
});

interface OnsetSliceOptions {
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  frameDelta?: number;
  metric?: number;
}

interface BufNMFOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  seed?: number;
}

interface FeatureOptions {
  threshold?: number;
  [key: string]: unknown;
}

ipcMain.handle(
  "analyze-onset-slice",
  async (_event, audioDataArray: number[], options?: OnsetSliceOptions) => {
    try {
      const audioData = new Float32Array(audioDataArray);

      const slicer = new OnsetSlice(options || {});
      const slices = slicer.process(audioData);

      return Array.from(slices);
    } catch (error) {
      throw new Error(
        `Failed to analyze onset slices: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
);

ipcMain.handle(
  "analyze-buf-nmf",
  async (
    _event,
    audioDataArray: number[],
    sampleRate: number,
    options?: BufNMFOptions,
  ) => {
    try {
      const audioData = new Float32Array(audioDataArray);

      const nmf = new BufNMF(options || {});
      const result = nmf.process(audioData, sampleRate);

      return result;
    } catch (error) {
      throw new Error(
        `Failed to perform NMF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
);

ipcMain.handle("save-command", async (_event, command: string) => {
  try {
    if (dbManager) {
      dbManager.addCommand(command);
    }
  } catch (error) {
    console.error("Failed to save command to database:", error);
  }
});

ipcMain.handle("get-command-history", async (_event, limit?: number) => {
  try {
    return dbManager ? dbManager.getCommandHistory(limit || 1000) : [];
  } catch (error) {
    console.error("Failed to load command history:", error);
    return [];
  }
});

ipcMain.handle("clear-command-history", async () => {
  try {
    if (dbManager) {
      dbManager.clearCommandHistory();
    }
  } catch (error) {
    console.error("Failed to clear command history:", error);
  }
});

ipcMain.handle("dedupe-command-history", async () => {
  try {
    return dbManager ? dbManager.dedupeCommandHistory() : { removed: 0 };
  } catch (error) {
    console.error("Failed to dedupe command history:", error);
    return { removed: 0 };
  }
});

ipcMain.handle(
  "debug-log",
  async (
    _event,
    level: string,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    try {
      if (dbManager) {
        dbManager.addDebugLog(level, message, data);
      }
    } catch (error) {
      console.error("Failed to save debug log:", error);
    }
  },
);

ipcMain.handle("get-debug-logs", async (_event, limit?: number) => {
  try {
    return dbManager ? dbManager.getDebugLogs(limit || 100) : [];
  } catch (error) {
    console.error("Failed to get debug logs:", error);
    return [];
  }
});

ipcMain.handle("clear-debug-logs", async () => {
  try {
    if (dbManager) {
      dbManager.clearDebugLogs();
    }
  } catch (error) {
    console.error("Failed to clear debug logs:", error);
  }
});

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

ipcMain.handle(
  "create-slices",
  async (
    _event,
    sampleHash: string,
    featureId: number,
    slicePositions: number[],
  ) => {
    try {
      if (!dbManager) {
        throw new Error("Database not initialized");
      }
      const sliceIds = dbManager.createSlices(
        sampleHash,
        featureId,
        slicePositions,
      );
      return sliceIds;
    } catch (error) {
      throw new Error(
        `Failed to create slices: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
);

ipcMain.handle("get-slices-by-feature", async (_event, featureId: number) => {
  try {
    if (!dbManager) {
      return [];
    }
    return dbManager.getSlicesByFeature(featureId);
  } catch (error) {
    console.error("Failed to get slices:", error);
    return [];
  }
});

ipcMain.handle("get-slice", async (_event, sliceId: number) => {
  try {
    if (!dbManager) {
      return null;
    }
    return dbManager.getSlice(sliceId);
  } catch (error) {
    console.error("Failed to get slice:", error);
    return null;
  }
});

ipcMain.handle("get-components-by-feature", async (_event, featureId: number) => {
  try {
    if (!dbManager) {
      return [];
    }
    return dbManager.getComponentsByFeature(featureId);
  } catch (error) {
    console.error("Failed to get components by feature:", error);
    return [];
  }
});

ipcMain.handle("get-component", async (_event, componentId: number) => {
  try {
    if (!dbManager) {
      return null;
    }
    return dbManager.getComponent(componentId);
  } catch (error) {
    console.error("Failed to get component:", error);
    return null;
  }
});

ipcMain.handle(
  "get-component-by-index",
  async (
    _event,
    sampleHash: string,
    featureId: number,
    componentIndex: number,
  ) => {
    try {
      if (!dbManager) {
        return null;
      }
      return dbManager.getComponentByIndex(
        sampleHash,
        featureId,
        componentIndex,
      );
    } catch (error) {
      console.error("Failed to get component by index:", error);
      return null;
    }
  },
);

ipcMain.handle("list-components-summary", async () => {
  try {
    if (!dbManager) {
      return [];
    }
    return dbManager.listComponentsSummary();
  } catch (error) {
    console.error("Failed to list components summary:", error);
    return [];
  }
});

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

ipcMain.handle("list-slices-summary", async () => {
  try {
    if (!dbManager) {
      return [];
    }
    return dbManager.listSlicesSummary();
  } catch (error) {
    console.error("Failed to list slices summary:", error);
    return [];
  }
});

ipcMain.handle("analyze-nmf", async (_event, args: string[]) => {
  try {
    const { analyzeNmfCommand } = await import("./commands/analyze-nmf.js");
    const mainWindow = BrowserWindow.getAllWindows()[0];
    return await analyzeNmfCommand.execute(args, mainWindow, dbManager);
  } catch (error) {
    console.error("Failed to execute analyze-nmf:", error);
    throw error;
  }
});

ipcMain.handle("visualize-nmf", async (_event, sampleHash: string) => {
  try {
    const visualizeNmfModule = await import("./commands/visualize-nmf.js");
    const visualizeNmfCommand = visualizeNmfModule.visualizeNmfCommand;

    const mainWindow = BrowserWindow.getAllWindows()[0];
    return await visualizeNmfCommand.execute(
      [sampleHash],
      mainWindow,
      dbManager,
    );
  } catch (error) {
    console.error("Failed to execute visualize-nmf:", error);
    throw error;
  }
});

ipcMain.handle("sep", async (_event, args: string[]) => {
  try {
    const { sepCommand } = await import("./commands/sep.js");
    const mainWindow = BrowserWindow.getAllWindows()[0];
    return await sepCommand.execute(args, mainWindow, dbManager);
  } catch (error) {
    console.error("Failed to execute sep:", error);
    throw error;
  }
});

ipcMain.handle(
  "send-command",
  async (_event, commandName: string, args: string[]) => {
    try {
      const visualizeNmfModule = await import("./commands/visualize-nmf.js");
      const visualizeNmfCommand = visualizeNmfModule.visualizeNmfCommand;
      const { sepCommand } = await import("./commands/sep.js");

      const commands: Record<string, typeof visualizeNmfCommand> = {
        "visualize-nmf": visualizeNmfCommand,
        "sep": sepCommand,
      };

      const command = commands[commandName];
      if (!command) {
        return `Unknown command: ${commandName}`;
      }

      const mainWindow = BrowserWindow.getAllWindows()[0];
      return await command.execute(args, mainWindow, dbManager);
    } catch (error) {
      console.error(`Failed to execute command ${commandName}:`, error);
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
);

app.whenReady().then(() => {
  dbManager = new DatabaseManager();
  setDatabaseManager(dbManager);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (dbManager) {
    dbManager.close();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
