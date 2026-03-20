import { HelpableResult, type HelpFactory } from "./base.js";

export type EnvEntryScope = "user" | "global";
export type EnvInspectScope = EnvEntryScope | "value";

export interface EnvEntrySummary {
  name: string;
  scope: EnvEntryScope;
  typeLabel: string;
  callable: boolean;
  preview: string;
}

export class EnvScopeResult extends HelpableResult {
  constructor(
    display: string,
    public readonly entries: EnvEntrySummary[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }

  get length(): number {
    return this.entries.length;
  }

  [Symbol.iterator](): Iterator<EnvEntrySummary> {
    return this.entries[Symbol.iterator]();
  }
}

export class EnvInspectionResult extends HelpableResult {
  constructor(
    display: string,
    public readonly name: string | undefined,
    public readonly scope: EnvInspectScope,
    public readonly typeLabel: string,
    public readonly callable: boolean,
    public readonly preview: string,
    public readonly callableMembers: string[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }
}

export class EnvFunctionListResult extends HelpableResult {
  constructor(
    display: string,
    public readonly targetType: string,
    public readonly functions: string[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }

  get length(): number {
    return this.functions.length;
  }

  [Symbol.iterator](): Iterator<string> {
    return this.functions[Symbol.iterator]();
  }
}
