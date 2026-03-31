/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  SampleResult,
  VisSceneResult,
  VisScenePromise,
  VisStackResult,
  VisSceneListResult,
} from "../bounce-result.js";
import { renderNamespaceHelp, withHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";
import { visCommands, visDescription } from "./vis-commands.generated.js";
export { visCommands } from "./vis-commands.generated.js";

/**
 * Build and manage waveform and analysis visualizations
 * @namespace vis
 */
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

  function visSceneHelpText(scene: VisSceneResult): BounceResult {
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
    sample: SampleResult,
    titleText?: string,
  ): VisSceneResult {
    const bound = new VisSceneResult(
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

  function bindVisStack(): VisStackResult {
    return new VisStackResult({
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
    description: visDescription,
    help: () => renderNamespaceHelp("vis", visDescription, visCommands),

    waveform: withHelp(
      /**
       * Create a draft VisSceneResult for a sample waveform
       *
       * Create a draft visualization scene rooted in a sample waveform.
       * Chain .overlay()/.panel()/.title() and call .show() to render it.
       *
       * @param sampleOrPromise Resolved SampleResult or SamplePromise to visualize.
       * @example const samp = sn.read("loop.wav")\nconst scene = vis.waveform(samp)\nscene.show()
       * @example vis.waveform(sn.read("kick.wav")).show()
       */
      function waveform(sampleOrPromise: SampleResult | PromiseLike<SampleResult>): VisSceneResult | VisScenePromise {
        if (isPromiseLike<SampleResult>(sampleOrPromise)) {
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
      /**
       * Build multiple visualization scenes in one chained expression
       *
       * Create a VisStackResult and add scenes with .waveform(). Call .show() to render all.
       *
       * @example vis.stack().waveform(a).waveform(b).show()
       */
      function stack(): VisStackResult {
        const bound = bindVisStack();
        (bound as VisStackResult & {
          waveform: (sampleOrPromise: SampleResult | PromiseLike<SampleResult>) => VisStackResult;
        }).waveform = (sampleOrPromise: SampleResult | PromiseLike<SampleResult>) => {
          if (isPromiseLike<SampleResult>(sampleOrPromise)) {
            throw new Error("vis.stack().waveform() requires a resolved SampleResult. Assign sn.read(...) to a variable first.");
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
      /**
       * List currently shown visualization scenes
       *
       * @example vis.list()
       */
      function list(): VisSceneListResult {
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
      /**
       * Remove a shown visualization scene by id
       *
       * @param id Scene id from vis.list().
       * @example vis.remove("scene-1")
       */
      function remove(id: string): BounceResult {
        const removed = deps.getSceneManager().removeScene(id);
        if (!removed) {
          throw new Error(`Scene ${id} not found.`);
        }
        return new BounceResult(`\x1b[32mRemoved scene ${id}\x1b[0m`);
      },
      visCommands[3],
    ),

    clear: withHelp(
      /**
       * Remove all shown visualization scenes
       *
       * @example vis.clear()
       */
      function clear(): BounceResult {
        const removed = deps.getSceneManager().clearScenes();
        return new BounceResult(`\x1b[32mCleared ${removed} visualization scene${removed === 1 ? "" : "s"}\x1b[0m`);
      },
      visCommands[4],
    ),
  };

  return vis;
}
