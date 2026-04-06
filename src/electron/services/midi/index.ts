import type { MessageConnection } from "vscode-jsonrpc";
import {
  registerMidiHandlers,
  createMidiClient,
} from "../../../shared/rpc/midi.rpc";
import type { MidiHandlers, MidiRpc } from "../../../shared/rpc/midi.rpc";
import type { MidiEvent, MidiSequenceRecord } from "../../../shared/ipc-contract";
import type { EventBus } from "../../../shared/event-bus";
import type { IMidiQuery } from "../../../shared/query-interfaces";

/**
 * MidiService — save / delete MIDI sequences.
 *
 * Writes are emitted to the event bus. Reads go through IMidiQuery.
 */
export class MidiService implements MidiHandlers {
  constructor(
    private bus: EventBus,
    private query: IMidiQuery,
  ) {}

  async saveMidiSequence(params: MidiRpc["saveMidiSequence"]["params"]): Promise<MidiSequenceRecord> {
    this.bus.emit({
      type: "MidiSequenceSaved",
      name: params.name,
      events: params.events,
      durationMs: params.durationMs,
    });
    const result = await this.query.getMidiSequence(params.name);
    if (!result) throw new Error(`MIDI sequence "${params.name}" was not persisted.`);
    return result.record;
  }

  async getMidiSequence(params: MidiRpc["getMidiSequence"]["params"]): Promise<MidiRpc["getMidiSequence"]["result"]> {
    return this.query.getMidiSequence(params.name);
  }

  async listMidiSequences(_params: Record<string, never>): Promise<MidiSequenceRecord[]> {
    return this.query.listMidiSequences();
  }

  async deleteMidiSequence(params: MidiRpc["deleteMidiSequence"]["params"]): Promise<void> {
    this.bus.emit({ type: "MidiSequenceDeleted", name: params.name });
  }

  listen(connection: MessageConnection): void {
    registerMidiHandlers(connection, this);
  }

  asClient(clientConnection: MessageConnection): ReturnType<typeof createMidiClient> {
    return createMidiClient(clientConnection);
  }
}
