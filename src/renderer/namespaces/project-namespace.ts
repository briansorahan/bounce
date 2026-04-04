/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  ProjectResult,
  ProjectListResult,
  type ProjectSummary,
} from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { projCommands } from "./proj-commands.generated.js";
export { projCommands } from "./proj-commands.generated.js";

export const projectCommands = projCommands;

@namespace("proj", { summary: "Manage Bounce projects — create, switch, and list" })
export class ProjectNamespace {
  /** Namespace summary — used by the globals help() function. */
  readonly description = "Manage Bounce projects — create, switch, and list";

  constructor(private readonly deps: NamespaceDeps) {}

  // ── Injected by @namespace decorator — do not implement manually ──────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  help(): unknown {
    // Replaced at class definition time by the @namespace decorator.
    return undefined;
  }

  toString(): string {
    return String(this.help());
  }

  // ── Public REPL-facing methods ────────────────────────────────────────────

  @describe({
    summary: "Return the active project and its stored counts.",
    returns: "ProjectResult",
  })
  async current(): Promise<ProjectResult> {
    const project = await window.electron.getCurrentProject();
    if (!project) {
      throw new Error("No current project is available.");
    }
    return this.bindProject(project);
  }

  @describe({
    summary: "List all projects with sample, feature, and command counts.",
    returns: "ProjectListResult",
  })
  async list(): Promise<ProjectListResult> {
    const projects = await window.electron.listProjects();
    const summaries: ProjectSummary[] = projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.created_at,
      sampleCount: project.sample_count,
      featureCount: project.feature_count,
      commandCount: project.command_count,
      current: project.current,
    }));
    return new ProjectListResult(
      this.formatProjectsTable(projects),
      summaries,
      () => this.projectListHelpText(),
    );
  }

  @describe({
    summary: "Load a project by name, creating it if needed.",
    returns: "ProjectResult",
  })
  @param("name", { summary: "Project name to load or create.", kind: "plain" })
  async load(name: string): Promise<ProjectResult> {
    if (this.deps.runtime) {
      const entries = this.deps.runtime.serializeScope();
      await window.electron.saveReplEnv(entries);
    }
    const project = await window.electron.loadProject(name);
    if (this.deps.onProjectLoad) {
      await this.deps.onProjectLoad();
    } else {
      this.dispatchProjectChanged();
    }
    return this.bindProject(project, "Loaded Project");
  }

  @describe({
    summary: "Remove a project and all its scoped data. The current project cannot be removed.",
    returns: "BounceResult",
  })
  @param("name", { summary: "Name of the project to remove.", kind: "plain" })
  async rm(name: string): Promise<BounceResult> {
    const result = await window.electron.removeProject(name);
    return new BounceResult(`\x1b[32mRemoved project ${result.removedName}.\x1b[0m`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private makeProjectDisplayText(project: ProjectSummary, heading = "Current Project"): string {
    return [
      `\x1b[1;36m${heading}\x1b[0m`,
      "",
      `  name:      ${project.name}`,
      `  samples:   ${project.sampleCount}`,
      `  features:  ${project.featureCount}`,
      `  commands:  ${project.commandCount}`,
      `  created:   ${project.createdAt}`,
    ].join("\n");
  }

  private projectSummaryHelpText(project: ProjectResult): BounceResult {
    return new BounceResult([
      `\x1b[1;36mProject ${project.name}\x1b[0m`,
      "",
      `  samples:   ${project.sampleCount}`,
      `  features:  ${project.featureCount}`,
      `  commands:  ${project.commandCount}`,
      `  created:   ${project.createdAt}`,
      "",
      "  Use proj.list(), proj.load(name), and proj.rm(name) to manage projects.",
    ].join("\n"));
  }

  private projectListHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mproj.list()\x1b[0m",
      "",
      "  List all projects with sample, feature, and command counts.",
      "",
      "  \x1b[90mExample:\x1b[0m  proj.list()",
    ].join("\n"));
  }

  private bindProject(project: ProjectData, heading = "Current Project"): ProjectResult {
    let result: ProjectResult | null = null;
    const helpFactory = (): BounceResult => {
      if (!result) throw new Error("Project help is not available before initialization.");
      return this.projectSummaryHelpText(result);
    };
    const bound: ProjectResult = new ProjectResult(
      this.makeProjectDisplayText(
        {
          id: project.id,
          name: project.name,
          createdAt: project.created_at,
          sampleCount: project.sample_count,
          featureCount: project.feature_count,
          commandCount: project.command_count,
          current: project.current,
        },
        heading,
      ),
      project.id,
      project.name,
      project.created_at,
      project.sample_count,
      project.feature_count,
      project.command_count,
      project.current,
      helpFactory,
    );
    result = bound;
    return bound;
  }

  private formatProjectsTable(projects: ProjectData[]): string {
    if (projects.length === 0) {
      return "\x1b[90mNo projects\x1b[0m";
    }

    const nameWidth = Math.max(
      "Name".length,
      ...projects.map((project) => project.name.length),
    );

    const header =
      `${"Cur".padEnd(4)}` +
      `${"Name".padEnd(nameWidth + 2)}` +
      `${"Samples".padStart(8)}  ` +
      `${"Features".padStart(8)}  ` +
      `${"Commands".padStart(8)}  ` +
      "Created";

    const rows = projects.map((project) =>
      `${(project.current ? "*" : "").padEnd(4)}` +
      `${project.name.padEnd(nameWidth + 2)}` +
      `${String(project.sample_count).padStart(8)}  ` +
      `${String(project.feature_count).padStart(8)}  ` +
      `${String(project.command_count).padStart(8)}  ` +
      project.created_at,
    );

    return [
      "\x1b[1;36mProjects\x1b[0m",
      "",
      header,
      "─".repeat(header.length),
      ...rows,
    ].join("\n");
  }

  private dispatchProjectChanged(): void {
    if (typeof window.dispatchEvent !== "function") return;
    if (typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("bounce:project-changed"));
      return;
    }
    if (typeof Event === "function") {
      window.dispatchEvent(new Event("bounce:project-changed"));
    }
  }
}

/** @deprecated Use `new ProjectNamespace(deps)` directly. Kept for backward compatibility. */
export function buildProjectNamespace(deps: NamespaceDeps): ProjectNamespace {
  return new ProjectNamespace(deps);
}

// Re-export commands array for any consumers of the old JSDoc-generated metadata.
export { projCommands as projNamespaceCommands };
