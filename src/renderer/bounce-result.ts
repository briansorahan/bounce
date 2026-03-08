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
