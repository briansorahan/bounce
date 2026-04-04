/// <reference path="./types.d.ts" />
/// <reference path="./bounce-globals.d.ts" />
import { AudioManager } from "./audio-context.js";
import { BounceTerminal } from "./terminal.js";
import { VisualizationSceneManager } from "./visualization-scene-manager.js";
import {
  BounceResult,
  SampleResult,
  SliceFeatureResult,
  NmfFeatureResult,
  NxFeatureResult,
  MfccFeatureResult,
  VisSceneResult,
  VisScenePromise,
  VisStackResult,
  VisSceneListResult,
  SampleListResult,
  ProjectResult,
  ProjectListResult,
  EnvScopeResult,
  EnvInspectionResult,
  EnvFunctionListResult,
  SamplePromise,
  CurrentSamplePromise,
  SliceFeaturePromise,
  NmfFeaturePromise,
  NxFeaturePromise,
  MfccFeaturePromise,
  GrainCollectionPromise,
  LsResult,
  GlobResult,
  LsResultPromise,
  GlobResultPromise,
  InputsResult,
  AudioDeviceResult,
  RecordingHandleResult,
} from "./bounce-result.js";
import { GrainCollection } from "./grain-collection.js";
import type { RuntimeScopeEntry } from "./runtime-introspection.js";
import type { NamespaceDeps, SharedState } from "./namespaces/types.js";
import { FsNamespace } from "./namespaces/fs-namespace.js";
import { CorpusNamespace } from "./namespaces/corpus-namespace.js";
import { EnvNamespace } from "./namespaces/env-namespace.js";
import { ProjectNamespace } from "./namespaces/project-namespace.js";
import { buildGlobals } from "./namespaces/globals.js";
import { VisNamespace } from "./namespaces/vis-namespace.js";
import { SampleNamespace } from "./namespaces/sample-namespace.js";
import { InstNamespace } from "./namespaces/instrument-namespace.js";
import { MidiNamespace } from "./namespaces/midi-namespace.js";
import { MixerNamespace } from "./namespaces/mixer-namespace.js";
import { TransportNamespace } from "./namespaces/transport-namespace.js";
import { PatNamespace } from "./namespaces/pat-namespace.js";
import { porcelainTypeHelps } from "./results/porcelain-types.generated.js";
import { renderTypeHelp, renderMethodHelp } from "./help.js";

export {
  BounceResult,
  SampleResult,
  SliceFeatureResult,
  NmfFeatureResult,
  NxFeatureResult,
  MfccFeatureResult,
  VisSceneResult,
  VisScenePromise,
  VisStackResult,
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
  SliceFeaturePromise,
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
  AudioDeviceResult,
  RecordingHandleResult,
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

  const sn = new SampleNamespace(namespaceDeps);
  const sampleBinder = sn;
  const env = new EnvNamespace(namespaceDeps);
  const vis = new VisNamespace(namespaceDeps);
  const proj = new ProjectNamespace(namespaceDeps);
  const corpus = new CorpusNamespace(namespaceDeps, sampleBinder);
  const fs = new FsNamespace(namespaceDeps);
  const inst = new InstNamespace(namespaceDeps);
  const mx = new MixerNamespace(namespaceDeps);
  const midi = new MidiNamespace(namespaceDeps);
  const transport = new TransportNamespace(namespaceDeps);
  const getCurrentBpm = () => transport.getCurrentBpm();
  const pat = new PatNamespace(namespaceDeps);
  const globals = buildGlobals(namespaceDeps, { sn, env, vis, proj, corpus, fs, inst, mx, midi, transport, pat });

  const typeHelpObjects = Object.fromEntries(
    porcelainTypeHelps.map((th) => {
      const methodSubs = Object.fromEntries(
        (th.methods ?? []).map((m) => {
          const name = m.signature.split("(")[0];
          return [name, {
            help: () => renderMethodHelp(th.name, m),
            toString: () => renderMethodHelp(th.name, m).toString(),
          }];
        }),
      );
      return [
        th.name,
        {
          help: () => renderTypeHelp(th),
          toString: () => renderTypeHelp(th).toString(),
          ...methodSubs,
        },
      ];
    }),
  );

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
    ...typeHelpObjects,
  };

  sharedState.api = api;
  _getCurrentBpm = getCurrentBpm;
  return api;
}
