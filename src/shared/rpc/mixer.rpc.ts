import { RequestType, ResponseError, type MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";
import type { MixerChannelState, MixerMasterState, MixerState } from "../domain-types";

export interface MixerRpc extends RpcContract {
  getMixerState: {
    params: Record<string, never>;
    result: MixerState;
  };
  saveMixerChannel: {
    params: { channelIdx: number; gainDb: number; pan: number; mute: boolean; solo: boolean; instrumentName: string | null };
    result: void;
  };
  saveMixerMaster: {
    params: { gainDb: number; mute: boolean };
    result: void;
  };
}

type E = ResponseError;

export const MixerRequest = {
  getMixerState:   new RequestType<MixerRpc["getMixerState"]["params"],   MixerState, E>("mixer/getMixerState"),
  saveMixerChannel:new RequestType<MixerRpc["saveMixerChannel"]["params"], void,       E>("mixer/saveMixerChannel"),
  saveMixerMaster: new RequestType<MixerRpc["saveMixerMaster"]["params"],  void,       E>("mixer/saveMixerMaster"),
} as const;

export type { MixerChannelState, MixerMasterState, MixerState };

export interface MixerHandlers {
  getMixerState(params: MixerRpc["getMixerState"]["params"]): Promise<MixerState>;
  saveMixerChannel(params: MixerRpc["saveMixerChannel"]["params"]): Promise<void>;
  saveMixerMaster(params: MixerRpc["saveMixerMaster"]["params"]): Promise<void>;
}

export function registerMixerHandlers(
  connection: MessageConnection,
  handlers: MixerHandlers,
): void {
  for (const [key, reqType] of Object.entries(MixerRequest)) {
    const method = key as keyof MixerHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

export function createMixerClient(connection: MessageConnection): {
  invoke<K extends keyof MixerRpc & string>(
    method: K,
    params: MixerRpc[K]["params"],
  ): Promise<MixerRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = MixerRequest[method as keyof typeof MixerRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, MixerRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
