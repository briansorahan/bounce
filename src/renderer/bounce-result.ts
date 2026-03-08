/**
 * Base class for all Bounce REPL command results.
 * Subclasses carry typed data enabling command composition (e.g. sep(play("…"))).
 * toString() returns the pre-formatted ANSI string shown in the terminal.
 */
export class BounceResult {
  constructor(private readonly _display: string) {}

  toString(): string {
    return this._display;
  }
}

/**
 * Returned by display() and play().
 * Carries the audio hash so it can be passed directly to analysis / separation commands.
 */
export class AudioResult extends BounceResult {
  constructor(
    display: string,
    public readonly hash: string,
    public readonly filePath: string | undefined,
    public readonly sampleRate: number,
    public readonly duration: number,
  ) {
    super(display);
  }
}

/**
 * Returned by fs.ls() and fs.la().
 * Displays as unix-style ls output, but is filterable/iterable as a collection of entries.
 */
export class LsResult extends BounceResult {
  readonly total: number;
  readonly truncated: boolean;

  constructor(
    display: string,
    public readonly entries: FsLsEntry[],
    total: number,
    truncated: boolean,
  ) {
    super(display);
    this.total = total;
    this.truncated = truncated;
  }

  get length(): number {
    return this.entries.length;
  }

  filter(fn: (entry: FsLsEntry) => boolean): FsLsEntry[] {
    return this.entries.filter(fn);
  }

  map<T>(fn: (entry: FsLsEntry) => T): T[] {
    return this.entries.map(fn);
  }

  find(fn: (entry: FsLsEntry) => boolean): FsLsEntry | undefined {
    return this.entries.find(fn);
  }

  forEach(fn: (entry: FsLsEntry) => void): void {
    this.entries.forEach(fn);
  }

  some(fn: (entry: FsLsEntry) => boolean): boolean {
    return this.entries.some(fn);
  }

  every(fn: (entry: FsLsEntry) => boolean): boolean {
    return this.entries.every(fn);
  }

  [Symbol.iterator](): Iterator<FsLsEntry> {
    return this.entries[Symbol.iterator]();
  }
}

/**
 * Returned by analyze() and analyzeNmf().
 * Carries source + feature hashes so it can be passed to slice(), sep(), playSlice(), etc.
 */
export class FeatureResult extends BounceResult {
  constructor(
    display: string,
    public readonly sourceHash: string,
    public readonly featureHash: string,
    public readonly featureType: string,
  ) {
    super(display);
  }
}
