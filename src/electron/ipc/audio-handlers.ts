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
}
