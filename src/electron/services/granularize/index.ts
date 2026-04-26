/**
 * GrainsService — pure grain-slicing computation.
 *
 * Extracts the deterministic part of DatabaseManager.grains():
 *   - grain position computation
 *   - silence filtering (RMS)
 *   - featureHash derivation
 *   - per-grain derived sample hash derivation
 *
 * No storage, no database, no event bus. Used by workflow tests directly and
 * called in-process by DatabaseManager to avoid duplicating the logic.
 *
 * featureHash formula matches DatabaseManager.computeFeatureHash():
 *   sha256("grains:" + JSON.stringify(positions) + ":" + JSON.stringify(options))
 *
 * Derived sample hash formula matches DatabaseManager.createDerivedSample():
 *   sha256(`${sourceHash}:${featureHash}:${index}`)
 */

import * as crypto from "crypto";
import type { MessageConnection } from "vscode-jsonrpc";
import {
  registerGrainsHandlers,
  type GrainsHandlers,
  type GrainsOptions,
  type GrainsResult,
  type GrainsRpc,
} from "../../../shared/rpc/granularize.rpc";

/**
 * Pure synchronous computation — safe to call from synchronous contexts
 * (e.g. DatabaseManager) without async overhead.
 */
export function computeGrains(params: {
  sourceHash: string;
  audioData: ArrayLike<number>;
  sampleRate: number;
  duration: number;
  options: GrainsOptions;
}): GrainsResult {
  const { sourceHash, audioData, sampleRate, duration, options } = params;

  const grainSizeMs = options.grainSize ?? 20;
  const hopSizeMs = options.hopSize ?? grainSizeMs;
  const startTimeMs = options.startTime ?? 0;
  const endTimeMs = options.endTime ?? duration * 1000;
  const jitter = options.jitter ?? 0;
  const silenceThresholdDb = options.silenceThreshold ?? -60;

  const grainSizeSamples = Math.round((grainSizeMs * sampleRate) / 1000);
  const hopSizeSamples = Math.round((hopSizeMs * sampleRate) / 1000);
  const startSample = Math.round((startTimeMs * sampleRate) / 1000);
  const totalFrames = audioData.length;
  const endSample = Math.min(
    Math.round((endTimeMs * sampleRate) / 1000),
    totalFrames,
  );

  // Compute grain start positions (with optional jitter).
  const grainStartPositions: number[] = [];
  let pos = startSample;
  while (pos + grainSizeSamples <= endSample) {
    if (jitter > 0) {
      const maxOffset = Math.round(jitter * hopSizeSamples);
      const offset = Math.round((Math.random() * 2 - 1) * maxOffset);
      const jitteredPos = Math.max(
        startSample,
        Math.min(endSample - grainSizeSamples, pos + offset),
      );
      grainStartPositions.push(jitteredPos);
    } else {
      grainStartPositions.push(pos);
    }
    pos += hopSizeSamples;
  }

  // featureHash — must match DatabaseManager.computeFeatureHash() exactly.
  const featureHash = crypto
    .createHash("sha256")
    .update(`grains:${JSON.stringify(grainStartPositions)}:${JSON.stringify(options)}`)
    .digest("hex");

  // Silence threshold: convert dBFS to linear RMS.
  const silenceThresholdLinear =
    silenceThresholdDb === -Infinity
      ? 0
      : Math.pow(10, silenceThresholdDb / 20);

  const grainDuration = grainSizeSamples / sampleRate;
  const grainHashes: Array<string | null> = [];

  for (let i = 0; i < grainStartPositions.length; i++) {
    const start = grainStartPositions[i];

    // Compute RMS; skip silent grains.
    let sumSq = 0;
    const end = Math.min(start + grainSizeSamples, audioData.length);
    for (let j = start; j < end; j++) {
      sumSq += audioData[j] * audioData[j];
    }
    const grainLen = end - start;
    const rms = grainLen > 0 ? Math.sqrt(sumSq / grainLen) : 0;
    if (rms < silenceThresholdLinear) {
      grainHashes.push(null);
      continue;
    }

    // Derived hash — must match DatabaseManager.createDerivedSample() exactly.
    const hash = crypto
      .createHash("sha256")
      .update(`${sourceHash}:${featureHash}:${i}`)
      .digest("hex");
    grainHashes.push(hash);
  }

  return { grainHashes, featureHash, sampleRate, grainDuration, grainStartPositions };
}

export class GrainsService implements GrainsHandlers {
  async grains(params: GrainsRpc["grains"]["params"]): Promise<GrainsResult> {
    return computeGrains(params);
  }

  listen(connection: MessageConnection): void {
    registerGrainsHandlers(connection, this);
  }
}
