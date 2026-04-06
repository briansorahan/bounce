import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import decode from "audio-decode";
import { SettingsStore } from "../../settings-store";
import { AUDIO_EXTENSIONS } from "../../audio-extensions";
import { BounceError } from "../../../shared/bounce-error.js";
import type { ServiceHandlers, ServiceClient } from "../../../shared/rpc/types";
import { createInProcessClient } from "../../../shared/rpc/types";
import type { AudioFileRpc, ReadAudioFileResult } from "../../../shared/rpc/audio-file.rpc";
import type { StateRpc } from "../../../shared/rpc/state.rpc";

/**
 * AudioFileService — decode audio files, compute hashes, persist via StateService.
 *
 * Stateless except for its dependency on StateService. Never accesses SQLite
 * directly. CPU-light (decode + hash) — runs in the main process.
 *
 * Constructor dependency: StateService (via ServiceClient<StateRpc>).
 */
export class AudioFileService implements ServiceHandlers<AudioFileRpc> {
  constructor(private state: ServiceClient<StateRpc>) {}

  async readAudioFile(params: { filePathOrHash: string }): Promise<ReadAudioFileResult> {
    const { filePathOrHash } = params;

    // --- Hash-based lookup ---
    const isHash =
      /^[0-9a-f]{8,}$/i.test(filePathOrHash) &&
      !filePathOrHash.includes("/") &&
      !filePathOrHash.includes("\\");

    if (isHash) {
      const sample = await this.state.invoke("getSampleByHash", { hash: filePathOrHash });
      if (!sample) {
        throw new BounceError(
          "SAMPLE_NOT_FOUND",
          `Sample with hash "${filePathOrHash.substring(0, 8)}..." not found in database.`,
        );
      }
      const rawMeta = await this.state.invoke("getRawMetadata", { hash: sample.hash });
      if (!rawMeta) {
        throw new BounceError("SAMPLE_NOT_FOUND", `No file path found for sample hash "${sample.hash.substring(0, 8)}..."`);
      }
      const fileBuffer = fs.readFileSync(rawMeta.file_path);
      const audioBuffer = await decode(fileBuffer);
      const channelData = audioBuffer.getChannelData(0);
      return {
        channelData: Array.from(channelData),
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        hash: sample.hash,
        filePath: rawMeta.file_path,
      };
    }

    // --- File path ---
    // Resolve relative paths against the stored cwd.
    let resolvedPath = filePathOrHash;
    if (!path.isAbsolute(filePathOrHash)) {
      const expanded = SettingsStore.expandHome(filePathOrHash);
      const cwd = await this.state.invoke("getCwd", {});
      resolvedPath = path.resolve(cwd, expanded);
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (!(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new BounceError(
        "SAMPLE_READ_FAILED",
        `Unsupported file format: ${ext || "(no extension)"}`,
      );
    }

    try {
      const fileBuffer = fs.readFileSync(resolvedPath);
      const audioBuffer = await decode(fileBuffer);
      const channelData = audioBuffer.getChannelData(0);

      const audioDataBuffer = Buffer.from(channelData.buffer);
      const hash = crypto.createHash("sha256").update(audioDataBuffer).digest("hex");

      await this.state.invoke("storeRawSample", {
        hash,
        filePath: resolvedPath,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        duration: audioBuffer.duration,
      });

      return {
        channelData: Array.from(channelData),
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        hash,
        filePath: resolvedPath,
      };
    } catch (error) {
      if (error instanceof BounceError) throw error;
      throw new BounceError(
        "SAMPLE_READ_FAILED",
        `Failed to read audio file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async listSamples(_params: Record<string, never>) {
    return this.state.invoke("listSamples", {});
  }

  /** Expose a type-safe ServiceClient backed by direct in-process calls. */
  asClient(): ServiceClient<AudioFileRpc> {
    return createInProcessClient<AudioFileRpc>(this);
  }
}
