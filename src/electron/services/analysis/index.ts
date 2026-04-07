import * as path from "path";
import { utilityProcess, type UtilityProcess, MessageChannelMain } from "electron";
import type { ServiceClient } from "../../../shared/rpc/types";
import type { AnalysisRpc } from "../../../shared/rpc/analysis.rpc";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

/**
 * AnalysisService — FluCoMa DSP running in a dedicated utility process.
 *
 * CPU-intensive analysis (onset detection, NMF, MFCC) is isolated from the
 * main process to keep the IPC router and event loop responsive. All methods
 * receive raw PCM data and return pure analysis results — no database access.
 *
 * Constructor dependency: none. Spawns its own child process on start().
 */
export class AnalysisService {
  private child: UtilityProcess | null = null;
  private port: Electron.MessagePortMain | null = null;
  private pending = new Map<string, PendingRequest>();
  private nextId = 0;

  /** Start the utility process. Must be called before asClient(). */
  start(): void {
    const { port1, port2 } = new MessageChannelMain();

    this.child = utilityProcess.fork(
      path.join(__dirname, "process.js"),
    );
    this.child.postMessage({ type: "init" }, [port2]);

    this.port = port1;
    this.port.on("message", (event: Electron.MessageEvent) => {
      const msg = event.data as { id: string; result?: unknown; error?: string };
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error !== undefined) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    });
    this.port.start();
  }

  /** Stop the utility process and reject any in-flight requests. */
  stop(): void {
    this.port?.close();
    this.port = null;
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    for (const [, pending] of this.pending) {
      pending.reject(new Error("AnalysisService stopped"));
    }
    this.pending.clear();
  }

  /** Returns a ServiceClient that sends requests to the utility process. */
  asClient(): ServiceClient<AnalysisRpc> {
    return {
      invoke: (method, params) => this.send(method, params),
    };
  }

  private send(method: keyof AnalysisRpc, params: unknown): Promise<unknown> {
    if (!this.port) throw new Error("AnalysisService not started");
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port!.postMessage({ id, method, params });
    });
  }
}
