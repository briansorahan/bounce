import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as crypto from "crypto";
import { OnsetSlice, BufNMF, MFCCFeature } from "../index";
import decode from "audio-decode";
import { DatabaseManager, FeatureOptions, GranularizeOptions } from "./database";
import {
  BufNMFOptions,
  MFCCOptions,
  OnsetSliceOptions,
} from "./ipc-types";
import { debugLog, setDatabaseManager } from "./logger";
import { CorpusManager } from "./corpus-manager";
import { AUDIO_EXTENSIONS, AUDIO_EXTENSIONS_NO_DOT } from "./audio-extensions";
import { SettingsStore } from "./settings-store";

let dbManager: DatabaseManager | undefined = undefined;
let settingsStore: SettingsStore | undefined = undefined;
const corpusManager: CorpusManager = new CorpusManager();

/** Resolve a path against the stored cwd, expanding ~ and handling relative paths. */
function resolvePath(inputPath: string): string {
  const expanded = SettingsStore.expandHome(inputPath);
  if (path.isAbsolute(expanded)) return expanded;
  const cwd = settingsStore?.getCwd() ?? os.homedir();
  return path.resolve(cwd, expanded);
}

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

  mainWindow.maximize();
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
      const expanded = SettingsStore.expandHome(filePathOrHash);
      const hasPathSep = expanded.includes("/") || expanded.includes("\\");
      const ext = path.extname(expanded).toLowerCase();
      const isAudioFile =
        (AUDIO_EXTENSIONS as readonly string[]).includes(ext) || hasPathSep;

      if (isAudioFile) {
        resolvedPath = resolvePath(filePathOrHash);
      } else {
        const result = await dialog.showOpenDialog({
          properties: ["openFile"],
          filters: [
            {
              name: "Audio Files",
              extensions: AUDIO_EXTENSIONS_NO_DOT,
            },
          ],
        });

        if (result.canceled || result.filePaths.length === 0) {
          throw new Error("File selection canceled");
        }

        resolvedPath = result.filePaths[0];
      }
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

ipcMain.handle(
  "analyze-mfcc",
  async (_event, audioDataArray: number[], options?: MFCCOptions) => {
    try {
      const audioData = new Float32Array(audioDataArray);
      const analyzer = new MFCCFeature(options || {});
      return analyzer.process(audioData);
    } catch (error) {
      throw new Error(
        `Failed to compute MFCCs: ${error instanceof Error ? error.message : String(error)}`,
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

ipcMain.handle("nx", async (_event, args: string[]) => {
  try {
    const { nxCommand } = await import("./commands/nx.js");
    const mainWindow = BrowserWindow.getAllWindows()[0];
    return await nxCommand.execute(args, mainWindow, dbManager);
  } catch (error) {
    console.error("Failed to execute nx:", error);
    throw error;
  }
});

ipcMain.handle(
  "send-command",
  async (_event, commandName: string, args: string[]) => {
    try {
      const visualizeNmfModule = await import("./commands/visualize-nmf.js");
      const visualizeNmfCommand = visualizeNmfModule.visualizeNmfCommand;
      const visualizeNxModule = await import("./commands/visualize-nx.js");
      const visualizeNxCommand = visualizeNxModule.visualizeNxCommand;
      const { sepCommand } = await import("./commands/sep.js");
      const { nxCommand } = await import("./commands/nx.js");

      const commands: Record<string, typeof visualizeNmfCommand> = {
        "visualize-nmf": visualizeNmfCommand,
        "visualize-nx": visualizeNxCommand,
        "sep": sepCommand,
        "nx": nxCommand,
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

// Lazily loaded TypeScript transpiler — runs in the main process where require() is always available
let _ts: typeof import("typescript") | null = null;
function getMainTs(): typeof import("typescript") {
  if (!_ts) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _ts = require("typescript") as typeof import("typescript");
  }
  return _ts;
}

ipcMain.handle("transpile-typescript", (_event, source: string): string => {
  return getMainTs().transpileModule(source, {
    compilerOptions: {
      target: 99 /* ScriptTarget.ESNext */,
      module: 1 /* ModuleKind.CommonJS */,
      esModuleInterop: true,
    },
  }).outputText;
});

ipcMain.handle(
  "corpus-build",
  async (_event, sourceHash: string, featureHash: string) => {
    try {
      if (!dbManager) throw new Error("Database not ready.");
      return corpusManager.build(dbManager, sourceHash, featureHash);
    } catch (error) {
      throw new Error(`corpus-build failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
);

ipcMain.handle(
  "corpus-query",
  async (_event, segmentIndex: number, k = 5) => {
    try {
      return corpusManager.query(segmentIndex, k);
    } catch (error) {
      throw new Error(`corpus-query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
);

ipcMain.handle(
  "corpus-resynthesize",
  async (_event, indices: number[]) => {
    try {
      return corpusManager.resynthesize(indices);
    } catch (error) {
      throw new Error(`corpus-resynthesize failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
);

// ---------------------------------------------------------------------------
// Filesystem utilities
// ---------------------------------------------------------------------------

export type FileType =
  | "file"
  | "directory"
  | "symlink"
  | "blockDevice"
  | "charDevice"
  | "fifo"
  | "socket"
  | "unknown";

export interface FsEntry {
  name: string;
  path: string;
  type: FileType;
  isAudio: boolean;
}

export interface WalkEntry {
  path: string;
  type: FileType;
}

function direntToFileType(d: fs.Dirent): FileType {
  if (d.isFile()) return "file";
  if (d.isDirectory()) return "directory";
  if (d.isSymbolicLink()) return "symlink";
  if (d.isBlockDevice()) return "blockDevice";
  if (d.isCharacterDevice()) return "charDevice";
  if (d.isFIFO()) return "fifo";
  if (d.isSocket()) return "socket";
  return "unknown";
}

ipcMain.handle(
  "fs-ls",
  async (_event, dirPath: string | undefined, showHidden: boolean) => {
    const resolved = dirPath ? resolvePath(dirPath) : (settingsStore?.getCwd() ?? os.homedir());
    const dirents = await fs.promises.readdir(resolved, { withFileTypes: true });
    const entries: FsEntry[] = [];
    for (const d of dirents) {
      if (!showHidden && d.name.startsWith(".")) continue;
      const type = direntToFileType(d);
      const ext = path.extname(d.name).toLowerCase();
      entries.push({
        name: d.name,
        path: path.join(resolved, d.name),
        type,
        isAudio: type === "file" && (AUDIO_EXTENSIONS as readonly string[]).includes(ext),
      });
      if (entries.length >= 200) break;
    }
    const total = dirents.filter((d) => showHidden || !d.name.startsWith(".")).length;
    return { entries, total, truncated: total > 200 };
  },
);

ipcMain.handle("fs-cd", async (_event, dirPath: string) => {
  const resolved = resolvePath(dirPath);
  const stat = await fs.promises.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  settingsStore?.setCwd(resolved);
  return resolved;
});

ipcMain.handle("fs-pwd", () => settingsStore?.getCwd() ?? os.homedir());

ipcMain.handle("fs-glob", async (_event, pattern: string) => {
  const cwd = settingsStore?.getCwd() ?? os.homedir();
  const results: string[] = [];
  // fs.promises.glob is available in Node.js 22+
  const globFn = (fs.promises as Record<string, unknown>)["glob"] as
    | ((pattern: string, opts: { cwd: string }) => AsyncIterable<string>)
    | undefined;
  if (globFn) {
    for await (const p of globFn(pattern, { cwd })) {
      results.push(path.resolve(cwd, p));
    }
  } else {
    throw new Error("fs.promises.glob is not available in this Node.js version (requires Node 22+).");
  }
  return results.sort();
});

ipcMain.handle("fs-walk", async (_event, dirPath: string) => {
  const resolved = resolvePath(dirPath);
  const dirents = await fs.promises.readdir(resolved, {
    recursive: true,
    withFileTypes: true,
  });
  const entries: WalkEntry[] = [];
  for (const d of dirents) {
    if (entries.length >= 10_000) break;
    const parentPath = typeof d.parentPath === "string" ? d.parentPath : (d as unknown as { path: string }).path ?? resolved;
    entries.push({
      path: path.join(parentPath, d.name),
      type: direntToFileType(d),
    });
  }
  return { entries, truncated: dirents.length > 10_000 };
});

app.whenReady().then(() => {
  dbManager = new DatabaseManager();
  settingsStore = new SettingsStore();
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
