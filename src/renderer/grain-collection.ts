import { attachMethodHelpFromRegistry } from "./help.js";
import { BounceResult, SampleResult } from "./bounce-result.js";
import { SamplePromise } from "./results/sample.js";
import { replType, describe, param } from "../shared/repl-registry.js";
import type { BounceGrainsOptions } from "../shared/ipc-contract.js";

@replType("GrainCollection", {
  summary: "A collection of grains extracted from a sample, ready for resynthesis.",
  instanceName: "grains",
})
export class GrainCollection extends BounceResult {
  readonly #grains: Array<SampleResult | null>;
  readonly #normalize: boolean;
  readonly #sourceHash: string;
  readonly #grainPositions: number[];
  readonly #grainSizeSamples: number;
  readonly #bounceCallback?: (
    sourceHash: string,
    positions: number[],
    sizeSamples: number,
    options?: BounceGrainsOptions,
  ) => Promise<SampleResult>;

  constructor(
    grains: Array<SampleResult | null>,
    normalize: boolean,
    sourceHash: string,
    grainPositions: number[],
    grainSizeSamples: number,
    bounceCallback?: (
      sourceHash: string,
      positions: number[],
      sizeSamples: number,
      options?: BounceGrainsOptions,
    ) => Promise<SampleResult>,
  ) {
    const stored = grains.filter((g) => g !== null).length;
    const silent = grains.length - stored;
    const silentNote = silent > 0 ? `, ${silent} silent` : "";
    super(`\x1b[32mGranularized ${sourceHash.substring(0, 8)} → ${stored} grains${silentNote}\x1b[0m`);
    this.#grains = grains;
    this.#normalize = normalize;
    this.#sourceHash = sourceHash;
    this.#grainPositions = grainPositions;
    this.#grainSizeSamples = grainSizeSamples;
    this.#bounceCallback = bounceCallback;
    attachMethodHelpFromRegistry(this, "GrainCollection");
  }

  get normalize(): boolean {
    return this.#normalize;
  }

  /** Number of stored (non-silent) grains. */
  length(): number {
    return this.#grains.filter((g) => g !== null).length;
  }

  /** Iterate over stored grains sequentially, awaiting each callback. */
  async forEach(
    callback: (grain: SampleResult, index: number) => void | Promise<void>,
  ): Promise<void> {
    let i = 0;
    for (const grain of this.#grains) {
      if (grain !== null) {
        await callback(grain, i++);
      }
    }
  }

  /** Transform stored grains to an array of any type. */
  map<T>(callback: (grain: SampleResult, index: number) => T): T[] {
    const results: T[] = [];
    let i = 0;
    for (const grain of this.#grains) {
      if (grain !== null) {
        results.push(callback(grain, i++));
      }
    }
    return results;
  }

  /** Return a new GrainCollection containing only grains that pass the predicate. */
  filter(
    predicate: (grain: SampleResult, index: number) => boolean,
  ): GrainCollection {
    const keptGrains: Array<SampleResult | null> = [];
    const keptPositions: number[] = [];
    let i = 0;
    let posIndex = 0;
    for (let j = 0; j < this.#grains.length; j++) {
      const grain = this.#grains[j];
      if (grain !== null) {
        if (predicate(grain, i++)) {
          keptGrains.push(grain);
          keptPositions.push(this.#grainPositions[posIndex]);
        }
        posIndex++;
      }
    }
    return new GrainCollection(
      keptGrains,
      this.#normalize,
      this.#sourceHash,
      keptPositions,
      this.#grainSizeSamples,
      this.#bounceCallback,
    );
  }

  @describe({ summary: "Resynthesize grains into a new sample via overlap-add.", returns: "SamplePromise" })
  @param("options", { summary: "Bounce options: density, pitch, envelope, duration, normalize.", kind: "options" })
  bounce(options?: BounceGrainsOptions): SamplePromise {
    if (!this.#bounceCallback) {
      throw new Error("bounce() is not available for this GrainCollection");
    }
    return new SamplePromise(
      this.#bounceCallback(this.#sourceHash, this.#grainPositions, this.#grainSizeSamples, options),
    );
  }
}
