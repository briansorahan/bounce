import type { DomainEvent, EventBus } from "../../../shared/event-bus";
import type { DatabaseManager } from "../../database";
import type { SettingsStore } from "../../settings-store";

/**
 * PersistenceService — batching event consumer backed by DatabaseManager.
 *
 * Subscribes to the EventBus, accumulates domain events, and flushes them
 * to SQLite in a single transaction when either:
 *   - the batch reaches maxBatchSize, or
 *   - timeoutMs elapses since the first event in the batch.
 *
 * ProjectLoaded / ProjectRemoved events are skipped — ProjectService already
 * wrote those to storage synchronously to preserve strong consistency on
 * project switches.
 */
export class PersistenceService {
  private batch: DomainEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    bus: EventBus,
    private db: DatabaseManager,
    private settings: SettingsStore,
    private maxBatchSize = 100,
    private timeoutMs = 200,
  ) {
    bus.on((events) => {
      this.batch.push(...events);
      if (this.batch.length >= this.maxBatchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.timeoutMs);
      }
    });
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const toFlush = this.batch.splice(0);
    if (toFlush.length === 0) return;
    this.applyBatch(toFlush);
  }

  private applyBatch(events: DomainEvent[]): void {
    this.db.db.transaction(() => {
      for (const event of events) {
        this.applyEvent(event);
      }
    })();
  }

  private applyEvent(event: DomainEvent): void {
    switch (event.type) {
      case "SampleLoaded":
        this.db.storeRawSample(event.hash, event.filePath, event.sampleRate, event.channels, event.duration);
        break;
      case "CwdChanged":
        this.settings.setCwd(event.cwd);
        break;
      case "ProjectLoaded":
      case "ProjectRemoved":
        // Informational — ProjectService already wrote these synchronously.
        break;
      case "InstrumentCreated": {
        const config = event.configJson ? JSON.parse(event.configJson) as Record<string, unknown> : undefined;
        this.db.createInstrument(event.name, event.kind, config);
        break;
      }
      case "InstrumentDeleted":
        this.db.deleteInstrument(event.name);
        break;
      case "InstrumentSampleAdded": {
        const instr = this.db.getInstrument(event.instrumentName);
        if (instr) {
          this.db.addInstrumentSample(instr.id, event.sampleHash, event.noteNumber, event.loop, event.loopStart, event.loopEnd);
        }
        break;
      }
      case "MidiSequenceSaved":
        this.db.saveMidiSequence(event.name, event.events, event.durationMs);
        break;
      case "MidiSequenceDeleted": {
        const seqs = this.db.listMidiSequences();
        const seq = seqs.find((s) => s.name === event.name);
        if (seq) this.db.deleteMidiSequence(seq.id);
        break;
      }
      case "MixerChannelUpdated": {
        const projectId = this.db.getCurrentProject().id;
        this.db.saveMixerChannel(projectId, event.channelIdx, {
          gainDb: event.gainDb,
          pan: event.pan,
          mute: event.mute,
          solo: event.solo,
          instrumentName: event.instrumentName,
        });
        break;
      }
      case "MixerMasterUpdated": {
        const projectId = this.db.getCurrentProject().id;
        this.db.saveMixerMaster(projectId, { gainDb: event.gainDb, mute: event.mute });
        break;
      }
      case "ReplEnvSaved":
        this.db.saveReplEnv(event.entries);
        break;
    }
  }
}
