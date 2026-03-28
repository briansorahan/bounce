/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  Sample,
  VisScene,
  VisScenePromise,
  VisStack,
  VisSceneListResult,
} from "../bounce-result.js";
import { type CommandHelp, renderNamespaceHelp, withHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";

export const visCommands: CommandHelp[] = [
  {
    name: "waveform",
    signature: "vis.waveform(sample)",
    summary: "Create a draft VisScene for a sample waveform",
    description:
      "Create a draft visualization scene rooted in a sample waveform.\n" +
      "Chain .overlay()/.panel()/.title() and call .show() to render it.",
    params: [
      {
        name: "sample",
        type: "Sample | PromiseLike<Sample>",
        description: "Resolved Sample or SamplePromise to visualize.",
      },
    ],
    examples: [
      "const samp = sn.read(\"loop.wav\")\nconst scene = vis.waveform(samp)\nscene.show()",
      "vis.waveform(sn.read(\"kick.wav\")).show()",
    ],
  },
  {
    name: "stack",
    signature: "vis.stack()",
    summary: "Build multiple visualization scenes in one chained expression",
    description:
      "Create a VisStack and add scenes with .waveform(). Call .show() to render all.",
    examples: ["vis.stack().waveform(a).waveform(b).show()"],
  },
  {
    name: "list",
    signature: "vis.list()",
    summary: "List currently shown visualization scenes",
    examples: ["vis.list()"],
  },
  {
    name: "remove",
    signature: "vis.remove(id)",
    summary: "Remove a shown visualization scene by id",
    params: [
      { name: "id", type: "string", description: "Scene id from vis.list()." },
    ],
    examples: ["vis.remove(\"scene-1\")"],
  },
  {
    name: "clear",
    signature: "vis.clear()",
    summary: "Remove all shown visualization scenes",
    examples: ["vis.clear()"],
  },
];

export function buildVisNamespace(deps: NamespaceDeps) {
  function sampleLabel(filePath: string | undefined, hash: string): string {
    return filePath?.split("/").pop() ?? hash.substring(0, 8);
  }

  function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    return (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "then" in value &&
      typeof value.then === "function"
    );
  }

  function visSceneHelpText(scene: VisScene): BounceResult {
    return new BounceResult([
      "\x1b[1;36mVisScene\x1b[0m",
      "",
      `  sample:   ${sampleLabel(scene.sample.filePath, scene.sample.hash)}`,
      `  overlays: ${scene.overlays.length}`,
      `  panels:   ${scene.panels.length}`,
      `  shown:    ${scene.sceneId ? "yes" : "no"}`,
      "",
      "  Methods:",
      "    scene.title(text)",
      "    scene.overlay(feature)",
      "    scene.panel(feature)",
      "    scene.show()",
    ].join("\n"));
  }

  function visStackHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mVisStack\x1b[0m",
      "",
      "  Build multiple visualization scenes in one chained expression.",
      "",
      "  Methods:",
      "    stack.waveform(sample)",
      "    stack.title(text)",
      "    stack.overlay(feature)",
      "    stack.panel(feature)",
      "    stack.show()",
      "",
      "  \x1b[90mExample:\x1b[0m  vis.stack().waveform(a).waveform(b).show()",
    ].join("\n"));
  }

  function bindVisScene(
    sample: Sample,
    titleText?: string,
  ): VisScene {
    const bound = new VisScene(
      sample,
      titleText,
      {
        help: (): BounceResult => visSceneHelpText(bound),
        show: async (scene): Promise<BounceResult> => {
          const rendered = await deps.getSceneManager().renderScene(scene);
          return new BounceResult(
            `\x1b[32mScene ${rendered.id} shown for ${rendered.sampleLabel} (${rendered.overlayCount} overlays, ${rendered.panelCount} panels)\x1b[0m`,
          );
        },
      },
    );
    return bound;
  }

  function bindVisStack(): VisStack {
    return new VisStack({
      help: (): BounceResult => visStackHelpText(),
      show: async (stack): Promise<BounceResult> => {
        if (stack.scenes.length === 0) {
          throw new Error("No scenes in stack. Add at least one waveform before show().");
        }
        const rendered = [];
        for (const scene of stack.scenes) {
          rendered.push(await deps.getSceneManager().renderScene(scene));
        }
        return new BounceResult(
          `\x1b[32mRendered ${rendered.length} scenes (${rendered.map((scene) => scene.id).join(", ")})\x1b[0m`,
        );
      },
    });
  }

  const vis = {
    help: () => renderNamespaceHelp("vis", "Visualization namespace", visCommands),

    waveform: withHelp(
      function waveform(sampleOrPromise: Sample | PromiseLike<Sample>): VisScene | VisScenePromise {
        if (isPromiseLike<Sample>(sampleOrPromise)) {
          return new VisScenePromise(
            Promise.resolve(sampleOrPromise).then((sample) =>
              bindVisScene(sample, `Waveform · ${sampleLabel(sample.filePath, sample.hash)}`),
            ),
          );
        }
        return bindVisScene(sampleOrPromise, `Waveform · ${sampleLabel(sampleOrPromise.filePath, sampleOrPromise.hash)}`);
      },
      visCommands[0],
    ),

    stack: withHelp(
      function stack(): VisStack {
        const bound = bindVisStack();
        (bound as VisStack & {
          waveform: (sampleOrPromise: Sample | PromiseLike<Sample>) => VisStack;
        }).waveform = (sampleOrPromise: Sample | PromiseLike<Sample>) => {
          if (isPromiseLike<Sample>(sampleOrPromise)) {
            throw new Error("vis.stack().waveform() requires a resolved Sample. Assign sn.read(...) to a variable first.");
          }
          return bound.addScene(
            bindVisScene(
              sampleOrPromise,
              `Waveform · ${sampleLabel(sampleOrPromise.filePath, sampleOrPromise.hash)}`,
            ),
          );
        };
        return bound;
      },
      visCommands[1],
    ),

    list: withHelp(
      function listScenes(): VisSceneListResult {
        const scenes = deps.getSceneManager().listScenes();
        const display = scenes.length === 0
          ? "\x1b[90mNo visualization scenes shown\x1b[0m"
          : [
            "\x1b[1;36mVisualization Scenes\x1b[0m",
            "",
            ...scenes.map((scene) =>
              `${scene.id.padEnd(10)} ${scene.title} \x1b[90m(${scene.overlayCount} overlays, ${scene.panelCount} panels)\x1b[0m`,
            ),
          ].join("\n");
        return new VisSceneListResult(display, scenes, () => new BounceResult([
          "\x1b[1;36mvis.list()\x1b[0m",
          "",
          "  List currently shown visualization scenes.",
          "",
          "  \x1b[90mExample:\x1b[0m  vis.list()",
        ].join("\n")));
      },
      visCommands[2],
    ),

    remove: withHelp(
      function removeScene(id: string): BounceResult {
        const removed = deps.getSceneManager().removeScene(id);
        if (!removed) {
          throw new Error(`Scene ${id} not found.`);
        }
        return new BounceResult(`\x1b[32mRemoved scene ${id}\x1b[0m`);
      },
      visCommands[3],
    ),

    clear: withHelp(
      function clearScenes(): BounceResult {
        const removed = deps.getSceneManager().clearScenes();
        return new BounceResult(`\x1b[32mCleared ${removed} visualization scene${removed === 1 ? "" : "s"}\x1b[0m`);
      },
      visCommands[4],
    ),
  };

  return vis;
}
