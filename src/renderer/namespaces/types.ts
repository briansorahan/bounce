/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import type { AudioManager } from "../audio-context.js";
import type { BounceTerminal } from "../terminal.js";
import type { VisualizationSceneManager } from "../visualization-scene-manager.js";
import type { RuntimeScopeEntry } from "../runtime-introspection.js";

export interface SharedState {
  api: Record<string, unknown> | null;
  visualizationScenes: VisualizationSceneManager | null;
}

export interface NamespaceDeps {
  terminal: BounceTerminal;
  audioManager: AudioManager;
  sharedState: SharedState;
  onProjectLoad?: () => Promise<void>;
  runtime?: {
    listScopeEntries(): RuntimeScopeEntry[];
    hasScopeValue(name: string): boolean;
    getScopeValue(name: string): unknown;
    serializeScope(): Array<{ name: string; kind: "json" | "function"; value: string }>;
  };
  /** Lazily initializes or returns the scene manager. */
  getSceneManager(): VisualizationSceneManager;
}
