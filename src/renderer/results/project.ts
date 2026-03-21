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

export interface ProjectNamespaceBindings {
  help: HelpFactory;
  current: () => Promise<ProjectResult>;
  list: () => Promise<ProjectListResult>;
  load: (name: string) => Promise<ProjectResult>;
  rm: (name: string) => Promise<BounceResult>;
}

export class ProjectNamespace extends HelpableResult {
  constructor(
    display: string,
    private readonly bindings: ProjectNamespaceBindings,
  ) {
    super(display, bindings.help);
  }

  current(): Promise<ProjectResult> {
    return this.bindings.current();
  }

  list(): Promise<ProjectListResult> {
    return this.bindings.list();
  }

  load(name: string): Promise<ProjectResult> {
    return this.bindings.load(name);
  }

  rm(name: string): Promise<BounceResult> {
    return this.bindings.rm(name);
  }
}
