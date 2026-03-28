/// <reference path="../types.d.ts" />
import { BounceResult } from "../bounce-result.js";
import { renderNamespaceHelp, withHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";
import { transportCommands, transportDescription } from "./transport-commands.generated.js";
export { transportCommands } from "./transport-commands.generated.js";

export interface TransportNamespace {
  description: string;
  bpm: ((value?: number) => BounceResult) & { help: () => BounceResult };
  start: (() => BounceResult) & { help: () => BounceResult };
  stop: (() => BounceResult) & { help: () => BounceResult };
  help(): BounceResult;
}

export interface TransportNamespaceResult {
  transport: TransportNamespace;
  getCurrentBpm: () => number;
}


/**
 * Global clock and BPM control
 * @namespace transport
 */
export function buildTransportNamespace(_deps: NamespaceDeps): TransportNamespaceResult {
  let currentBpm = 120;
  let isRunning = false;
  let lastBar = 0;
  let lastBeat = 0;
  let lastStep = 0;

  const transport: TransportNamespace = {
    description: transportDescription,
    help: () => renderNamespaceHelp("transport", transportDescription, transportCommands),

    bpm: withHelp(
      /**
       * Get or set BPM (1–400)
       *
       * Get the current BPM when called with no argument, or set a new BPM value.
       * Value must be between 1 and 400.
       *
       * @param value Beats per minute (1–400). Omit to read current BPM.
       * @example transport.bpm()
       * @example transport.bpm(140)
       */
      function bpm(value?: number): BounceResult {
        if (value === undefined) {
          return new BounceResult(`Transport  bpm: ${currentBpm}  running: ${isRunning}`);
        }
        if (value <= 0 || value > 400) {
          return new BounceResult(`\x1b[31mBPM must be between 1 and 400 (got ${value})\x1b[0m`);
        }
        const prev = currentBpm;
        currentBpm = value;
        window.electron.transportSetBpm(value);
        return new BounceResult(`Transport  bpm: ${currentBpm}  (was: ${prev})`);
      },
      transportCommands[0],
    ),

    start: withHelp(
      /**
       * Start the global clock
       *
       * Start the transport clock. Patterns scheduled with .play() will begin
       * firing on the next bar.
       *
       * @example transport.bpm(120)\ntransport.start()\npat.xox(`c4 = a . . . a . . . a . . . a . . .`).play(1)
       */
      function start(): BounceResult {
        isRunning = true;
        window.electron.transportStart();
        return new BounceResult(`Transport started  bpm: ${currentBpm}`);
      },
      transportCommands[1],
    ),

    stop: withHelp(
      /**
       * Stop the global clock
       *
       * Stop the transport clock. Reports the last bar, beat, and step
       * position at the time of stopping.
       *
       * @example transport.stop()
       */
      function stop(): BounceResult {
        isRunning = false;
        window.electron.transportStop();
        return new BounceResult(`Transport stopped  bar: ${lastBar}  beat: ${lastBeat}  step: ${lastStep}`);
      },
      transportCommands[2],
    ),
  };

  // Update local state from tick telemetry
  window.electron.onTransportTick((data) => {
    lastBar = data.bar;
    lastBeat = data.beat;
    lastStep = data.step;
  });

  return { transport, getCurrentBpm: () => currentBpm };
}
