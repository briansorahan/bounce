import type { MessageConnection } from "vscode-jsonrpc";
import {
  registerReplEnvHandlers,
  createReplEnvClient,
} from "../../../shared/rpc/repl-env.rpc";
import type { ReplEnvHandlers, ReplEnvRpc } from "../../../shared/rpc/repl-env.rpc";
import type { ReplEnvEntry } from "../../../shared/domain-types";
import type { EventBus } from "../../../shared/event-bus";
import type { IReplEnvQuery } from "../../../shared/query-interfaces";

/**
 * ReplEnvService — save and retrieve the REPL environment snapshot.
 *
 * Writes are emitted to the event bus. Reads go through IReplEnvQuery.
 */
export class ReplEnvService implements ReplEnvHandlers {
  constructor(
    private bus: EventBus,
    private query: IReplEnvQuery,
  ) {}

  async saveReplEnv(params: ReplEnvRpc["saveReplEnv"]["params"]): Promise<void> {
    this.bus.emit({ type: "ReplEnvSaved", entries: params.entries });
  }

  async getReplEnv(_params: Record<string, never>): Promise<ReplEnvEntry[]> {
    return this.query.getReplEnv();
  }

  listen(connection: MessageConnection): void {
    registerReplEnvHandlers(connection, this);
  }

  asClient(clientConnection: MessageConnection): ReturnType<typeof createReplEnvClient> {
    return createReplEnvClient(clientConnection);
  }
}
