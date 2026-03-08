import { AudioResult } from "./bounce-result.js";

export class GrainCollection {
  private readonly grains: Array<AudioResult | null>;
  private readonly _normalize: boolean;
  private readonly sourceHash: string;

  constructor(
    grains: Array<AudioResult | null>,
    normalize: boolean,
    sourceHash: string,
  ) {
    this.grains = grains;
    this._normalize = normalize;
    this.sourceHash = sourceHash;
  }

  get normalize(): boolean {
    return this._normalize;
  }

  /** Number of stored (non-silent) grains. */
  length(): number {
    return this.grains.filter((g) => g !== null).length;
  }

  /** Iterate over stored grains sequentially, awaiting each callback. */
  async forEach(
    callback: (grain: AudioResult, index: number) => void | Promise<void>,
  ): Promise<void> {
    let i = 0;
    for (const grain of this.grains) {
      if (grain !== null) {
        await callback(grain, i++);
      }
    }
  }

  /** Transform stored grains to an array of any type. */
  map<T>(callback: (grain: AudioResult, index: number) => T): T[] {
    const results: T[] = [];
    let i = 0;
    for (const grain of this.grains) {
      if (grain !== null) {
        results.push(callback(grain, i++));
      }
    }
    return results;
  }

  /** Return a new GrainCollection containing only grains that pass the predicate. */
  filter(
    predicate: (grain: AudioResult, index: number) => boolean,
  ): GrainCollection {
    const kept: Array<AudioResult | null> = [];
    let i = 0;
    for (const grain of this.grains) {
      if (grain !== null && predicate(grain, i++)) {
        kept.push(grain);
      }
    }
    return new GrainCollection(kept, this._normalize, this.sourceHash);
  }

  toString(): string {
    const stored = this.grains.filter((g) => g !== null).length;
    const silent = this.grains.length - stored;
    const silentNote = silent > 0 ? `, ${silent} silent` : "";
    return `GrainCollection(${stored} grains from ${this.sourceHash.substring(0, 8)}${silentNote})`;
  }
}
