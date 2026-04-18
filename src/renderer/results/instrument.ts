import { BounceResult, HelpableResult, type HelpFactory } from "./base.js";
import { replType } from "../../shared/repl-registry.js";

@replType("InstrumentResult", { summary: "A sampler or granular instrument" })
export class InstrumentResult extends HelpableResult {
  constructor(
    display: string,
    public readonly instrumentId: string,
    public readonly name: string,
    public readonly kind: string,
    public readonly polyphony: number,
    public readonly sampleCount: number,
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }
}

export class InstrumentListResult extends BounceResult {
  readonly #instruments: Array<{
    name: string;
    kind: string;
    sampleCount: number;
  }>;

  constructor(
    display: string,
    instruments: Array<{
      name: string;
      kind: string;
      sampleCount: number;
    }>,
  ) {
    super(display);
    this.#instruments = instruments;
  }

  get instruments(): Array<{ name: string; kind: string; sampleCount: number }> {
    return this.#instruments;
  }

  get length(): number {
    return this.#instruments.length;
  }

  [Symbol.iterator](): Iterator<{ name: string; kind: string; sampleCount: number }> {
    return this.#instruments[Symbol.iterator]();
  }
}
