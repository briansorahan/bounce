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
import type { NamespaceDeps } from "./types.js";

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

  function visListHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mvis.list()\x1b[0m",
      "",
      "  List currently shown visualization scenes.",
      "",
      "  \x1b[90mExample:\x1b[0m  vis.list()",
    ].join("\n"));
  }

  function visWaveformHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mvis.waveform(sample)\x1b[0m",
      "",
      "  Create a draft visualization scene rooted in a sample waveform.",
      "  Chain overlay()/panel()/title() and call show() to render it.",
      "",
      "  \x1b[90mExample:\x1b[0m  const samp = sn.read(\"loop.wav\")",
      "           const scene = vis.waveform(samp)",
      "           scene.show()",
    ].join("\n"));
  }

  function visHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mvis\x1b[0m — visualization namespace",
      "",
      "  Use vis.waveform(sample) to create a draft scene, then compose and show it.",
      "  Use vis.stack() to build and show multiple scenes in one expression.",
      "",
      "  vis.waveform(sample)    Create a VisScene",
      "  vis.stack()             Create a VisStack",
      "  vis.list()              List shown scenes",
      "  vis.remove(id)          Remove one shown scene",
      "  vis.clear()             Remove all shown scenes",
      "",
      "  \x1b[90mExample:\x1b[0m  const scene = vis.waveform(samp)",
      "           scene.overlay(onsets).panel(nmf).show()",
      "           vis.stack().waveform(a).waveform(b).show()",
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
    help(): BounceResult {
      return visHelpText();
    },

    waveform: Object.assign(
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
      {
        help: (): BounceResult => visWaveformHelpText(),
      },
    ),

    stack: Object.assign(
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
      {
        help: (): BounceResult => visStackHelpText(),
      },
    ),

    list: Object.assign(
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
        return new VisSceneListResult(display, scenes, visListHelpText);
      },
      {
        help: (): BounceResult => visListHelpText(),
      },
    ),

    remove: Object.assign(
      function removeScene(id: string): BounceResult {
        const removed = deps.getSceneManager().removeScene(id);
        if (!removed) {
          throw new Error(`Scene ${id} not found.`);
        }
        return new BounceResult(`\x1b[32mRemoved scene ${id}\x1b[0m`);
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mvis.remove(id)\x1b[0m",
          "",
          "  Remove a shown visualization scene by id.",
          "",
          "  \x1b[90mExample:\x1b[0m  vis.remove(\"scene-1\")",
        ].join("\n")),
      },
    ),

    clear: Object.assign(
      function clearScenes(): BounceResult {
        const removed = deps.getSceneManager().clearScenes();
        return new BounceResult(`\x1b[32mCleared ${removed} visualization scene${removed === 1 ? "" : "s"}\x1b[0m`);
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mvis.clear()\x1b[0m",
          "",
          "  Remove all shown visualization scenes.",
          "",
          "  \x1b[90mExample:\x1b[0m  vis.clear()",
        ].join("\n")),
      },
    ),
  };

  return vis;
}
