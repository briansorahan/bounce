/// <reference path="./types.d.ts" />
/// <reference path="./bounce-globals.d.ts" />
import { AudioManager } from "./audio-context.js";
import { BounceTerminal } from "./terminal.js";
import { VisualizationSceneManager } from "./visualization-scene-manager.js";
import {
  BounceResult,
  Sample,
  OnsetFeature,
  NmfFeature,
  NxFeature,
  MfccFeature,
  VisScene,
  VisScenePromise,
  VisStack,
  VisSceneListResult,
  SampleNamespace,
  SampleListResult,
  ProjectNamespace,
  ProjectResult,
  ProjectListResult,
  EnvScopeResult,
  EnvInspectionResult,
  EnvFunctionListResult,
  SamplePromise,
  CurrentSamplePromise,
  OnsetFeaturePromise,
  NmfFeaturePromise,
  NxFeaturePromise,
  MfccFeaturePromise,
  GrainCollectionPromise,
  LsResult,
  GlobResult,
  LsResultPromise,
  GlobResultPromise,
  InputsResult,
  AudioDevice,
  RecordingHandle,
} from "./bounce-result.js";
import { GrainCollection } from "./grain-collection.js";
import type { RuntimeScopeEntry } from "./runtime-introspection.js";
import type { NamespaceDeps, SharedState } from "./namespaces/types.js";
import { buildFsNamespace } from "./namespaces/fs-namespace.js";
import { buildCorpusNamespace } from "./namespaces/corpus-namespace.js";
import { buildEnvNamespace } from "./namespaces/env-namespace.js";
import { buildProjectNamespace } from "./namespaces/project-namespace.js";
import { buildGlobals } from "./namespaces/globals.js";
import { buildVisNamespace } from "./namespaces/vis-namespace.js";
import { buildSampleNamespace } from "./namespaces/sample-namespace.js";
import { buildInstNamespace } from "./namespaces/instrument-namespace.js";
import { buildMidiNamespace } from "./namespaces/midi-namespace.js";
import { buildMixerNamespace } from "./namespaces/mixer-namespace.js";
import { buildTransportNamespace } from "./namespaces/transport-namespace.js";
import { buildPatNamespace } from "./namespaces/pat-namespace.js";

export {
  BounceResult,
  Sample,
  OnsetFeature,
  NmfFeature,
  NxFeature,
  MfccFeature,
  VisScene,
  VisScenePromise,
  VisStack,
  VisSceneListResult,
  SampleNamespace,
  SampleListResult,
  ProjectNamespace,
  ProjectResult,
  ProjectListResult,
  EnvScopeResult,
  EnvInspectionResult,
  EnvFunctionListResult,
  SamplePromise,
  CurrentSamplePromise,
  OnsetFeaturePromise,
  NmfFeaturePromise,
  NxFeaturePromise,
  MfccFeaturePromise,
  GrainCollectionPromise,
  LsResult,
  GlobResult,
  LsResultPromise,
  GlobResultPromise,
  GrainCollection,
  InputsResult,
  AudioDevice,
  RecordingHandle,
};

export interface BounceApiDeps {
  terminal: BounceTerminal;
  audioManager: AudioManager;
  sceneManager?: VisualizationSceneManager;
  /** Called after a project switch so proj.load() can await the full refresh. */
  onProjectLoad?: () => Promise<void>;
  runtime?: {
    listScopeEntries(): RuntimeScopeEntry[];
    hasScopeValue(name: string): boolean;
    getScopeValue(name: string): unknown;
    serializeScope(): Array<{ name: string; kind: "json" | "function"; value: string }>;
  };
}

// Module-level BPM accessor so app.ts can read current BPM without coupling to the namespace.
let _getCurrentBpm: () => number = () => 120;
export function getBounceCurrentBpm(): number {
  return _getCurrentBpm();
}

export function buildBounceApi(deps: BounceApiDeps): Record<string, unknown> {
  const { terminal } = deps;

  const sharedState: SharedState = {
    api: null,
    visualizationScenes: deps.sceneManager ?? null,
  };

  function getSceneManager(): VisualizationSceneManager {
    if (!sharedState.visualizationScenes) {
      sharedState.visualizationScenes = new VisualizationSceneManager(() => {
        if ("fit" in terminal && typeof terminal.fit === "function") {
          terminal.fit();
        }
      });
    }
    return sharedState.visualizationScenes;
  }

  const namespaceDeps: NamespaceDeps = {
    terminal,
    audioManager: deps.audioManager,
    sharedState,
    onProjectLoad: deps.onProjectLoad,
    runtime: deps.runtime,
    getSceneManager,
  };

  const { sn, sampleBinder } = buildSampleNamespace(namespaceDeps);
  const env = buildEnvNamespace(namespaceDeps);
  const vis = buildVisNamespace(namespaceDeps);
  const proj = buildProjectNamespace(namespaceDeps);
  const corpus = buildCorpusNamespace(namespaceDeps, sampleBinder);
  const fs = buildFsNamespace(namespaceDeps);
  const inst = buildInstNamespace(namespaceDeps);
  const { mx } = buildMixerNamespace(namespaceDeps);
  const { midi } = buildMidiNamespace(namespaceDeps);
  const { transport, getCurrentBpm } = buildTransportNamespace(namespaceDeps);
  const { pat } = buildPatNamespace(namespaceDeps);
  const globals = buildGlobals(namespaceDeps);

  const api = {
    sn,
    env,
    vis,
    proj,
    corpus,
    fs,
    inst,
    mx,
    midi,
    transport,
    pat,
    ...globals,
  };

  sharedState.api = api;
  _getCurrentBpm = getCurrentBpm;
  return api;
}
