import type { SampleResult } from "./sample.js";

export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof (value as PromiseLike<T>)?.then === "function";
}

/**
 * Base class for all Bounce REPL command results.
 * Subclasses carry typed data enabling command composition.
 * toString() returns the pre-formatted ANSI string shown in the terminal.
 */
export class BounceResult {
  constructor(private readonly displayText: string) {}

  toString(): string {
    return this.displayText;
  }
}

export type HelpFactory = () => BounceResult;

export function defaultHelp(name: string): BounceResult {
  return new BounceResult(`\x1b[1;36m${name}\x1b[0m`);
}

export class HelpableResult extends BounceResult {
  constructor(
    display: string,
    private readonly helpFactory: HelpFactory,
  ) {
    super(display);
  }

  help(): BounceResult {
    return this.helpFactory();
  }
}

/**
 * Base feature result object.
 */
export class FeatureResult extends HelpableResult {
  public readonly source: SampleResult | undefined;
  public readonly sourceHash: string;

  constructor(
    display: string,
    source: SampleResult | string,
    public readonly featureHash: string,
    public readonly featureType: string,
    public readonly options: unknown,
    helpFactory: HelpFactory = () => defaultHelp(featureType),
  ) {
    super(display, helpFactory);
    this.source = typeof source === "string" ? undefined : source;
    this.sourceHash = typeof source === "string" ? source : source.hash;
  }
}
