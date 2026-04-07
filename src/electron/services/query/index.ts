import type { IQueryService } from "../../../shared/query-interfaces";
import type {
  SampleRecord,
  SampleListRecord,
  RawSampleMetadata,
  ProjectRecord,
  ProjectListEntry,
  InstrumentRecord,
  InstrumentSampleRecord,
  MixerState,
  MixerChannelState,
  ReplEnvEntry,
} from "../../../shared/domain-types";
import type { MidiEvent, MidiSequenceRecord } from "../../../shared/ipc-contract";
import type { DatabaseManager } from "../../database";
import type { SettingsStore } from "../../settings-store";

/**
 * DatabaseQueryService — read-only query service backed by DatabaseManager.
 *
 * All methods are async to match the IQueryService interface (which
 * InMemoryQueryService also implements), even though SQLite reads are
 * synchronous under the hood.
 */
export class DatabaseQueryService implements IQueryService {
  constructor(
    private db: DatabaseManager,
    private settings: SettingsStore,
  ) {}

  async getSampleByHash(hash: string): Promise<SampleRecord | null> {
    return this.db.getSampleByHash(hash) ?? null;
  }

  async getRawMetadata(hash: string): Promise<RawSampleMetadata | null> {
    return this.db.getRawMetadata(hash) ?? null;
  }

  async listSamples(): Promise<SampleListRecord[]> {
    return this.db.listSamples();
  }

  async getCwd(): Promise<string> {
    return this.settings.getCwd();
  }

  async getCurrentProject(): Promise<ProjectRecord> {
    const p = this.db.getCurrentProject();
    return { id: p.id, name: p.name, created_at: p.created_at };
  }

  async listProjects(): Promise<ProjectListEntry[]> {
    const currentName = this.settings.getCurrentProjectName();
    return this.db.listProjects().map((p) => ({ ...p, current: p.name === currentName }));
  }

  async getInstrument(name: string): Promise<InstrumentRecord | null> {
    return this.db.getInstrument(name);
  }

  async getInstrumentSamples(instrumentId: number): Promise<InstrumentSampleRecord[]> {
    return this.db.getInstrumentSamples(instrumentId);
  }

  async listInstruments(): Promise<InstrumentRecord[]> {
    return this.db.listInstruments();
  }

  async getMidiSequence(name: string): Promise<{ record: MidiSequenceRecord; events: MidiEvent[] } | null> {
    const seqs = this.db.listMidiSequences();
    const seq = seqs.find((s) => s.name === name);
    if (!seq) return null;
    const result = this.db.getMidiSequence(seq.id);
    if (!result) return null;
    const { events, ...record } = result;
    return { record, events };
  }

  async listMidiSequences(): Promise<MidiSequenceRecord[]> {
    return this.db.listMidiSequences();
  }

  async getMixerState(): Promise<MixerState> {
    const projectId = this.db.getCurrentProject().id;
    const { channels, master } = this.db.getMixerState(projectId);
    return {
      channels: channels.map((c): MixerChannelState => ({
        channelIdx: c.channel_idx,
        gainDb: c.gain_db,
        pan: c.pan,
        mute: c.mute === 1,
        solo: c.solo === 1,
        instrumentName: c.instrument_name,
      })),
      master: master ? { gainDb: master.gain_db, mute: master.mute === 1 } : null,
    };
  }

  async getReplEnv(): Promise<ReplEnvEntry[]> {
    return this.db.getReplEnv().map((r) => ({
      name: r.name,
      kind: r.kind,
      value: r.value,
    }));
  }
}
