import * as os from "os";
import type {
  SampleRecord,
  SampleListRecord,
  RawSampleMetadata,
  ProjectRecord,
  ProjectListEntry,
  InstrumentRecord,
  InstrumentSampleRecord,
  MixerChannelState,
  MixerMasterState,
  ReplEnvEntry,
} from "../../src/shared/domain-types";
import type { MidiEvent, MidiSequenceRecord } from "../../src/shared/ipc-contract";

interface ProjectEntry {
  record: ProjectRecord;
  sampleHashes: Set<string>;
}

/**
 * Shared in-memory backing store for InMemoryPersistenceService and
 * InMemoryQueryService. Plain Maps — no SQLite, no Electron.
 */
export class InMemoryStore {
  samples = new Map<string, SampleRecord>();
  rawMeta = new Map<string, RawSampleMetadata>();
  cwd: string = os.homedir();

  projects = new Map<string, ProjectEntry>();
  currentProjectName = "default";
  private nextProjectId = 2;
  private nextSampleId = 1;

  instruments = new Map<string, InstrumentRecord>();
  instrumentSamples = new Map<number, InstrumentSampleRecord[]>();
  private nextInstrumentId = 1;

  midiSequences = new Map<string, { record: MidiSequenceRecord; events: MidiEvent[] }>();
  private nextMidiSeqId = 1;

  mixerChannels = new Map<number, MixerChannelState>();
  mixerMaster: MixerMasterState | null = null;

  replEnvEntries: ReplEnvEntry[] = [];

  constructor() {
    this.projects.set("default", {
      record: { id: 1, name: "default", created_at: new Date().toISOString() },
      sampleHashes: new Set(),
    });
  }

  // ---------------------------------------------------------------------------
  // Sample mutations (called by InMemoryPersistenceService)
  // ---------------------------------------------------------------------------

  addSample(hash: string, filePath: string, sampleRate: number, channels: number, duration: number): void {
    if (!this.samples.has(hash)) {
      const id = this.nextSampleId++;
      this.samples.set(hash, { id, hash, sample_type: "raw", sample_rate: sampleRate, channels, duration });
      this.rawMeta.set(hash, { sample_id: id, file_path: filePath });
    }
    this.projects.get(this.currentProjectName)?.sampleHashes.add(hash);
  }

  // ---------------------------------------------------------------------------
  // Project mutations (called by InMemoryProjectStorage / ProjectService)
  // ---------------------------------------------------------------------------

  loadProject(name: string): ProjectListEntry {
    if (!this.projects.has(name)) {
      const id = this.nextProjectId++;
      this.projects.set(name, {
        record: { id, name, created_at: new Date().toISOString() },
        sampleHashes: new Set(),
      });
    }
    this.currentProjectName = name;
    const { record, sampleHashes } = this.projects.get(name)!;
    return { ...record, sample_count: sampleHashes.size, feature_count: 0, command_count: 0, current: true };
  }

  removeProject(name: string): { removedName: string; currentProject: ProjectListEntry } {
    const target = this.projects.get(name);
    if (!target) throw new Error(`Project "${name}" does not exist.`);
    if (this.currentProjectName === name) {
      throw new Error(`Cannot remove the current project "${name}". Load a different project first.`);
    }
    this.projects.delete(name);
    const { record, sampleHashes } = this.projects.get(this.currentProjectName)!;
    return {
      removedName: name,
      currentProject: { ...record, sample_count: sampleHashes.size, feature_count: 0, command_count: 0, current: true },
    };
  }

  getCurrentProject(): ProjectRecord {
    return this.projects.get(this.currentProjectName)!.record;
  }

  listProjects(): ProjectListEntry[] {
    return [...this.projects.values()]
      .map(({ record, sampleHashes }) => ({
        ...record,
        sample_count: sampleHashes.size,
        feature_count: 0,
        command_count: 0,
        current: record.name === this.currentProjectName,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  listSamples(): SampleListRecord[] {
    const proj = this.projects.get(this.currentProjectName);
    const hashes = proj?.sampleHashes ?? new Set<string>();
    return [...hashes].map((hash) => {
      const s = this.samples.get(hash)!;
      return {
        ...s,
        display_name: this.rawMeta.get(hash)?.file_path ?? null,
        created_at: new Date().toISOString(),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Instrument mutations
  // ---------------------------------------------------------------------------

  createInstrument(name: string, kind: string, configJson: string | null): InstrumentRecord {
    if (this.instruments.has(name)) throw new Error(`Instrument "${name}" already exists.`);
    const id = this.nextInstrumentId++;
    const record: InstrumentRecord = {
      id,
      project_id: 1,
      name,
      kind,
      config_json: configJson,
      created_at: new Date().toISOString(),
    };
    this.instruments.set(name, record);
    this.instrumentSamples.set(id, []);
    return record;
  }

  deleteInstrument(name: string): boolean {
    const instr = this.instruments.get(name);
    if (!instr) return false;
    this.instrumentSamples.delete(instr.id);
    this.instruments.delete(name);
    return true;
  }

  addInstrumentSample(instrumentName: string, sampleHash: string, noteNumber: number, loop: boolean, loopStart: number, loopEnd: number): void {
    const instr = this.instruments.get(instrumentName);
    if (!instr) throw new Error(`Instrument "${instrumentName}" not found.`);
    const sample = this.samples.get(sampleHash);
    if (!sample) throw new Error(`Sample "${sampleHash.substring(0, 8)}" not found.`);
    const list = this.instrumentSamples.get(instr.id) ?? [];
    list.push({
      instrument_id: instr.id,
      sample_id: sample.id,
      sample_hash: sampleHash,
      note_number: noteNumber,
      loop: loop ? 1 : 0,
      loop_start: loopStart,
      loop_end: loopEnd,
    });
    this.instrumentSamples.set(instr.id, list);
  }

  // ---------------------------------------------------------------------------
  // MIDI mutations
  // ---------------------------------------------------------------------------

  saveMidiSequence(name: string, events: MidiEvent[], durationMs: number): MidiSequenceRecord {
    const existing = this.midiSequences.get(name);
    const id = existing?.record.id ?? this.nextMidiSeqId++;
    const record: MidiSequenceRecord = {
      id,
      name,
      project_id: 1,
      duration_ms: durationMs,
      event_count: events.length,
      created_at: new Date().toISOString(),
    };
    this.midiSequences.set(name, { record, events });
    return record;
  }

  deleteMidiSequence(name: string): void {
    this.midiSequences.delete(name);
  }

  // ---------------------------------------------------------------------------
  // Mixer mutations
  // ---------------------------------------------------------------------------

  saveMixerChannel(channelIdx: number, state: MixerChannelState): void {
    this.mixerChannels.set(channelIdx, { ...state, channelIdx });
  }

  saveMixerMaster(state: MixerMasterState): void {
    this.mixerMaster = { ...state };
  }
}
