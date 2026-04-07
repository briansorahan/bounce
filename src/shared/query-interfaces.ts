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
} from "./domain-types";
import type { MidiEvent, MidiSequenceRecord } from "./ipc-contract";

// ---------------------------------------------------------------------------
// Narrow per-domain query interfaces.
//
// Services declare only the interface they depend on, making them independently
// testable. IQueryService extends all of them for callers that need everything.
// ---------------------------------------------------------------------------

export interface ISampleQuery {
  getSampleByHash(hash: string): Promise<SampleRecord | null>;
  getRawMetadata(hash: string): Promise<RawSampleMetadata | null>;
  listSamples(): Promise<SampleListRecord[]>;
}

export interface ICwdQuery {
  getCwd(): Promise<string>;
}

export interface IProjectQuery {
  getCurrentProject(): Promise<ProjectRecord>;
  listProjects(): Promise<ProjectListEntry[]>;
}

export interface IInstrumentQuery {
  getInstrument(name: string): Promise<InstrumentRecord | null>;
  getInstrumentSamples(instrumentId: number): Promise<InstrumentSampleRecord[]>;
  listInstruments(): Promise<InstrumentRecord[]>;
}

export interface IMidiQuery {
  getMidiSequence(name: string): Promise<{ record: MidiSequenceRecord; events: MidiEvent[] } | null>;
  listMidiSequences(): Promise<MidiSequenceRecord[]>;
}

export interface IMixerQuery {
  getMixerState(): Promise<MixerState>;
}

export interface IReplEnvQuery {
  getReplEnv(): Promise<ReplEnvEntry[]>;
}

/** Full read-only query service. Extends all narrow interfaces. */
export interface IQueryService
  extends ISampleQuery,
    ICwdQuery,
    IProjectQuery,
    IInstrumentQuery,
    IMidiQuery,
    IMixerQuery,
    IReplEnvQuery {}
