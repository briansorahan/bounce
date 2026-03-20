import { NMFVisualizer } from "./nmf-visualizer.js";
import type { PlaybackCursorState } from "./audio-context.js";
import { type NMFOverlayData, WaveformVisualizer } from "./waveform-visualizer.js";
import type { NmfFeature, NxFeature, OnsetFeature, Sample } from "./bounce-result.js";

export interface RenderableVisScene {
  readonly sample: Sample;
  readonly overlays: readonly (OnsetFeature | NmfFeature | NxFeature)[];
  readonly panels: readonly NmfFeature[];
  readonly titleText?: string;
  markShown(id: string): void;
}

export interface VisualizationSceneSummary {
  id: string;
  title: string;
  sampleHash: string;
  sampleLabel: string;
  overlayCount: number;
  panelCount: number;
}

interface StoredVisualizationScene extends VisualizationSceneSummary {
  element: HTMLElement;
  waveformVisualizer: WaveformVisualizer;
  totalSamples: number;
}

export class VisualizationSceneManager {
  private scenes = new Map<string, StoredVisualizationScene>();
  private nextId = 1;

  constructor(private readonly fitTerminal?: () => void) {}

  async renderScene(scene: RenderableVisScene): Promise<VisualizationSceneSummary> {
    const stack = this.requireStack();
    this.setVisibility(true);
    this.fitTerminal?.();
    const sceneId = `scene-${this.nextId++}`;
    const title = scene.titleText ?? `Waveform: ${this.labelForSample(scene.sample)}`;
    const card = this.createSceneCard(sceneId, title);
    stack.appendChild(card);

    const waveformCanvas = card.querySelector("canvas");
    if (!(waveformCanvas instanceof HTMLCanvasElement)) {
      throw new Error("Scene waveform canvas not found");
    }

    const panelsContainer = card.querySelector(".visualization-scene-panels");
    if (!(panelsContainer instanceof HTMLElement)) {
      throw new Error("Scene panel container not found");
    }

    const audioFileData = await window.electron.readAudioFile(scene.sample.hash);
    const waveformVisualizer = new WaveformVisualizer(waveformCanvas);
    const onsetOverlay = scene.overlays.find(
      (feature): feature is OnsetFeature => feature.featureType === "onset-slice",
    );
    const nmfOverlay = scene.overlays.find(
      (feature): feature is NmfFeature => feature.featureType === "nmf",
    );
    const nxOverlay = scene.overlays.find(
      (feature): feature is NxFeature => feature.featureType === "nmf-cross",
    );

    waveformVisualizer.drawWaveform(
      audioFileData.channelData,
      audioFileData.sampleRate,
      onsetOverlay?.slices,
    );

    const activeOverlay = nmfOverlay ?? nxOverlay;
    if (activeOverlay?.activations) {
      const overlayData: NMFOverlayData = {
        components: activeOverlay.components ?? activeOverlay.activations.length,
        bases: activeOverlay.bases ?? [],
        activations: activeOverlay.activations,
      };
      waveformVisualizer.setNMFOverlay(overlayData);
    }

    for (const panelFeature of scene.panels) {
      this.appendNmfPanel(panelsContainer, panelFeature);
    }

    const summary: StoredVisualizationScene = {
      id: sceneId,
      title,
      sampleHash: scene.sample.hash,
      sampleLabel: this.labelForSample(scene.sample),
      overlayCount: scene.overlays.length,
      panelCount: scene.panels.length,
      element: card,
      waveformVisualizer,
      totalSamples: audioFileData.channelData.length,
    };

    this.scenes.set(sceneId, summary);
    scene.markShown(sceneId);
    return summary;
  }

  listScenes(): VisualizationSceneSummary[] {
    return Array.from(this.scenes.values()).map(({ element: _element, ...summary }) => summary);
  }

  removeScene(id: string): boolean {
    const scene = this.scenes.get(id);
    if (!scene) {
      return false;
    }

    scene.element.remove();
    this.scenes.delete(id);
    this.syncVisibility();
    return true;
  }

  clearScenes(): number {
    const count = this.scenes.size;
    for (const scene of this.scenes.values()) {
      scene.element.remove();
    }
    this.scenes.clear();
    this.syncVisibility();
    return count;
  }

  hasScenes(): boolean {
    return this.scenes.size > 0;
  }

  updatePlaybackCursors(playbacks: readonly PlaybackCursorState[]): void {
    for (const scene of this.scenes.values()) {
      const activePlayback = playbacks.find(
        (playback) => playback.hash === scene.sampleHash,
      );
      scene.waveformVisualizer.updatePlaybackCursor(
        activePlayback?.position ?? 0,
        activePlayback?.totalSamples ?? scene.totalSamples,
      );
    }
  }

  private createSceneCard(id: string, title: string): HTMLElement {
    const card = document.createElement("article");
    card.className = "visualization-scene";
    card.dataset.sceneId = id;

    const header = document.createElement("div");
    header.className = "visualization-scene-header";

    const titleEl = document.createElement("div");
    titleEl.className = "visualization-scene-title";
    titleEl.textContent = title;

    const closeButton = document.createElement("button");
    closeButton.className = "visualization-scene-close";
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => {
      this.removeScene(id);
    });

    header.appendChild(titleEl);
    header.appendChild(closeButton);
    card.appendChild(header);

    const waveformRegion = document.createElement("div");
    waveformRegion.className = "visualization-scene-waveform";
    const waveformCanvas = document.createElement("canvas");
    waveformCanvas.className = "visualization-scene-waveform-canvas";
    waveformRegion.appendChild(waveformCanvas);
    card.appendChild(waveformRegion);

    const panelsContainer = document.createElement("div");
    panelsContainer.className = "visualization-scene-panels";
    card.appendChild(panelsContainer);

    return card;
  }

  private appendNmfPanel(container: HTMLElement, feature: NmfFeature): void {
    const panel = document.createElement("section");
    panel.className = "visualization-scene-panel";

    const title = document.createElement("div");
    title.className = "visualization-scene-panel-title";
    title.textContent = `NMF Panel (${feature.featureHash.substring(0, 8)})`;
    panel.appendChild(title);

    const canvasContainer = document.createElement("div");
    canvasContainer.className = "visualization-scene-panel-canvas";
    const canvas = document.createElement("canvas");
    canvasContainer.appendChild(canvas);
    panel.appendChild(canvasContainer);
    container.appendChild(panel);

    const rect = canvasContainer.getBoundingClientRect();
    canvas.width = Math.max(400, Math.floor(rect.width || 900));
    canvas.height = Math.max(260, Math.floor(rect.height || 320));

    new NMFVisualizer(canvas, {
      bases: feature.bases ?? [],
      activations: feature.activations ?? [],
      sampleRate: feature.source?.sampleRate ?? 44100,
      components: feature.components ?? feature.activations?.length ?? 0,
    });
  }

  private requireStack(): HTMLElement {
    const stack = document.getElementById("visualization-stack");
    if (!stack) {
      throw new Error("Visualization stack not found in DOM");
    }
    return stack;
  }

  private setVisibility(visible: boolean): void {
    document.body.classList.toggle("visualization-visible", visible);
  }

  private syncVisibility(): void {
    this.setVisibility(this.hasScenes());
    this.fitTerminal?.();
  }

  private labelForSample(sample: Sample): string {
    return sample.filePath?.split(/[/\\]/).pop() ?? sample.hash.substring(0, 8);
  }
}
