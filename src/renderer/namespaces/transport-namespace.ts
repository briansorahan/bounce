/// <reference path="../types.d.ts" />
import { BounceResult } from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";

export interface TransportNamespace {
  bpm(value?: number): BounceResult;
  start(): BounceResult;
  stop(): BounceResult;
  help(): BounceResult;
}

export interface TransportNamespaceResult {
  transport: TransportNamespace;
  getCurrentBpm: () => number;
}

export function buildTransportNamespace(_deps: NamespaceDeps): TransportNamespaceResult {
  let currentBpm = 120;
  let isRunning = false;
  let lastBar = 0;
  let lastBeat = 0;
  let lastStep = 0;

  const transport: TransportNamespace = {
    bpm(value?: number): BounceResult {
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

    start(): BounceResult {
      isRunning = true;
      window.electron.transportStart();
      return new BounceResult(`Transport started  bpm: ${currentBpm}`);
    },

    stop(): BounceResult {
      isRunning = false;
      window.electron.transportStop();
      return new BounceResult(`Transport stopped  bar: ${lastBar}  beat: ${lastBeat}  step: ${lastStep}`);
    },

    help(): BounceResult {
      return new BounceResult(
        `transport — controls the global clock\n` +
        `  transport.bpm(120)    set BPM (1–400); returns current state if no arg\n` +
        `  transport.start()     start the clock\n` +
        `  transport.stop()      stop the clock\n` +
        `  transport.help()      show this message\n` +
        `\nexample:\n` +
        `  transport.bpm(120)\n` +
        `  transport.start()\n` +
        `  pat.xox(\`c4 = a . . . a . . . a . . . a . . .\`).play(1)\n` +
        `  transport.stop()`,
      );
    },
  };

  // Update local state from tick telemetry
  window.electron.onTransportTick((data) => {
    lastBar = data.bar;
    lastBeat = data.beat;
    lastStep = data.step;
  });

  return { transport, getCurrentBpm: () => currentBpm };
}
