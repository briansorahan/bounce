/**
 * In-process JSON-RPC transport.
 *
 * Creates a paired (client, server) MessageConnection backed by an
 * EventEmitter — no streams, no serialisation overhead, no I/O.
 * Used by workflow tests and any code that needs to wire two services
 * together in the same process.
 */

import { EventEmitter } from "events";
import {
  AbstractMessageReader,
  AbstractMessageWriter,
  createMessageConnection,
  DataCallback,
  Disposable,
  Message,
  MessageConnection,
} from "vscode-jsonrpc";

class PipeReader extends AbstractMessageReader {
  private _callback: DataCallback | undefined;

  constructor(emitter: EventEmitter, channel: string) {
    super();
    emitter.on(channel, (msg: Message) => this._callback?.(msg));
  }

  listen(callback: DataCallback): Disposable {
    this._callback = callback;
    return { dispose: () => { this._callback = undefined; } };
  }
}

class PipeWriter extends AbstractMessageWriter {
  constructor(private emitter: EventEmitter, private channel: string) {
    super();
  }

  write(message: Message): Promise<void> {
    this.emitter.emit(this.channel, message);
    return Promise.resolve();
  }

  end(): void {
    this.fireClose();
  }
}

/**
 * Create a paired client/server MessageConnection for in-process use.
 * Call `connection.listen()` on both before sending requests.
 */
export function createInProcessPair(): { client: MessageConnection; server: MessageConnection } {
  const emitter = new EventEmitter();
  const client = createMessageConnection(
    new PipeReader(emitter, "s2c"),
    new PipeWriter(emitter, "c2s"),
  );
  const server = createMessageConnection(
    new PipeReader(emitter, "c2s"),
    new PipeWriter(emitter, "s2c"),
  );
  return { client, server };
}
