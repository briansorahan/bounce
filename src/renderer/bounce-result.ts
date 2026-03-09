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

/** Formats FsLsEntry array into an ANSI-colored ls-style string. */
export function formatLsEntries(
  entries: Array<{ name: string; type: string; isAudio: boolean }>,
  truncated: boolean,
  total: number,
): string {
  const lines = entries.map((e) => {
    if (e.type === "directory") return `\x1b[34m${e.name}/\x1b[0m`;
    if (e.isAudio) return `\x1b[32m${e.name}\x1b[0m`;
    return e.name;
  });
  if (truncated) {
    lines.push(`\x1b[33m... ${total - 200} more items\x1b[0m`);
  }
  return lines.join("\n");
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
 * Returned by fs.glob().
 * Displays as one path per line, but is filterable/iterable as a string collection.
 */
export class GlobResult extends BounceResult {
  readonly paths: string[];

  constructor(paths: string[]) {
    super(paths.length === 0 ? "\x1b[90m(no matches)\x1b[0m" : paths.join("\n"));
    this.paths = paths;
  }

  get length(): number {
    return this.paths.length;
  }

  filter(fn: (path: string) => boolean): string[] {
    return this.paths.filter(fn);
  }

  map<T>(fn: (path: string) => T): T[] {
    return this.paths.map(fn);
  }

  find(fn: (path: string) => boolean): string | undefined {
    return this.paths.find(fn);
  }

  forEach(fn: (path: string) => void): void {
    this.paths.forEach(fn);
  }

  some(fn: (path: string) => boolean): boolean {
    return this.paths.some(fn);
  }

  every(fn: (path: string) => boolean): boolean {
    return this.paths.every(fn);
  }

  [Symbol.iterator](): Iterator<string> {
    return this.paths[Symbol.iterator]();
  }
}

/**
 * A thenable wrapper around Promise<LsResult> that exposes LsResult's array methods
 * directly, so users can chain without await: fs.ls().filter(f => f.isAudio)
 */
export class LsResultPromise implements PromiseLike<LsResult> {
  constructor(private readonly _promise: Promise<LsResult>) {}

  then<TResult1 = LsResult, TResult2 = never>(
    onfulfilled?: ((value: LsResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<LsResult | TResult> {
    return this._promise.catch(onrejected);
  }

  filter(fn: (entry: FsLsEntry) => boolean): LsResultPromise {
    return new LsResultPromise(
      this._promise.then((r) => {
        const filtered = r.entries.filter(fn);
        return new LsResult(formatLsEntries(filtered, false, filtered.length), filtered, filtered.length, false);
      }),
    );
  }

  map<T>(fn: (entry: FsLsEntry) => T): Promise<T[]> {
    return this._promise.then((r) => r.map(fn));
  }

  find(fn: (entry: FsLsEntry) => boolean): Promise<FsLsEntry | undefined> {
    return this._promise.then((r) => r.find(fn));
  }

  forEach(fn: (entry: FsLsEntry) => void): Promise<void> {
    return this._promise.then((r) => r.forEach(fn));
  }

  some(fn: (entry: FsLsEntry) => boolean): Promise<boolean> {
    return this._promise.then((r) => r.some(fn));
  }

  every(fn: (entry: FsLsEntry) => boolean): Promise<boolean> {
    return this._promise.then((r) => r.every(fn));
  }
}

/**
 * A thenable wrapper around Promise<GlobResult> that exposes GlobResult's array methods
 * directly, so users can chain without await: fs.glob("**\/*.wav").filter(p => p.includes("drum"))
 */
export class GlobResultPromise implements PromiseLike<GlobResult> {
  constructor(private readonly _promise: Promise<GlobResult>) {}

  then<TResult1 = GlobResult, TResult2 = never>(
    onfulfilled?: ((value: GlobResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<GlobResult | TResult> {
    return this._promise.catch(onrejected);
  }

  filter(fn: (path: string) => boolean): GlobResultPromise {
    return new GlobResultPromise(this._promise.then((r) => new GlobResult(r.paths.filter(fn))));
  }

  map<T>(fn: (path: string) => T): Promise<T[]> {
    return this._promise.then((r) => r.map(fn));
  }

  find(fn: (path: string) => boolean): Promise<string | undefined> {
    return this._promise.then((r) => r.find(fn));
  }

  forEach(fn: (path: string) => void): Promise<void> {
    return this._promise.then((r) => r.forEach(fn));
  }

  some(fn: (path: string) => boolean): Promise<boolean> {
    return this._promise.then((r) => r.some(fn));
  }

  every(fn: (path: string) => boolean): Promise<boolean> {
    return this._promise.then((r) => r.every(fn));
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
