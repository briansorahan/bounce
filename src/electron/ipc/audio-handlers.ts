import { ipcMain, dialog } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as crypto from "crypto";
import decode from "audio-decode";
import { SettingsStore } from "../settings-store";
import { AUDIO_EXTENSIONS, AUDIO_EXTENSIONS_NO_DOT } from "../audio-extensions";
import { debugLog } from "../logger";
import { BounceError } from "../../shared/bounce-error.js";
import type { HandlerDeps } from "./register";

/** Resolve a path against the stored cwd, expanding ~ and handling relative paths. */
function resolvePath(settingsStore: SettingsStore | undefined, inputPath: string): string {
  const expanded = SettingsStore.expandHome(inputPath);
  if (path.isAbsolute(expanded)) return expanded;
  const cwd = settingsStore?.getCwd() ?? os.homedir();
  return path.resolve(cwd, expanded);
}

export function registerAudioHandlers(deps: HandlerDeps): void {
  const { getAudioEnginePort } = deps;

  ipcMain.handle("read-audio-file", async (_event, filePathOrHash: string) => {
    try {
      // Check if it's a hash (8+ hex characters without path separators)
      const isHash =
        /^[0-9a-f]{8,}$/i.test(filePathOrHash) &&
        !filePathOrHash.includes("/") &&
        !filePathOrHash.includes("\\");

      if (isHash && deps.dbManager) {
        // Look up in database by hash prefix
        debugLog("info", "[AudioLoader] Looking up sample by hash", {
          hash: filePathOrHash,
        });
        const sample = deps.dbManager.getSampleByHash(filePathOrHash);
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
        throw new BounceError("SAMPLE_NOT_FOUND", `Sample with hash "${filePathOrHash.substring(0, 8)}..." not found in database.`);
      }

      let resolvedPath = filePathOrHash;

      if (!path.isAbsolute(filePathOrHash)) {
        const expanded = SettingsStore.expandHome(filePathOrHash);
        const hasPathSep = expanded.includes("/") || expanded.includes("\\");
        const ext = path.extname(expanded).toLowerCase();
        const isAudioFile =
          (AUDIO_EXTENSIONS as readonly string[]).includes(ext) || hasPathSep;

        if (isAudioFile) {
          resolvedPath = resolvePath(deps.settingsStore, filePathOrHash);
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
      if (deps.dbManager) {
        deps.dbManager.storeSample(
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
      throw new BounceError(
        "SAMPLE_READ_FAILED",
        `Failed to read audio file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  ipcMain.handle(
    "store-recording",
    async (
      _event,
      name: string,
      audioData: number[],
      sampleRate: number,
      channels: number,
      duration: number,
      overwrite: boolean,
    ) => {
      if (!deps.dbManager) throw new BounceError("AUDIO_DB_NOT_READY", "Database not initialised");

      const existing = deps.dbManager.getSampleByPath(name);
      if (existing && !overwrite) {
        return { status: "exists" as const };
      }

      const pcm = new Float32Array(audioData);
      const audioDataBuffer = Buffer.from(pcm.buffer);
      const hash = crypto.createHash("sha256").update(audioDataBuffer).digest("hex");

      deps.dbManager.storeSample(hash, name, audioDataBuffer, sampleRate, channels, duration);

      const stored = deps.dbManager.getSampleByHash(hash);
      return {
        status: "ok" as const,
        hash,
        id: stored?.id,
        sampleRate,
        channels,
        duration,
        filePath: name,
      };
    },
  );

  ipcMain.on("play-sample", (_event, payload: { hash: string; loop: boolean }) => {
    const port = getAudioEnginePort();
    if (!deps.dbManager || !port) {
      const mainWindow = deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("playback-error", {
          sampleHash: payload.hash,
          code: "AUDIO_ENGINE_NOT_READY",
          message: "Audio engine or database not available",
        });
      }
      return;
    }

    const sample = deps.dbManager.getSampleByHash(payload.hash);
    if (!sample || !sample.audio_data) {
      console.error(`[main] play-sample: sample not found for hash ${payload.hash}`);
      const mainWindow = deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("playback-error", {
          sampleHash: payload.hash,
          code: "SAMPLE_NOT_FOUND",
          message: `Sample not found for hash ${payload.hash}`,
        });
      }
      return;
    }

    const pcm = new Float32Array(
      sample.audio_data.buffer,
      sample.audio_data.byteOffset,
      sample.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );

    // Transfer the ArrayBuffer zero-copy to the utility process
    const pcmCopy = new Float32Array(pcm);
    port.postMessage(
      { type: "play", sampleHash: payload.hash, pcm: pcmCopy, sampleRate: sample.sample_rate, loop: payload.loop },
    );
  });

  ipcMain.on("stop-sample", (_event, payload?: { hash?: string }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    if (payload?.hash) {
      port.postMessage({ type: "stop", sampleHash: payload.hash });
    } else {
      port.postMessage({ type: "stop-all" });
    }
  });

  // ---- Instrument IPC handlers ----

  ipcMain.on("define-instrument", (_event, payload: {
    instrumentId: string; kind: string; polyphony: number; name?: string;
  }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    port.postMessage({
      type: "define-instrument",
      instrumentId: payload.instrumentId,
      kind: payload.kind,
      polyphony: payload.polyphony,
    });
  });

  ipcMain.on("free-instrument", (_event, payload: { instrumentId: string }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    port.postMessage({ type: "free-instrument", instrumentId: payload.instrumentId });
  });

  ipcMain.on("load-instrument-sample", (_event, payload: {
    instrumentId: string; note: number; sampleHash: string;
  }) => {
    const port = getAudioEnginePort();
    if (!deps.dbManager || !port) return;

    const sample = deps.dbManager.getSampleByHash(payload.sampleHash);
    if (!sample || !sample.audio_data) return;

    const pcm = new Float32Array(
      sample.audio_data.buffer,
      sample.audio_data.byteOffset,
      sample.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
    const pcmCopy = new Float32Array(pcm);

    port.postMessage({
      type: "load-instrument-sample",
      instrumentId: payload.instrumentId,
      note: payload.note,
      pcm: pcmCopy,
      sampleRate: sample.sample_rate,
      sampleHash: payload.sampleHash,
    });
  });

  ipcMain.on("instrument-note-on", (_event, payload: {
    instrumentId: string; note: number; velocity: number;
  }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    port.postMessage({
      type: "instrument-note-on",
      instrumentId: payload.instrumentId,
      note: payload.note,
      velocity: payload.velocity,
    });
  });

  ipcMain.on("instrument-note-off", (_event, payload: {
    instrumentId: string; note: number;
  }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    port.postMessage({
      type: "instrument-note-off",
      instrumentId: payload.instrumentId,
      note: payload.note,
    });
  });

  ipcMain.on("instrument-stop-all", (_event, payload: { instrumentId: string }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    port.postMessage({ type: "instrument-stop-all", instrumentId: payload.instrumentId });
  });

  ipcMain.on("set-instrument-param", (_event, payload: {
    instrumentId: string; paramId: number; value: number;
  }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    port.postMessage({
      type: "set-instrument-param",
      instrumentId: payload.instrumentId,
      paramId: payload.paramId,
      value: payload.value,
    });
  });

  ipcMain.on("subscribe-instrument-telemetry", (_event, payload: { instrumentId: string }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    port.postMessage({ type: "subscribe-instrument-telemetry", instrumentId: payload.instrumentId });
  });

  ipcMain.on("unsubscribe-instrument-telemetry", (_event, payload: { instrumentId: string }) => {
    const port = getAudioEnginePort();
    if (!port) return;
    port.postMessage({ type: "unsubscribe-instrument-telemetry", instrumentId: payload.instrumentId });
  });

  // ---- Instrument DB persistence (invoke-based) ----

  ipcMain.handle("create-db-instrument", (_event, name: string, kind: string, config?: Record<string, unknown>) => {
    if (!deps.dbManager) throw new BounceError("AUDIO_DB_NOT_READY", "Database not initialised");
    return deps.dbManager.createInstrument(name, kind, config);
  });

  ipcMain.handle("delete-db-instrument", (_event, name: string) => {
    if (!deps.dbManager) throw new BounceError("AUDIO_DB_NOT_READY", "Database not initialised");
    return deps.dbManager.deleteInstrument(name);
  });

  ipcMain.handle("add-db-instrument-sample", (_event, instrumentName: string, sampleHash: string, noteNumber: number) => {
    if (!deps.dbManager) throw new BounceError("AUDIO_DB_NOT_READY", "Database not initialised");
    const instrument = deps.dbManager.getInstrument(instrumentName);
    if (!instrument) throw new BounceError("INSTRUMENT_NOT_FOUND", `Instrument '${instrumentName}' not found`);
    deps.dbManager.addInstrumentSample(instrument.id, sampleHash, noteNumber);
  });

  ipcMain.handle("remove-db-instrument-sample", (_event, instrumentName: string, sampleHash: string, noteNumber: number) => {
    if (!deps.dbManager) throw new BounceError("AUDIO_DB_NOT_READY", "Database not initialised");
    const instrument = deps.dbManager.getInstrument(instrumentName);
    if (!instrument) return false;
    return deps.dbManager.removeInstrumentSample(instrument.id, sampleHash, noteNumber);
  });

  ipcMain.handle("list-db-instruments", () => {
    if (!deps.dbManager) throw new BounceError("AUDIO_DB_NOT_READY", "Database not initialised");
    return deps.dbManager.listInstruments();
  });

  ipcMain.handle("get-db-instrument-samples", (_event, instrumentName: string) => {
    if (!deps.dbManager) throw new BounceError("AUDIO_DB_NOT_READY", "Database not initialised");
    const instrument = deps.dbManager.getInstrument(instrumentName);
    if (!instrument) return [];
    return deps.dbManager.getInstrumentSamples(instrument.id);
  });
}
