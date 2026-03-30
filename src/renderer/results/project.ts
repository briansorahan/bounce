import { BounceResult, HelpableResult, type HelpFactory } from "./base.js";

export interface ProjectSummary {
  id: number;
  name: string;
  createdAt: string;
  sampleCount: number;
  featureCount: number;
  commandCount: number;
  current: boolean;
}

export class ProjectResult extends HelpableResult {
  constructor(
    display: string,
    public readonly id: number,
    public readonly name: string,
    public readonly createdAt: string,
    public readonly sampleCount: number,
    public readonly featureCount: number,
    public readonly commandCount: number,
    public readonly current: boolean,
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }
}

export class ProjectListResult extends HelpableResult {
  constructor(
    display: string,
    public readonly projects: ProjectSummary[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }

  get length(): number {
    return this.projects.length;
  }
}

export type ProjectNamespace = {
  toString(): string;
  help(): BounceResult;
  current: (() => Promise<ProjectResult>) & { help: () => BounceResult };
  list: (() => Promise<ProjectListResult>) & { help: () => BounceResult };
  load: ((name: string) => Promise<ProjectResult>) & { help: () => BounceResult };
  rm: ((name: string) => Promise<BounceResult>) & { help: () => BounceResult };
};
