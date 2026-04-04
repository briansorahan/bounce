/// <reference path="../types.d.ts" />
import { BounceResult } from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { transportCommands } from "./transport-commands.generated.js";
export { transportCommands } from "./transport-commands.generated.js";

@namespace("transport", { summary: "Global clock and BPM control" })
export class TransportNamespace {
  /** Namespace summary — used by the globals help() function. */
  readonly description = "Global clock and BPM control";

  private currentBpm = 120;
  private isRunning = false;
  private lastBar = 0;
  private lastBeat = 0;
  private lastStep = 0;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_deps: NamespaceDeps) {
    window.electron.onTransportTick((data) => {
      this.lastBar = data.bar;
      this.lastBeat = data.beat;
      this.lastStep = data.step;
    });
  }

  // ── Injected by @namespace decorator — do not implement manually ──────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  help(): unknown {
    // Replaced at class definition time by the @namespace decorator.
    return undefined;
  }

  toString(): string {
    return String(this.help());
  }

  // ── Public REPL-facing methods ────────────────────────────────────────────

  @describe({
    summary: "Get or set BPM (1–400). Omit argument to read current BPM.",
    returns: "BounceResult",
  })
  @param("value", {
    summary: "Beats per minute (1–400). Omit to read current BPM.",
    kind: "plain",
  })
  bpm(value?: number): BounceResult {
    if (value === undefined) {
      return new BounceResult(`Transport  bpm: ${this.currentBpm}  running: ${this.isRunning}`);
    }
    if (value <= 0 || value > 400) {
      return new BounceResult(`\x1b[31mBPM must be between 1 and 400 (got ${value})\x1b[0m`);
    }
    const prev = this.currentBpm;
    this.currentBpm = value;
    window.electron.transportSetBpm(value);
    return new BounceResult(`Transport  bpm: ${this.currentBpm}  (was: ${prev})`);
  }

  @describe({
    summary: "Start the global clock. Patterns scheduled with .play() will begin on the next bar.",
    returns: "BounceResult",
  })
  start(): BounceResult {
    this.isRunning = true;
    window.electron.transportStart();
    return new BounceResult(`Transport started  bpm: ${this.currentBpm}`);
  }

  @describe({
    summary: "Stop the global clock. Reports last bar, beat, and step position.",
    returns: "BounceResult",
  })
  stop(): BounceResult {
    this.isRunning = false;
    window.electron.transportStop();
    return new BounceResult(`Transport stopped  bar: ${this.lastBar}  beat: ${this.lastBeat}  step: ${this.lastStep}`);
  }

  // ── Plumbing accessor ─────────────────────────────────────────────────────

  @describe({ summary: "Return the current BPM value.", visibility: "plumbing" })
  getCurrentBpm(): number {
    return this.currentBpm;
  }
}

/** @deprecated Use `new TransportNamespace(deps)` directly. Kept for backward compatibility. */
export function buildTransportNamespace(deps: NamespaceDeps): {
  transport: TransportNamespace;
  getCurrentBpm: () => number;
} {
  const transport = new TransportNamespace(deps);
  return { transport, getCurrentBpm: () => transport.getCurrentBpm() };
}

// Re-export commands array for any consumers of the old JSDoc-generated metadata.
export { transportCommands as transportNamespaceCommands };
