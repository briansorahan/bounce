import { BounceResult, SampleResult } from "./bounce-result.js";

export class GrainCollection extends BounceResult {
  readonly #grains: Array<SampleResult | null>;
  readonly #normalize: boolean;
  readonly #sourceHash: string;

  constructor(
    grains: Array<SampleResult | null>,
    normalize: boolean,
    sourceHash: string,
  ) {
    const stored = grains.filter((g) => g !== null).length;
    const silent = grains.length - stored;
    const silentNote = silent > 0 ? `, ${silent} silent` : "";
    super(`\x1b[32mGranularized ${sourceHash.substring(0, 8)} → ${stored} grains${silentNote}\x1b[0m`);
    this.#grains = grains;
    this.#normalize = normalize;
    this.#sourceHash = sourceHash;
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
    const kept: Array<SampleResult | null> = [];
    let i = 0;
    for (const grain of this.#grains) {
      if (grain !== null && predicate(grain, i++)) {
        kept.push(grain);
      }
    }
    return new GrainCollection(kept, this.#normalize, this.#sourceHash);
  }
}
