import { RequestType, ResponseError, type MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";
import type { MidiEvent, MidiSequenceRecord } from "../ipc-contract";

export interface MidiRpc extends RpcContract {
  saveMidiSequence: {
    params: { name: string; events: MidiEvent[]; durationMs: number };
    result: MidiSequenceRecord;
  };
  getMidiSequence: {
    params: { name: string };
    result: { record: MidiSequenceRecord; events: MidiEvent[] } | null;
  };
  listMidiSequences: {
    params: Record<string, never>;
    result: MidiSequenceRecord[];
  };
  deleteMidiSequence: {
    params: { name: string };
    result: void;
  };
}

type E = ResponseError;

export const MidiRequest = {
  saveMidiSequence:   new RequestType<MidiRpc["saveMidiSequence"]["params"],   MidiSequenceRecord,                                     E>("midi/saveMidiSequence"),
  getMidiSequence:    new RequestType<MidiRpc["getMidiSequence"]["params"],    MidiRpc["getMidiSequence"]["result"],                   E>("midi/getMidiSequence"),
  listMidiSequences:  new RequestType<MidiRpc["listMidiSequences"]["params"],  MidiSequenceRecord[],                                   E>("midi/listMidiSequences"),
  deleteMidiSequence: new RequestType<MidiRpc["deleteMidiSequence"]["params"], void,                                                   E>("midi/deleteMidiSequence"),
} as const;

export interface MidiHandlers {
  saveMidiSequence(params: MidiRpc["saveMidiSequence"]["params"]): Promise<MidiSequenceRecord>;
  getMidiSequence(params: MidiRpc["getMidiSequence"]["params"]): Promise<MidiRpc["getMidiSequence"]["result"]>;
  listMidiSequences(params: MidiRpc["listMidiSequences"]["params"]): Promise<MidiSequenceRecord[]>;
  deleteMidiSequence(params: MidiRpc["deleteMidiSequence"]["params"]): Promise<void>;
}

export function registerMidiHandlers(
  connection: MessageConnection,
  handlers: MidiHandlers,
): void {
  for (const [key, reqType] of Object.entries(MidiRequest)) {
    const method = key as keyof MidiHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

export function createMidiClient(connection: MessageConnection): {
  invoke<K extends keyof MidiRpc & string>(
    method: K,
    params: MidiRpc[K]["params"],
  ): Promise<MidiRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = MidiRequest[method as keyof typeof MidiRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, MidiRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
