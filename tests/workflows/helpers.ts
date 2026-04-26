import * as fs from "fs";
import * as path from "path";
import { createInProcessPair } from "../../src/shared/rpc/connection";
import { createAudioFileClient } from "../../src/shared/rpc/audio-file.rpc";
import { createAnalysisClient } from "../../src/shared/rpc/analysis.rpc";
import { createFilesystemClient } from "../../src/shared/rpc/filesystem.rpc";
import { createProjectClient } from "../../src/shared/rpc/project.rpc";
import { createInstrumentClient } from "../../src/shared/rpc/instrument.rpc";
import { createMidiClient } from "../../src/shared/rpc/midi.rpc";
import { createMixerClient } from "../../src/shared/rpc/mixer.rpc";
import { createReplEnvClient } from "../../src/shared/rpc/repl-env.rpc";
import { createAudioEngineClient } from "../../src/shared/rpc/audio-engine.rpc";
import { createGrainsClient } from "../../src/shared/rpc/granularize.rpc";
import type { MessageConnection } from "vscode-jsonrpc";
import { EventBusImpl } from "../../src/shared/event-bus";
import { AudioFileService } from "../../src/electron/services/audio-file";
import { AnalysisService } from "../../src/electron/services/analysis/service";
import { FilesystemService } from "../../src/electron/services/filesystem";
import { ProjectService } from "../../src/electron/services/project";
import { InstrumentService } from "../../src/electron/services/instrument";
import { MidiService } from "../../src/electron/services/midi";
import { MixerService } from "../../src/electron/services/mixer";
import { ReplEnvService } from "../../src/electron/services/repl-env";
import { MockAudioEngineService } from "./mock-audio-engine";
import { GrainsService } from "../../src/electron/services/granularize";
import { InMemoryStore } from "./in-memory-store";
import { InMemoryPersistenceService, InMemoryQueryService } from "./in-memory-query-service";
import type { IQueryService } from "../../src/shared/query-interfaces";

export interface WorkflowServices {
  projectClient: ReturnType<typeof createProjectClient>;
  audioFileClient: ReturnType<typeof createAudioFileClient>;
  analysisClient: ReturnType<typeof createAnalysisClient>;
  filesystemClient: ReturnType<typeof createFilesystemClient>;
  instrumentClient: ReturnType<typeof createInstrumentClient>;
  midiClient: ReturnType<typeof createMidiClient>;
  mixerClient: ReturnType<typeof createMixerClient>;
  replEnvClient: ReturnType<typeof createReplEnvClient>;
  audioEngineClient: ReturnType<typeof createAudioEngineClient>;
  grainsClient: ReturnType<typeof createGrainsClient>;
  queryService: IQueryService;
}

/**
 * Boot workflow-test services backed by InMemoryStore + EventBus.
 *
 * No SQLite, no native addons, no Electron — runs under plain Node (tsx).
 *
 * EventBusImpl calls handlers synchronously so InMemoryPersistenceService
 * applies events inline. Queries see updated state immediately after any write.
 */
export function bootServices(): {
  ctx: WorkflowServices & Record<string, unknown>;
  cleanup: () => void;
} {
  const store = new InMemoryStore();
  const bus = new EventBusImpl();
  new InMemoryPersistenceService(bus, store);
  const queryService = new InMemoryQueryService(store);

  // ProjectService writes directly to the store (strong consistency).
  const projectService = new ProjectService(store, bus, queryService);
  const projectPair = createInProcessPair();
  projectService.listen(projectPair.server);
  projectPair.server.listen();
  projectPair.client.listen();
  const projectClient = createProjectClient(projectPair.client);

  // AudioFileService emits events to bus, reads via queryService.
  const audioFileService = new AudioFileService(bus, queryService, queryService);
  const audioFilePair = createInProcessPair();
  audioFileService.listen(audioFilePair.server);
  audioFilePair.server.listen();
  audioFilePair.client.listen();
  const audioFileClient = createAudioFileClient(audioFilePair.client);

  // AnalysisService — pure FluCoMa dispatch, no Electron, no storage.
  const analysisService = new AnalysisService();
  const analysisPair = createInProcessPair();
  analysisService.listen(analysisPair.server);
  analysisPair.server.listen();
  analysisPair.client.listen();
  const analysisClient = createAnalysisClient(analysisPair.client);

  // FilesystemService emits CwdChanged events, reads cwd via queryService.
  const filesystemService = new FilesystemService(bus, queryService);
  const fsPair = createInProcessPair();
  filesystemService.listen(fsPair.server);
  fsPair.server.listen();
  fsPair.client.listen();
  const filesystemClient = createFilesystemClient(fsPair.client);

  // InstrumentService.
  const instrumentService = new InstrumentService(bus, queryService, queryService);
  const instrumentPair = createInProcessPair();
  instrumentService.listen(instrumentPair.server);
  instrumentPair.server.listen();
  instrumentPair.client.listen();
  const instrumentClient = createInstrumentClient(instrumentPair.client);

  // MidiService.
  const midiService = new MidiService(bus, queryService);
  const midiPair = createInProcessPair();
  midiService.listen(midiPair.server);
  midiPair.server.listen();
  midiPair.client.listen();
  const midiClient = createMidiClient(midiPair.client);

  // MixerService.
  const mixerService = new MixerService(bus, queryService);
  const mixerPair = createInProcessPair();
  mixerService.listen(mixerPair.server);
  mixerPair.server.listen();
  mixerPair.client.listen();
  const mixerClient = createMixerClient(mixerPair.client);

  // ReplEnvService.
  const replEnvService = new ReplEnvService(bus, queryService);
  const replEnvPair = createInProcessPair();
  replEnvService.listen(replEnvPair.server);
  replEnvPair.server.listen();
  replEnvPair.client.listen();
  const replEnvClient = createReplEnvClient(replEnvPair.client);

  // GrainsService — pure computation, no database.
  const grainsService = new GrainsService();
  const grainsPair = createInProcessPair();
  grainsService.listen(grainsPair.server);
  grainsPair.server.listen();
  grainsPair.client.listen();
  const grainsClient = createGrainsClient(grainsPair.client);

  // MockAudioEngineService — pure TypeScript mock, no native addon.
  const audioEngineService = new MockAudioEngineService();
  const audioEnginePair = createInProcessPair();
  audioEngineService.listen(audioEnginePair.server);
  audioEnginePair.server.listen();
  audioEnginePair.client.listen();
  const audioEngineClient = createAudioEngineClient(audioEnginePair.client);

  const connections: MessageConnection[] = [
    projectPair.client, projectPair.server,
    audioFilePair.client, audioFilePair.server,
    analysisPair.client, analysisPair.server,
    fsPair.client, fsPair.server,
    instrumentPair.client, instrumentPair.server,
    midiPair.client, midiPair.server,
    mixerPair.client, mixerPair.server,
    replEnvPair.client, replEnvPair.server,
    audioEnginePair.client, audioEnginePair.server,
    grainsPair.client, grainsPair.server,
  ];
  return {
    ctx: {
      projectClient,
      audioFileClient,
      analysisClient,
      filesystemClient,
      instrumentClient,
      midiClient,
      mixerClient,
      replEnvClient,
      audioEngineClient,
      grainsClient,
      queryService,
    },
    cleanup: () => {
      for (const conn of connections) conn.dispose();
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
