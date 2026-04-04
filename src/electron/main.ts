import { app, BrowserWindow, ipcMain, session, MessageChannelMain, utilityProcess, type UtilityProcess } from "electron";
import * as path from "path";
import * as fs from "fs";
import { DatabaseManager } from "./database";
import { setDatabaseManager } from "./logger";
import { CorpusManager } from "./corpus-manager";
import { SettingsStore } from "./settings-store";
import { registerAllHandlers } from "./ipc/register";
import { logBackgroundError } from "./logger";
import { LanguageServiceManager } from "./language-service-manager";

let dbManager: DatabaseManager | undefined = undefined;
let settingsStore: SettingsStore | undefined = undefined;
const corpusManager: CorpusManager = new CorpusManager();

// ---------------------------------------------------------------------------
// Audio engine utility process state
// ---------------------------------------------------------------------------
let audioEngineProcess: UtilityProcess | null = null;
let audioEnginePort: Electron.MessagePortMain | null = null;

// ---------------------------------------------------------------------------
// Language Service manager
// ---------------------------------------------------------------------------
export const languageServiceManager = new LanguageServiceManager();

function shutdownRuntimeResources(): void {
  audioEnginePort?.close();
  audioEnginePort = null;

  if (audioEngineProcess) {
    const pid = audioEngineProcess.pid;
    audioEngineProcess.kill();
    audioEngineProcess = null;
    // SIGTERM alone may not interrupt blocking C++ audio threads (miniaudio).
    // Force-kill with SIGKILL so zombie utility processes don't accumulate
    // across sequential test runs and block subsequent audio device opens.
    if (pid !== undefined) {
      try { process.kill(pid, "SIGKILL"); } catch { /* already dead */ }
    }
  }

  languageServiceManager.shutdown();

  if (dbManager) {
    dbManager.close();
    dbManager = undefined;
  }
}

const userDataOverride = process.env.BOUNCE_USER_DATA_PATH;
if (userDataOverride) {
  fs.mkdirSync(userDataOverride, { recursive: true });
  app.setPath("userData", userDataOverride);
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

  startAudioEngineProcess(mainWindow);
  languageServiceManager.start();
}

// ---------------------------------------------------------------------------
// Audio engine utility process
// ---------------------------------------------------------------------------
function startAudioEngineProcess(mainWindow: BrowserWindow): void {
  const scriptPath = path.join(__dirname, "../utility/audio-engine-process.js");

  const { port1, port2 } = new MessageChannelMain();
  audioEnginePort = port2;

  audioEngineProcess = utilityProcess.fork(scriptPath, [], {
    serviceName: "bounce-audio-engine",
  });

  // Transfer port1 to the utility process so it can receive control messages
  audioEngineProcess.postMessage({ type: "init" }, [port1]);

  // Listen for telemetry on port2
  port2.on("message", (event) => {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    const data = event.data as {
      type: string;
      sampleHash?: string;
      positionInSamples?: number;
      code?: string;
      message?: string;
      channelPeaksL?: number[];
      channelPeaksR?: number[];
      masterPeakL?: number;
      masterPeakR?: number;
      // Transport telemetry
      absoluteTick?: number;
      bar?: number;
      beat?: number;
      step?: number;
      // Device info
      sampleRate?: number;
      bufferSize?: number;
    };
    if (data.type === "position" && data.sampleHash !== undefined) {
      mainWindow.webContents.send("playback-position", {
        hash: data.sampleHash,
        positionInSamples: data.positionInSamples ?? 0,
      });
    } else if (data.type === "ended" && data.sampleHash !== undefined) {
      mainWindow.webContents.send("playback-ended", { hash: data.sampleHash });
    } else if (data.type === "mixer-levels") {
      mainWindow.webContents.send("mixer-levels", {
        channelPeaksL: data.channelPeaksL ?? [],
        channelPeaksR: data.channelPeaksR ?? [],
        masterPeakL: data.masterPeakL ?? 0,
        masterPeakR: data.masterPeakR ?? 0,
      });
    } else if (data.type === "transport-tick") {
      mainWindow.webContents.send("transport-tick", {
        absoluteTick: data.absoluteTick ?? 0,
        bar: data.bar ?? 0,
        beat: data.beat ?? 0,
        step: data.step ?? 0,
      });
    } else if (data.type === "audio-device-info") {
      mainWindow.webContents.send("audio-device-info", {
        sampleRate: data.sampleRate ?? 0,
        bufferSize: data.bufferSize ?? 0,
      });
    } else if (data.type === "error") {
      mainWindow.webContents.send("playback-error", {
        sampleHash: data.sampleHash,
        code: data.code ?? "AUDIO_ENGINE_ERROR",
        message: data.message ?? "Unknown audio engine error",
      });
    }
  });
  port2.start();

  audioEngineProcess.on("exit", (code) => {
    console.error(`[main] Audio engine process exited with code ${code}. Audio playback unavailable.`);
    if (code !== 0 && code !== null) {
      logBackgroundError(
        "audio-engine",
        "AUDIO_ENGINE_EXITED",
        `Audio engine process exited with code ${code}. Audio playback is unavailable.`,
      );
    }
    audioEnginePort?.close();
    audioEnginePort = null;
    audioEngineProcess = null;
  });
}

// ---------------------------------------------------------------------------
// Register all IPC handlers
// ---------------------------------------------------------------------------
registerAllHandlers({
  get dbManager() { return dbManager!; },
  get settingsStore() { return settingsStore!; },
  corpusManager,
  getAudioEnginePort: () => audioEnginePort,
  getMainWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
  languageServiceManager,
});

// ---------------------------------------------------------------------------
// Force-shutdown IPC — allows tests to trigger a clean teardown of the audio
// engine utility process + database before the Electron app exits.
// ---------------------------------------------------------------------------
ipcMain.on("force-shutdown", () => {
  shutdownRuntimeResources();
  app.exit(0);
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  settingsStore = new SettingsStore();
  dbManager = new DatabaseManager();
  const storedProjectName = settingsStore.getCurrentProjectName();
  if (storedProjectName) {
    const storedProject = dbManager.getProjectByName(storedProjectName);
    if (storedProject) {
      dbManager.setCurrentProjectByName(storedProject.name);
    } else {
      const fallback = dbManager.setCurrentProjectByName("default");
      settingsStore.setCurrentProjectName(fallback.name);
    }
  } else {
    settingsStore.setCurrentProjectName(dbManager.getCurrentProject().name);
  }
  setDatabaseManager(dbManager);

  // Grant microphone access to the renderer so getUserMedia / MediaRecorder work.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  shutdownRuntimeResources();
  if (process.platform !== "darwin") {
    // Use app.exit() rather than app.quit() so the process terminates
    // unconditionally without waiting for active libuv handles (timers, IPC
    // channels, etc.) that can cause 30 s hangs in sequential test runs.
    app.exit(0);
  }
});
