import type { DomainEvent, EventBus } from "../../src/shared/event-bus";
import type { IQueryService } from "../../src/shared/query-interfaces";
import type {
  SampleRecord,
  SampleListRecord,
  RawSampleMetadata,
  ProjectRecord,
  ProjectListEntry,
  InstrumentRecord,
  InstrumentSampleRecord,
  MixerState,
  ReplEnvEntry,
} from "../../src/shared/domain-types";
import type { MidiEvent, MidiSequenceRecord } from "../../src/shared/ipc-contract";
import { InMemoryStore } from "./in-memory-store";

/**
 * InMemoryPersistenceService — subscribes to the event bus and applies events
 * to the shared InMemoryStore SYNCHRONOUSLY.
 *
 * Synchronous application gives workflow tests immediate consistency: after
 * AudioFileService.readAudioFile() returns, the sample is already visible
 * through InMemoryQueryService without any polling or retry.
 */
export class InMemoryPersistenceService {
  constructor(bus: EventBus, private store: InMemoryStore) {
    bus.on((events) => this.applyBatch(events));
  }

  private applyBatch(events: DomainEvent[]): void {
    for (const event of events) {
      this.applyEvent(event);
    }
  }

  private applyEvent(event: DomainEvent): void {
    switch (event.type) {
      case "SampleLoaded":
        this.store.addSample(event.hash, event.filePath, event.sampleRate, event.channels, event.duration);
        break;
      case "CwdChanged":
        this.store.cwd = event.cwd;
        break;
      case "ProjectLoaded":
      case "ProjectRemoved":
        // Informational — ProjectService already wrote directly to the store.
        break;
      case "InstrumentCreated":
        this.store.createInstrument(event.name, event.kind, event.configJson);
        break;
      case "InstrumentDeleted":
        this.store.deleteInstrument(event.name);
        break;
      case "InstrumentSampleAdded":
        this.store.addInstrumentSample(event.instrumentName, event.sampleHash, event.noteNumber, event.loop, event.loopStart, event.loopEnd);
        break;
      case "MidiSequenceSaved":
        this.store.saveMidiSequence(event.name, event.events, event.durationMs);
        break;
      case "MidiSequenceDeleted":
        this.store.deleteMidiSequence(event.name);
        break;
      case "MixerChannelUpdated":
        this.store.saveMixerChannel(event.channelIdx, {
          channelIdx: event.channelIdx,
          gainDb: event.gainDb,
          pan: event.pan,
          mute: event.mute,
          solo: event.solo,
          instrumentName: event.instrumentName,
        });
        break;
      case "MixerMasterUpdated":
        this.store.saveMixerMaster({ gainDb: event.gainDb, mute: event.mute });
        break;
      case "ReplEnvSaved":
        this.store.replEnvEntries = event.entries.map((e) => ({ ...e }));
        break;
      case "RecordingStored":
        this.store.addRecording(event.hash, event.name, event.sampleRate, event.channels, event.duration);
        break;
    }
  }
}

/**
 * InMemoryQueryService — reads from a shared InMemoryStore.
 * Because InMemoryPersistenceService applies events synchronously, queries
 * always see up-to-date state immediately after any write.
 */
export class InMemoryQueryService implements IQueryService {
  constructor(private store: InMemoryStore) {}

  async getSampleByHash(hash: string): Promise<SampleRecord | null> {
    return this.store.samples.get(hash) ?? null;
  }

  async getRawMetadata(hash: string): Promise<RawSampleMetadata | null> {
    return this.store.rawMeta.get(hash) ?? null;
  }

  async listSamples(): Promise<SampleListRecord[]> {
    return this.store.listSamples();
  }

  async getCwd(): Promise<string> {
    return this.store.cwd;
  }

  async getCurrentProject(): Promise<ProjectRecord> {
    return this.store.getCurrentProject();
  }

  async listProjects(): Promise<ProjectListEntry[]> {
    return this.store.listProjects();
  }

  async getInstrument(name: string): Promise<InstrumentRecord | null> {
    return this.store.instruments.get(name) ?? null;
  }

  async getInstrumentSamples(instrumentId: number): Promise<InstrumentSampleRecord[]> {
    return this.store.instrumentSamples.get(instrumentId) ?? [];
  }

  async listInstruments(): Promise<InstrumentRecord[]> {
    return [...this.store.instruments.values()];
  }

  async getMidiSequence(name: string): Promise<{ record: MidiSequenceRecord; events: MidiEvent[] } | null> {
    return this.store.midiSequences.get(name) ?? null;
  }

  async listMidiSequences(): Promise<MidiSequenceRecord[]> {
    return [...this.store.midiSequences.values()].map((e) => e.record);
  }

  async getMixerState(): Promise<MixerState> {
    return {
      channels: [...this.store.mixerChannels.values()].sort((a, b) => a.channelIdx - b.channelIdx),
      master: this.store.mixerMaster,
    };
  }

  async getReplEnv(): Promise<ReplEnvEntry[]> {
    return [...this.store.replEnvEntries];
  }

  async getSampleByRecordingName(name: string): Promise<SampleRecord | null> {
    const hash = this.store.recordings.get(name);
    if (!hash) return null;
    return this.store.samples.get(hash) ?? null;
  }
}
