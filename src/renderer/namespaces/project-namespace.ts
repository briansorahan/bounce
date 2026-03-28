/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  ProjectResult,
  ProjectListResult,
  type ProjectSummary,
} from "../bounce-result.js";
import { renderNamespaceHelp, withHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";
import { projCommands } from "./proj-commands.generated.js";
export { projCommands } from "./proj-commands.generated.js";

export const projectCommands = projCommands;

/** @namespace proj */
export function buildProjectNamespace(deps: NamespaceDeps) {
  function makeProjectDisplayText(project: ProjectSummary, heading = "Current Project"): string {
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

  function projectSummaryHelpText(project: ProjectResult): BounceResult {
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

  function projectListHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mproj.list()\x1b[0m",
      "",
      "  List all projects with sample, feature, and command counts.",
      "",
      "  \x1b[90mExample:\x1b[0m  proj.list()",
    ].join("\n"));
  }

  function bindProject(project: ProjectData, heading = "Current Project"): ProjectResult {
    let result: ProjectResult | null = null;
    const helpFactory = (): BounceResult => {
      if (!result) {
        throw new Error("Project help is not available before initialization.");
      }
      return projectSummaryHelpText(result);
    };
    const bound: ProjectResult = new ProjectResult(
      makeProjectDisplayText(
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

  function formatProjectsTable(projects: ProjectData[]): string {
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

  function dispatchProjectChanged(): void {
    if (typeof window.dispatchEvent !== "function") {
      return;
    }
    if (typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("bounce:project-changed"));
      return;
    }
    if (typeof Event === "function") {
      window.dispatchEvent(new Event("bounce:project-changed"));
    }
  }

  const proj = {
    toString(): string {
      return renderNamespaceHelp("proj", "Project namespace", projectCommands).toString();
    },

    help: () => renderNamespaceHelp("proj", "Project namespace", projectCommands),

    current: withHelp(
      /**
       * Return the active project and its stored counts
       *
       * @example proj.current()
       */
      async function current(): Promise<ProjectResult> {
        const project = await window.electron.getCurrentProject();
        if (!project) {
          throw new Error("No current project is available.");
        }
        return bindProject(project);
      },
      projectCommands[0],
    ),

    list: withHelp(
      /**
       * List all projects with sample, feature, and command counts
       *
       * @example proj.list()
       */
      async function list(): Promise<ProjectListResult> {
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
          formatProjectsTable(projects),
          summaries,
          projectListHelpText,
        );
      },
      projectCommands[1],
    ),

    load: withHelp(
      /**
       * Load a project by name, creating it if needed
       *
       * Load a project by name. If it does not exist, Bounce creates it and
       * makes it the current project.
       *
       * @param name Project name to load or create.
       * @example proj.load("drums")
       */
      async function load(name: string): Promise<ProjectResult> {
        if (deps.runtime) {
          const entries = deps.runtime.serializeScope();
          await window.electron.saveReplEnv(entries);
        }
        const project = await window.electron.loadProject(name);
        if (deps.onProjectLoad) {
          await deps.onProjectLoad();
        } else {
          dispatchProjectChanged();
        }
        return bindProject(project, "Loaded Project");
      },
      projectCommands[2],
    ),

    rm: withHelp(
      /**
       * Remove a project and all its scoped data
       *
       * Remove a project and all samples, features, and command history
       * stored inside it. The current project cannot be removed.
       *
       * @param name Name of the project to remove.
       * @example proj.rm("drums")
       */
      async function rm(name: string): Promise<BounceResult> {
        const result = await window.electron.removeProject(name);
        return new BounceResult(
          `\x1b[32mRemoved project ${result.removedName}.\x1b[0m`,
        );
      },
      projectCommands[3],
    ),
  };

  return proj;
}