import { attachMethodHelpFromRegistry } from "../help.js";
import { BounceResult, HelpableResult, isPromiseLike, type HelpFactory } from "./base.js";
import type { SliceFeatureResult, NmfFeatureResult, NxFeatureResult } from "./features.js";
import type { SampleResult } from "./sample.js";
import { replType, describe, param } from "../../shared/repl-registry.js";

export interface VisSceneBindings {
  help: HelpFactory;
  show: (scene: VisSceneResult) => Promise<BounceResult>;
}

export interface VisStackBindings {
  help: HelpFactory;
  show: (stack: VisStackResult) => Promise<BounceResult>;
}

export interface VisSceneSummary {
  id: string;
  title: string;
  sampleHash: string;
  sampleLabel: string;
  overlayCount: number;
  panelCount: number;
}

@replType("VisScene", { summary: "A visualization scene for a sample" })
export class VisSceneResult extends HelpableResult {
  readonly overlays: Array<SliceFeatureResult | NmfFeatureResult | NxFeatureResult> = [];
  readonly panels: NmfFeatureResult[] = [];
  private readonly pendingOps: Array<Promise<void>> = [];
  private shownSceneId: string | undefined;
  public titleText: string | undefined;

  constructor(
    public readonly sample: SampleResult,
    titleText: string | undefined,
    private readonly bindings: VisSceneBindings,
  ) {
    super("", bindings.help);
    this.titleText = titleText;
    attachMethodHelpFromRegistry(this, "VisScene");
  }

  override toString(): string {
    const label = this.sample.filePath?.split(/[/\\]/).pop() ?? this.sample.hash.substring(0, 8);
    return [
      `\x1b[1;36mVisScene${this.shownSceneId ? ` ${this.shownSceneId}` : ""}\x1b[0m`,
      "",
      `  sample:   ${label}`,
      `  overlays: ${this.overlays.length}`,
      `  panels:   ${this.panels.length}`,
      `  shown:    ${this.shownSceneId ? "yes" : "no"}`,
      this.titleText ? `  title:    ${this.titleText}` : "",
    ].filter(Boolean).join("\n");
  }

  get sceneId(): string | undefined {
    return this.shownSceneId;
  }

  @describe({ summary: "Set the title text for this scene.", returns: "VisScene" })
  @param("text", { summary: "Title string to display.", kind: "plain" })
  title(text: string): VisSceneResult {
    this.titleText = text;
    return this;
  }

  @describe({ summary: "Add a feature overlay (slice, NMF, or NX) to this scene.", returns: "VisScene" })
  @param("feature", { summary: "SliceFeature, NmfFeature, or NxFeature to overlay.", kind: "typed", expectedType: "SliceFeatureResult | NmfFeatureResult | NxFeatureResult" })
  overlay(feature: SliceFeatureResult | NmfFeatureResult | NxFeatureResult | PromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>): VisSceneResult {
    if (isPromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { this.overlays.push(f); }));
    } else {
      this.overlays.push(feature);
    }
    return this;
  }

  @describe({ summary: "Add an NMF feature as a separate panel below the main scene.", returns: "VisScene" })
  @param("feature", { summary: "NmfFeature to display as a panel.", kind: "typed", expectedType: "NmfFeatureResult" })
  panel(feature: NmfFeatureResult | PromiseLike<NmfFeatureResult>): VisSceneResult {
    if (isPromiseLike<NmfFeatureResult>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { this.panels.push(f); }));
    } else {
      this.panels.push(feature);
    }
    return this;
  }

  @describe({ summary: "Render this scene in the terminal visualization panel.", returns: "BounceResult" })
  show(): Promise<BounceResult> {
    return Promise.all(this.pendingOps).then(() => this.bindings.show(this));
  }

  @describe({ summary: "Record the scene ID after it has been rendered.", visibility: "plumbing" })
  @param("id", { summary: "Rendered scene identifier.", kind: "plain" })
  markShown(id: string): void {
    this.shownSceneId = id;
  }
}

export class VisScenePromise implements PromiseLike<VisSceneResult> {
  constructor(private readonly promise: Promise<VisSceneResult>) {}

  then<TResult1 = VisSceneResult, TResult2 = never>(
    onfulfilled?: ((value: VisSceneResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<VisSceneResult | TResult> {
    return this.promise.catch(onrejected);
  }

  title(text: string): VisScenePromise {
    return new VisScenePromise(this.promise.then((scene) => scene.title(text)));
  }

  overlay(feature: SliceFeatureResult | NmfFeatureResult | NxFeatureResult | PromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>): VisScenePromise {
    return new VisScenePromise(
      Promise.all([this.promise, Promise.resolve(feature)]).then(([scene, f]) => scene.overlay(f)),
    );
  }

  panel(feature: NmfFeatureResult | PromiseLike<NmfFeatureResult>): VisScenePromise {
    return new VisScenePromise(
      Promise.all([this.promise, Promise.resolve(feature)]).then(([scene, f]) => scene.panel(f)),
    );
  }

  show(): Promise<BounceResult> {
    return this.promise.then((scene) => scene.show());
  }
}

export class VisSceneListResult extends HelpableResult {
  constructor(
    display: string,
    public readonly scenes: VisSceneSummary[],
    helpFactory: HelpFactory,
  ) {
    super(display, helpFactory);
  }

  get length(): number {
    return this.scenes.length;
  }
}

@replType("VisStack", { summary: "A stack of visualization scenes" })
export class VisStackResult extends HelpableResult {
  readonly scenes: VisSceneResult[] = [];
  private readonly pendingOps: Array<Promise<void>> = [];

  constructor(private readonly bindings: VisStackBindings) {
    super("", bindings.help);
    attachMethodHelpFromRegistry(this, "VisStack");
  }

  override toString(): string {
    return [
      "\x1b[1;36mVisStack\x1b[0m",
      "",
      `  scenes: ${this.scenes.length}`,
      this.scenes.length > 0
        ? `  latest: ${this.scenes[this.scenes.length - 1].sample.filePath?.split(/[/\\]/).pop() ?? this.scenes[this.scenes.length - 1].sample.hash.substring(0, 8)}`
        : "  latest: none",
    ].join("\n");
  }

  @describe({ summary: "Add a waveform scene for a sample. Replaced at runtime by vis.stack().", visibility: "plumbing" })
  @param("sample", { summary: "SampleResult to visualize.", kind: "typed", expectedType: "SampleResult" })
  waveform(_sample: SampleResult): VisStackResult {
    throw new Error("Use vis.stack().waveform(sample) from the vis namespace.");
  }

  @describe({ summary: "Append a pre-built VisScene to this stack.", visibility: "plumbing" })
  @param("scene", { summary: "VisSceneResult to add.", kind: "typed", expectedType: "VisSceneResult" })
  addScene(scene: VisSceneResult): VisStackResult {
    this.scenes.push(scene);
    return this;
  }

  @describe({ summary: "Set the title of the most recently added scene.", returns: "VisStack" })
  @param("text", { summary: "Title string to display.", kind: "plain" })
  title(text: string): VisStackResult {
    this.requireLatestScene().title(text);
    return this;
  }

  @describe({ summary: "Add a feature overlay to the most recently added scene.", returns: "VisStack" })
  @param("feature", { summary: "SliceFeature, NmfFeature, or NxFeature to overlay.", kind: "typed", expectedType: "SliceFeatureResult | NmfFeatureResult | NxFeatureResult" })
  overlay(feature: SliceFeatureResult | NmfFeatureResult | NxFeatureResult | PromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>): VisStackResult {
    const latest = this.requireLatestScene();
    if (isPromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { latest.overlay(f); }));
    } else {
      latest.overlay(feature);
    }
    return this;
  }

  @describe({ summary: "Add an NMF feature panel to the most recently added scene.", returns: "VisStack" })
  @param("feature", { summary: "NmfFeature to display as a panel.", kind: "typed", expectedType: "NmfFeatureResult" })
  panel(feature: NmfFeatureResult | PromiseLike<NmfFeatureResult>): VisStackResult {
    const latest = this.requireLatestScene();
    if (isPromiseLike<NmfFeatureResult>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { latest.panel(f); }));
    } else {
      latest.panel(feature);
    }
    return this;
  }

  @describe({ summary: "Render all scenes in this stack in the visualization panel.", returns: "BounceResult" })
  show(): Promise<BounceResult> {
    return Promise.all(this.pendingOps).then(() => this.bindings.show(this));
  }

  private requireLatestScene(): VisSceneResult {
    const latest = this.scenes[this.scenes.length - 1];
    if (!latest) {
      throw new Error("No scenes in stack. Call stack.waveform(sample) first.");
    }
    return latest;
  }
}
