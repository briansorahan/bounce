import { BounceResult, HelpableResult, isPromiseLike, type HelpFactory } from "./base.js";
import type { SliceFeatureResult, NmfFeatureResult, NxFeatureResult } from "./features.js";
import type { SampleResult } from "./sample.js";

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

  title(text: string): VisSceneResult {
    this.titleText = text;
    return this;
  }

  overlay(feature: SliceFeatureResult | NmfFeatureResult | NxFeatureResult | PromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>): VisSceneResult {
    if (isPromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { this.overlays.push(f); }));
    } else {
      this.overlays.push(feature);
    }
    return this;
  }

  panel(feature: NmfFeatureResult | PromiseLike<NmfFeatureResult>): VisSceneResult {
    if (isPromiseLike<NmfFeatureResult>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { this.panels.push(f); }));
    } else {
      this.panels.push(feature);
    }
    return this;
  }

  show(): Promise<BounceResult> {
    return Promise.all(this.pendingOps).then(() => this.bindings.show(this));
  }

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

export class VisStackResult extends HelpableResult {
  readonly scenes: VisSceneResult[] = [];
  private readonly pendingOps: Array<Promise<void>> = [];

  constructor(private readonly bindings: VisStackBindings) {
    super("", bindings.help);
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

  waveform(_sample: SampleResult): VisStackResult {
    throw new Error("Use vis.stack().waveform(sample) from the vis namespace.");
  }

  addScene(scene: VisSceneResult): VisStackResult {
    this.scenes.push(scene);
    return this;
  }

  title(text: string): VisStackResult {
    this.requireLatestScene().title(text);
    return this;
  }

  overlay(feature: SliceFeatureResult | NmfFeatureResult | NxFeatureResult | PromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>): VisStackResult {
    const latest = this.requireLatestScene();
    if (isPromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { latest.overlay(f); }));
    } else {
      latest.overlay(feature);
    }
    return this;
  }

  panel(feature: NmfFeatureResult | PromiseLike<NmfFeatureResult>): VisStackResult {
    const latest = this.requireLatestScene();
    if (isPromiseLike<NmfFeatureResult>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { latest.panel(f); }));
    } else {
      latest.panel(feature);
    }
    return this;
  }

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
