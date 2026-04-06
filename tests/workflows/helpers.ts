import * as fs from "fs";
import * as path from "path";
import type { ServiceClient } from "../../src/shared/rpc/types";
import type { StateRpc } from "../../src/shared/rpc/state.rpc";
import type { AudioFileRpc } from "../../src/shared/rpc/audio-file.rpc";
import { StateService } from "../../src/electron/services/state";
import { AudioFileService } from "../../src/electron/services/audio-file";
import { InMemoryStateStorage } from "./in-memory-storage";

export interface WorkflowServices {
  stateService: StateService;
  stateClient: ServiceClient<StateRpc>;
  audioFileService: AudioFileService;
  audioFileClient: ServiceClient<AudioFileRpc>;
}

/**
 * Boot workflow-test services backed by InMemoryStateStorage.
 * No SQLite, no native addons, no Electron — runs under plain Node (tsx).
 */
export function bootServices(): {
  ctx: WorkflowServices & Record<string, unknown>;
  cleanup: () => void;
} {
  const storage = new InMemoryStateStorage();
  const stateService = new StateService(storage);
  const stateClient = stateService.asClient();
  const audioFileService = new AudioFileService(stateClient);
  const audioFileClient = audioFileService.asClient();

  return {
    ctx: { stateService, stateClient, audioFileService, audioFileClient },
    cleanup: () => stateService.close(),
  };
}

/**
 * Create a minimal valid WAV file for testing.
 * 440 Hz sine wave, 44100 Hz, mono, 16-bit PCM.
 */
export function createTestWav(filePath: string, durationSeconds = 0.2): void {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * 440 * t);
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

/**
 * Write a plain text file that is NOT a valid audio file.
 */
export function createTextFile(filePath: string): void {
  fs.writeFileSync(filePath, "this is not an audio file\n");
}
