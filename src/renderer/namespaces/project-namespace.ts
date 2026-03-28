/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  ProjectNamespace,
  ProjectResult,
  ProjectListResult,
  type ProjectSummary,
} from "../bounce-result.js";
import { type CommandHelp, renderNamespaceHelp, renderCommandHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";

export const projectCommands: CommandHelp[] = [
  {
    name: "current",
    signature: "proj.current()",
    summary: "Return the active project and its stored counts",
    examples: ["proj.current()"],
  },
  {
    name: "list",
    signature: "proj.list()",
    summary: "List all projects with sample, feature, and command counts",
    examples: ["proj.list()"],
  },
  {
    name: "load",
    signature: "proj.load(name)",
    summary: "Load a project by name, creating it if needed",
    description:
      "Load a project by name. If it does not exist, Bounce creates it and\n" +
      "makes it the current project.",
    params: [
      { name: "name", type: "string", description: "Project name to load or create." },
    ],
    examples: ["proj.load(\"drums\")"],
  },
  {
    name: "rm",
    signature: "proj.rm(name)",
    summary: "Remove a project and all its scoped data",
    description:
      "Remove a project and all samples, features, and command history\n" +
      "stored inside it. The current project cannot be removed.",
    params: [
      { name: "name", type: "string", description: "Name of the project to remove." },
    ],
    examples: ["proj.rm(\"drums\")"],
  },
];

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

  const proj = new ProjectNamespace(
    renderNamespaceHelp("proj", "Project namespace", projectCommands).toString(),
    {
      help: () => renderNamespaceHelp("proj", "Project namespace", projectCommands),
      current: async () => {
        const project = await window.electron.getCurrentProject();
        if (!project) {
          throw new Error("No current project is available.");
        }
        return bindProject(project);
      },
      list: async () => {
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
      load: async (name: string) => {
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
      rm: async (name: string) => {
        const result = await window.electron.removeProject(name);
        return new BounceResult(
          `\x1b[32mRemoved project ${result.removedName}.\x1b[0m`,
        );
      },
    },
  );

  (proj.current as typeof proj.current & { help?: () => BounceResult }).help = () =>
    renderCommandHelp(projectCommands[0]);
  (proj.list as typeof proj.list & { help?: () => BounceResult }).help = () =>
    renderCommandHelp(projectCommands[1]);
  (proj.load as typeof proj.load & { help?: () => BounceResult }).help = () =>
    renderCommandHelp(projectCommands[2]);
  (proj.rm as typeof proj.rm & { help?: () => BounceResult }).help = () =>
    renderCommandHelp(projectCommands[3]);

  return proj;
}
