import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import type { MessageConnection } from "vscode-jsonrpc";
import decode from "audio-decode";
import { SettingsStore } from "../../settings-store";
import { AUDIO_EXTENSIONS } from "../../audio-extensions";
import { BounceError } from "../../../shared/bounce-error.js";
import {
  registerAudioFileHandlers,
  createAudioFileClient,
} from "../../../shared/rpc/audio-file.rpc";
import type {
  AudioFileHandlers,
  AudioFileRpc,
  ReadAudioFileResult,
} from "../../../shared/rpc/audio-file.rpc";
import type { EventBus } from "../../../shared/event-bus";
import type { ISampleQuery, ICwdQuery } from "../../../shared/query-interfaces";
import type { SampleListRecord } from "../../../shared/domain-types";

/**
 * AudioFileService — decode audio files, compute hashes, persist via EventBus.
 *
 * Writes a SampleLoadedEvent to the bus on each new file read.
 * Reads (getSampleByHash, listSamples) delegate to ISampleQuery / ICwdQuery.
 */
export class AudioFileService implements AudioFileHandlers {
  constructor(
    private bus: EventBus,
    private sampleQuery: ISampleQuery,
    private cwdQuery: ICwdQuery,
  ) {}

  async readAudioFile(params: { filePathOrHash: string }): Promise<ReadAudioFileResult> {
    const { filePathOrHash } = params;

    // --- Hash-based lookup ---
    const isHash =
      /^[0-9a-f]{8,}$/i.test(filePathOrHash) &&
      !filePathOrHash.includes("/") &&
      !filePathOrHash.includes("\\");

    if (isHash) {
      const sample = await this.sampleQuery.getSampleByHash(filePathOrHash);
      if (!sample) {
        throw new BounceError(
          "SAMPLE_NOT_FOUND",
          `Sample with hash "${filePathOrHash.substring(0, 8)}..." not found in database.`,
        );
      }
      const rawMeta = await this.sampleQuery.getRawMetadata(sample.hash);
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
    let resolvedPath = filePathOrHash;
    if (!path.isAbsolute(filePathOrHash)) {
      const expanded = SettingsStore.expandHome(filePathOrHash);
      const cwd = await this.cwdQuery.getCwd();
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

      this.bus.emit({
        type: "SampleLoaded",
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

  async listSamples(_params: Record<string, never>): Promise<SampleListRecord[]> {
    return this.sampleQuery.listSamples();
  }

  async storeRecording(params: AudioFileRpc["storeRecording"]["params"]): Promise<{ status: "ok" | "exists"; hash?: string; id?: number }> {
    const { name, pcm, sampleRate, channels, duration, overwrite } = params;
    const existing = await this.sampleQuery.getSampleByRecordingName(name);
    if (existing && !overwrite) {
      return { status: "exists" };
    }

    const pcmBuffer = Buffer.from(new Float32Array(pcm).buffer);
    const hash = crypto.createHash("sha256").update(pcmBuffer).digest("hex");

    this.bus.emit([{
      type: "RecordingStored" as const,
      hash,
      name,
      sampleRate,
      channels,
      duration,
    }]);

    const sample = await this.sampleQuery.getSampleByHash(hash);
    return { status: "ok", hash, id: sample?.id };
  }

  listen(connection: MessageConnection): void {
    registerAudioFileHandlers(connection, this);
  }

  asClient(clientConnection: MessageConnection): ReturnType<typeof createAudioFileClient> {
    return createAudioFileClient(clientConnection);
  }
}
