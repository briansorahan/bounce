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
import type { NamespaceDeps } from "./types.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { visCommands } from "./vis-commands.generated.js";
export { visCommands } from "./vis-commands.generated.js";

@namespace("vis", { summary: "Build and manage waveform and analysis visualizations" })
export class VisNamespace {
  /** Namespace summary — used by the globals help() function. */
  readonly description = "Build and manage waveform and analysis visualizations";

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
    summary: "Create a draft VisSceneResult for a sample waveform. Chain .overlay()/.panel()/.title() and call .show() to render.",
    returns: "VisScene",
  })
  @param("sampleOrPromise", {
    summary: "Resolved SampleResult or SamplePromise to visualize.",
    kind: "typed",
    expectedType: "SampleResult",
  })
  waveform(sampleOrPromise: SampleResult | PromiseLike<SampleResult>): VisSceneResult | VisScenePromise {
    if (this.isPromiseLike<SampleResult>(sampleOrPromise)) {
      return new VisScenePromise(
        Promise.resolve(sampleOrPromise).then((sample) =>
          this.bindVisScene(sample, `Waveform · ${this.sampleLabel(sample.filePath, sample.hash)}`),
        ),
      );
    }
    return this.bindVisScene(sampleOrPromise, `Waveform · ${this.sampleLabel(sampleOrPromise.filePath, sampleOrPromise.hash)}`);
  }

  @describe({
    summary: "Build multiple visualization scenes in one chained expression. Add scenes with .waveform(), render all with .show().",
    returns: "VisStack",
  })
  stack(): VisStackResult {
    const bound = this.bindVisStack();
    (bound as VisStackResult & {
      waveform: (sampleOrPromise: SampleResult | PromiseLike<SampleResult>) => VisStackResult;
    }).waveform = (sampleOrPromise: SampleResult | PromiseLike<SampleResult>) => {
      if (this.isPromiseLike<SampleResult>(sampleOrPromise)) {
        throw new Error("vis.stack().waveform() requires a resolved SampleResult. Assign sn.read(...) to a variable first.");
      }
      return bound.addScene(
        this.bindVisScene(
          sampleOrPromise,
          `Waveform · ${this.sampleLabel(sampleOrPromise.filePath, sampleOrPromise.hash)}`,
        ),
      );
    };
    return bound;
  }

  @describe({
    summary: "List currently shown visualization scenes.",
    returns: "VisSceneListResult",
  })
  list(): VisSceneListResult {
    const scenes = this.deps.getSceneManager().listScenes();
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
  }

  @describe({
    summary: "Remove a shown visualization scene by id.",
    returns: "BounceResult",
  })
  @param("id", { summary: "Scene id from vis.list().", kind: "plain" })
  remove(id: string): BounceResult {
    const removed = this.deps.getSceneManager().removeScene(id);
    if (!removed) throw new Error(`Scene ${id} not found.`);
    return new BounceResult(`\x1b[32mRemoved scene ${id}\x1b[0m`);
  }

  @describe({
    summary: "Remove all shown visualization scenes.",
    returns: "BounceResult",
  })
  clear(): BounceResult {
    const removed = this.deps.getSceneManager().clearScenes();
    return new BounceResult(`\x1b[32mCleared ${removed} visualization scene${removed === 1 ? "" : "s"}\x1b[0m`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private sampleLabel(filePath: string | undefined, hash: string): string {
    return filePath?.split("/").pop() ?? hash.substring(0, 8);
  }

  private isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    return (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "then" in (value as object) &&
      typeof (value as { then: unknown }).then === "function"
    );
  }

  private visSceneHelpText(scene: VisSceneResult): BounceResult {
    return new BounceResult([
      "\x1b[1;36mVisScene\x1b[0m",
      "",
      `  sample:   ${this.sampleLabel(scene.sample.filePath, scene.sample.hash)}`,
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

  private visStackHelpText(): BounceResult {
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

  private bindVisScene(sample: SampleResult, titleText?: string): VisSceneResult {
    const bound = new VisSceneResult(
      sample,
      titleText,
      {
        help: (): BounceResult => this.visSceneHelpText(bound),
        show: async (scene): Promise<BounceResult> => {
          const rendered = await this.deps.getSceneManager().renderScene(scene);
          return new BounceResult(
            `\x1b[32mScene ${rendered.id} shown for ${rendered.sampleLabel} (${rendered.overlayCount} overlays, ${rendered.panelCount} panels)\x1b[0m`,
          );
        },
      },
    );
    return bound;
  }

  private bindVisStack(): VisStackResult {
    return new VisStackResult({
      help: (): BounceResult => this.visStackHelpText(),
      show: async (stack): Promise<BounceResult> => {
        if (stack.scenes.length === 0) {
          throw new Error("No scenes in stack. Add at least one waveform before show().");
        }
        const rendered = [];
        for (const scene of stack.scenes) {
          rendered.push(await this.deps.getSceneManager().renderScene(scene));
        }
        return new BounceResult(
          `\x1b[32mRendered ${rendered.length} scenes (${rendered.map((scene) => scene.id).join(", ")})\x1b[0m`,
        );
      },
    });
  }
}

/** @deprecated Use `new VisNamespace(deps)` directly. Kept for backward compatibility. */
export function buildVisNamespace(deps: NamespaceDeps): VisNamespace {
  return new VisNamespace(deps);
}

// Re-export commands array for any consumers of the old JSDoc-generated metadata.
export { visCommands as visNamespaceCommands };
