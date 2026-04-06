import type { MessageConnection } from "vscode-jsonrpc";
import {
  registerInstrumentHandlers,
  createInstrumentClient,
} from "../../../shared/rpc/instrument.rpc";
import type { InstrumentHandlers, InstrumentRpc } from "../../../shared/rpc/instrument.rpc";
import type { InstrumentRecord, InstrumentSampleRecord } from "../../../shared/domain-types";
import type { EventBus } from "../../../shared/event-bus";
import type { IInstrumentQuery, ISampleQuery } from "../../../shared/query-interfaces";

/**
 * InstrumentService — create / delete instruments and assign samples to them.
 *
 * Writes are emitted to the event bus (fire-and-forget). PersistenceService
 * applies them to storage. Reads go through IInstrumentQuery.
 *
 * ISampleQuery is needed to validate that the referenced sample exists before
 * emitting InstrumentSampleAdded.
 */
export class InstrumentService implements InstrumentHandlers {
  constructor(
    private bus: EventBus,
    private instrumentQuery: IInstrumentQuery,
    private sampleQuery: ISampleQuery,
  ) {}

  async createInstrument(params: InstrumentRpc["createInstrument"]["params"]): Promise<InstrumentRecord> {
    const configJson = params.config ? JSON.stringify(params.config) : null;
    this.bus.emit({ type: "InstrumentCreated", name: params.name, kind: params.kind, configJson });
    // Return via query (InMemoryPersistenceService is synchronous so this is immediately visible).
    const instr = await this.instrumentQuery.getInstrument(params.name);
    if (!instr) throw new Error(`Instrument "${params.name}" was not persisted.`);
    return instr;
  }

  async getInstrument(params: InstrumentRpc["getInstrument"]["params"]): Promise<InstrumentRecord | null> {
    return this.instrumentQuery.getInstrument(params.name);
  }

  async listInstruments(_params: Record<string, never>): Promise<InstrumentRecord[]> {
    return this.instrumentQuery.listInstruments();
  }

  async deleteInstrument(params: InstrumentRpc["deleteInstrument"]["params"]): Promise<boolean> {
    const existing = await this.instrumentQuery.getInstrument(params.name);
    if (!existing) return false;
    this.bus.emit({ type: "InstrumentDeleted", name: params.name });
    return true;
  }

  async addInstrumentSample(params: InstrumentRpc["addInstrumentSample"]["params"]): Promise<void> {
    const sample = await this.sampleQuery.getSampleByHash(params.sampleHash);
    if (!sample) throw new Error(`Sample "${params.sampleHash.substring(0, 8)}..." not found.`);
    this.bus.emit({
      type: "InstrumentSampleAdded",
      instrumentName: params.instrumentName,
      sampleHash: params.sampleHash,
      noteNumber: params.noteNumber,
      loop: params.loop ?? false,
      loopStart: params.loopStart ?? 0,
      loopEnd: params.loopEnd ?? -1,
    });
  }

  async getInstrumentSamples(params: InstrumentRpc["getInstrumentSamples"]["params"]): Promise<InstrumentSampleRecord[]> {
    const instr = await this.instrumentQuery.getInstrument(params.instrumentName);
    if (!instr) return [];
    return this.instrumentQuery.getInstrumentSamples(instr.id);
  }

  listen(connection: MessageConnection): void {
    registerInstrumentHandlers(connection, this);
  }

  asClient(clientConnection: MessageConnection): ReturnType<typeof createInstrumentClient> {
    return createInstrumentClient(clientConnection);
  }
}
