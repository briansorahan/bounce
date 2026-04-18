import type { MidiEvent } from "./ipc-contract";

// ---------------------------------------------------------------------------
// Domain events — one type per state-mutating operation.
// ---------------------------------------------------------------------------

export type SampleLoadedEvent = {
  type: "SampleLoaded";
  hash: string;
  filePath: string;
  sampleRate: number;
  channels: number;
  duration: number;
};

export type CwdChangedEvent = {
  type: "CwdChanged";
  cwd: string;
};

/** Informational — ProjectService already wrote to storage synchronously. */
export type ProjectLoadedEvent = {
  type: "ProjectLoaded";
  name: string;
};

/** Informational — ProjectService already wrote to storage synchronously. */
export type ProjectRemovedEvent = {
  type: "ProjectRemoved";
  name: string;
};

export type InstrumentCreatedEvent = {
  type: "InstrumentCreated";
  name: string;
  kind: string;
  configJson: string | null;
};

export type InstrumentDeletedEvent = {
  type: "InstrumentDeleted";
  name: string;
};

export type InstrumentSampleAddedEvent = {
  type: "InstrumentSampleAdded";
  instrumentName: string;
  sampleHash: string;
  noteNumber: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
};

export type MidiSequenceSavedEvent = {
  type: "MidiSequenceSaved";
  name: string;
  events: MidiEvent[];
  durationMs: number;
};

export type MidiSequenceDeletedEvent = {
  type: "MidiSequenceDeleted";
  name: string;
};

export type MixerChannelUpdatedEvent = {
  type: "MixerChannelUpdated";
  channelIdx: number;
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  instrumentName: string | null;
};

export type MixerMasterUpdatedEvent = {
  type: "MixerMasterUpdated";
  gainDb: number;
  mute: boolean;
};

export type ReplEnvSavedEvent = {
  type: "ReplEnvSaved";
  entries: Array<{ name: string; kind: "json" | "function"; value: string }>;
};

export type RecordingStoredEvent = {
  type: "RecordingStored";
  hash: string;
  name: string;
  sampleRate: number;
  channels: number;
  duration: number;
};

export type DomainEvent =
  | SampleLoadedEvent
  | CwdChangedEvent
  | ProjectLoadedEvent
  | ProjectRemovedEvent
  | InstrumentCreatedEvent
  | InstrumentDeletedEvent
  | InstrumentSampleAddedEvent
  | MidiSequenceSavedEvent
  | MidiSequenceDeletedEvent
  | MixerChannelUpdatedEvent
  | MixerMasterUpdatedEvent
  | ReplEnvSavedEvent
  | RecordingStoredEvent;

// ---------------------------------------------------------------------------
// EventBus interface + synchronous in-process implementation.
// ---------------------------------------------------------------------------

export interface EventBus {
  /** Fire-and-forget: emit one or more events (processed as a single batch). */
  emit(events: DomainEvent | DomainEvent[]): void;
  /** Subscribe to all event batches. Returns an unsubscribe function. */
  on(handler: (events: DomainEvent[]) => void): () => void;
}

/** Synchronous in-process event bus. Handlers are called inline inside emit(). */
export class EventBusImpl implements EventBus {
  private handlers = new Set<(events: DomainEvent[]) => void>();

  emit(events: DomainEvent | DomainEvent[]): void {
    const batch = Array.isArray(events) ? events : [events];
    for (const h of this.handlers) h(batch);
  }

  on(handler: (events: DomainEvent[]) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
