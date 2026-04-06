import * as fs from "fs";
import * as path from "path";
import { createInProcessPair } from "../../src/shared/rpc/connection";
import { createStateClient } from "../../src/shared/rpc/state.rpc";
import { createAudioFileClient } from "../../src/shared/rpc/audio-file.rpc";
import { createFilesystemClient } from "../../src/shared/rpc/filesystem.rpc";
import type { MessageConnection } from "vscode-jsonrpc";
import { StateService } from "../../src/electron/services/state";
import { AudioFileService } from "../../src/electron/services/audio-file";
import { FilesystemService } from "../../src/electron/services/filesystem";
import { InMemoryStateStorage } from "./in-memory-storage";

export interface WorkflowServices {
  stateClient: ReturnType<typeof createStateClient>;
  audioFileClient: ReturnType<typeof createAudioFileClient>;
  filesystemClient: ReturnType<typeof createFilesystemClient>;
}

/**
 * Boot workflow-test services backed by InMemoryStateStorage.
 * No SQLite, no native addons, no Electron — runs under plain Node (tsx).
 *
 * Services communicate over in-process JSON-RPC connections (vscode-jsonrpc)
 * using an EventEmitter-based transport — no streams, no serialisation overhead.
 */
export function bootServices(): {
  ctx: WorkflowServices & Record<string, unknown>;
  cleanup: () => void;
} {
  const storage = new InMemoryStateStorage();
  const stateService = new StateService(storage);

  // Wire state service.
  const statePair = createInProcessPair();
  stateService.listen(statePair.server);
  statePair.server.listen();
  statePair.client.listen();
  const stateClient = createStateClient(statePair.client);

  // Wire audio file service (depends on stateClient).
  const audioFileService = new AudioFileService(stateClient);
  const audioFilePair = createInProcessPair();
  audioFileService.listen(audioFilePair.server);
  audioFilePair.server.listen();
  audioFilePair.client.listen();
  const audioFileClient = createAudioFileClient(audioFilePair.client);

  // Wire filesystem service (depends on stateClient).
  const filesystemService = new FilesystemService(stateClient);
  const fsPair = createInProcessPair();
  filesystemService.listen(fsPair.server);
  fsPair.server.listen();
  fsPair.client.listen();
  const filesystemClient = createFilesystemClient(fsPair.client);

  const connections: MessageConnection[] = [
    statePair.client, statePair.server,
    audioFilePair.client, audioFilePair.server,
    fsPair.client, fsPair.server,
  ];

  return {
    ctx: { stateClient, audioFileClient, filesystemClient },
    cleanup: () => {
      for (const conn of connections) conn.dispose();
      stateService.close();
    },
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
