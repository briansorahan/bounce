import type { MessageConnection } from "vscode-jsonrpc";
import {
  registerMixerHandlers,
  createMixerClient,
} from "../../../shared/rpc/mixer.rpc";
import type { MixerHandlers, MixerRpc } from "../../../shared/rpc/mixer.rpc";
import type { MixerState } from "../../../shared/domain-types";
import type { EventBus } from "../../../shared/event-bus";
import type { IMixerQuery } from "../../../shared/query-interfaces";

/**
 * MixerService — persist and read mixer channel / master state.
 *
 * Writes are emitted to the event bus. Reads go through IMixerQuery.
 */
export class MixerService implements MixerHandlers {
  constructor(
    private bus: EventBus,
    private query: IMixerQuery,
  ) {}

  async getMixerState(_params: Record<string, never>): Promise<MixerState> {
    return this.query.getMixerState();
  }

  async saveMixerChannel(params: MixerRpc["saveMixerChannel"]["params"]): Promise<void> {
    this.bus.emit({
      type: "MixerChannelUpdated",
      channelIdx: params.channelIdx,
      gainDb: params.gainDb,
      pan: params.pan,
      mute: params.mute,
      solo: params.solo,
      instrumentName: params.instrumentName,
    });
  }

  async saveMixerMaster(params: MixerRpc["saveMixerMaster"]["params"]): Promise<void> {
    this.bus.emit({
      type: "MixerMasterUpdated",
      gainDb: params.gainDb,
      mute: params.mute,
    });
  }

  listen(connection: MessageConnection): void {
    registerMixerHandlers(connection, this);
  }

  asClient(clientConnection: MessageConnection): ReturnType<typeof createMixerClient> {
    return createMixerClient(clientConnection);
  }
}
