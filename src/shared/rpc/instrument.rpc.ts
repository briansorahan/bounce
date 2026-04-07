import { RequestType, ResponseError, type MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";
import type { InstrumentRecord, InstrumentSampleRecord } from "../domain-types";

export interface InstrumentRpc extends RpcContract {
  createInstrument: {
    params: { name: string; kind: string; config?: Record<string, unknown> };
    result: InstrumentRecord;
  };
  getInstrument: {
    params: { name: string };
    result: InstrumentRecord | null;
  };
  listInstruments: {
    params: Record<string, never>;
    result: InstrumentRecord[];
  };
  deleteInstrument: {
    params: { name: string };
    result: boolean;
  };
  addInstrumentSample: {
    params: {
      instrumentName: string;
      sampleHash: string;
      noteNumber: number;
      loop?: boolean;
      loopStart?: number;
      loopEnd?: number;
    };
    result: void;
  };
  getInstrumentSamples: {
    params: { instrumentName: string };
    result: InstrumentSampleRecord[];
  };
}

type E = ResponseError;

export const InstrumentRequest = {
  createInstrument:    new RequestType<InstrumentRpc["createInstrument"]["params"],    InstrumentRecord,         E>("instrument/createInstrument"),
  getInstrument:       new RequestType<InstrumentRpc["getInstrument"]["params"],       InstrumentRecord | null,  E>("instrument/getInstrument"),
  listInstruments:     new RequestType<InstrumentRpc["listInstruments"]["params"],     InstrumentRecord[],       E>("instrument/listInstruments"),
  deleteInstrument:    new RequestType<InstrumentRpc["deleteInstrument"]["params"],    boolean,                  E>("instrument/deleteInstrument"),
  addInstrumentSample: new RequestType<InstrumentRpc["addInstrumentSample"]["params"], void,                    E>("instrument/addInstrumentSample"),
  getInstrumentSamples:new RequestType<InstrumentRpc["getInstrumentSamples"]["params"],InstrumentSampleRecord[], E>("instrument/getInstrumentSamples"),
} as const;

export interface InstrumentHandlers {
  createInstrument(params: InstrumentRpc["createInstrument"]["params"]): Promise<InstrumentRecord>;
  getInstrument(params: InstrumentRpc["getInstrument"]["params"]): Promise<InstrumentRecord | null>;
  listInstruments(params: InstrumentRpc["listInstruments"]["params"]): Promise<InstrumentRecord[]>;
  deleteInstrument(params: InstrumentRpc["deleteInstrument"]["params"]): Promise<boolean>;
  addInstrumentSample(params: InstrumentRpc["addInstrumentSample"]["params"]): Promise<void>;
  getInstrumentSamples(params: InstrumentRpc["getInstrumentSamples"]["params"]): Promise<InstrumentSampleRecord[]>;
}

export function registerInstrumentHandlers(
  connection: MessageConnection,
  handlers: InstrumentHandlers,
): void {
  for (const [key, reqType] of Object.entries(InstrumentRequest)) {
    const method = key as keyof InstrumentHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

export function createInstrumentClient(connection: MessageConnection): {
  invoke<K extends keyof InstrumentRpc & string>(
    method: K,
    params: InstrumentRpc[K]["params"],
  ): Promise<InstrumentRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = InstrumentRequest[method as keyof typeof InstrumentRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, InstrumentRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
