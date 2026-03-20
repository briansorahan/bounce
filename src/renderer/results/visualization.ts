import { BounceResult, HelpableResult, isPromiseLike, type HelpFactory } from "./base.js";
import type { OnsetFeature, NmfFeature, NxFeature } from "./features.js";
import type { Sample } from "./sample.js";

export interface VisSceneBindings {
  help: HelpFactory;
  show: (scene: VisScene) => Promise<BounceResult>;
}

export interface VisStackBindings {
  help: HelpFactory;
  show: (stack: VisStack) => Promise<BounceResult>;
}

export interface VisSceneSummary {
  id: string;
  title: string;
  sampleHash: string;
  sampleLabel: string;
  overlayCount: number;
  panelCount: number;
}

export class VisScene extends HelpableResult {
  readonly overlays: Array<OnsetFeature | NmfFeature | NxFeature> = [];
  readonly panels: NmfFeature[] = [];
  private readonly pendingOps: Array<Promise<void>> = [];
  private shownSceneId: string | undefined;
  public titleText: string | undefined;

  constructor(
    public readonly sample: Sample,
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

  title(text: string): VisScene {
    this.titleText = text;
    return this;
  }

  overlay(feature: OnsetFeature | NmfFeature | NxFeature | PromiseLike<OnsetFeature | NmfFeature | NxFeature>): VisScene {
    if (isPromiseLike<OnsetFeature | NmfFeature | NxFeature>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { this.overlays.push(f); }));
    } else {
      this.overlays.push(feature);
    }
    return this;
  }

  panel(feature: NmfFeature | PromiseLike<NmfFeature>): VisScene {
    if (isPromiseLike<NmfFeature>(feature)) {
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

export class VisScenePromise implements PromiseLike<VisScene> {
  constructor(private readonly promise: Promise<VisScene>) {}

  then<TResult1 = VisScene, TResult2 = never>(
    onfulfilled?: ((value: VisScene) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<VisScene | TResult> {
    return this.promise.catch(onrejected);
  }

  title(text: string): VisScenePromise {
    return new VisScenePromise(this.promise.then((scene) => scene.title(text)));
  }

  overlay(feature: OnsetFeature | NmfFeature | NxFeature | PromiseLike<OnsetFeature | NmfFeature | NxFeature>): VisScenePromise {
    return new VisScenePromise(
      Promise.all([this.promise, Promise.resolve(feature)]).then(([scene, f]) => scene.overlay(f)),
    );
  }

  panel(feature: NmfFeature | PromiseLike<NmfFeature>): VisScenePromise {
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

export class VisStack extends HelpableResult {
  readonly scenes: VisScene[] = [];
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

  waveform(_sample: Sample): VisStack {
    throw new Error("Use vis.stack().waveform(sample) from the vis namespace.");
  }

  addScene(scene: VisScene): VisStack {
    this.scenes.push(scene);
    return this;
  }

  title(text: string): VisStack {
    this.requireLatestScene().title(text);
    return this;
  }

  overlay(feature: OnsetFeature | NmfFeature | NxFeature | PromiseLike<OnsetFeature | NmfFeature | NxFeature>): VisStack {
    const latest = this.requireLatestScene();
    if (isPromiseLike<OnsetFeature | NmfFeature | NxFeature>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { latest.overlay(f); }));
    } else {
      latest.overlay(feature);
    }
    return this;
  }

  panel(feature: NmfFeature | PromiseLike<NmfFeature>): VisStack {
    const latest = this.requireLatestScene();
    if (isPromiseLike<NmfFeature>(feature)) {
      this.pendingOps.push(Promise.resolve(feature).then((f) => { latest.panel(f); }));
    } else {
      latest.panel(feature);
    }
    return this;
  }

  show(): Promise<BounceResult> {
    return Promise.all(this.pendingOps).then(() => this.bindings.show(this));
  }

  private requireLatestScene(): VisScene {
    const latest = this.scenes[this.scenes.length - 1];
    if (!latest) {
      throw new Error("No scenes in stack. Call stack.waveform(sample) first.");
    }
    return latest;
  }
}
