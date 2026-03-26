import { BrowserWindow, MessagePortMain } from "electron";
import { DatabaseManager } from "../database";
import { SettingsStore } from "../settings-store";
import { CorpusManager } from "../corpus-manager";

import { registerFilesystemHandlers } from "./filesystem-handlers";
import { registerProjectHandlers } from "./project-handlers";
import { registerHistoryHandlers } from "./history-handlers";
import { registerSampleHandlers } from "./sample-handlers";
import { registerFeatureHandlers } from "./feature-handlers";
import { registerAudioHandlers } from "./audio-handlers";
import { registerAnalysisHandlers } from "./analysis-handlers";
import { registerCorpusHandlers } from "./corpus-handlers";
import { registerNmfHandlers } from "./nmf-handlers";
import { registerReplHandlers } from "./repl-handlers";
import { registerErrorHandlers } from "./error-handlers";
import { registerMixerHandlers } from "./mixer-handlers";
import { registerMidiHandlers } from "./midi-handlers";
import { registerTransportHandlers } from "./transport-handlers";

export interface HandlerDeps {
  dbManager: DatabaseManager;
  settingsStore: SettingsStore;
  corpusManager: CorpusManager;
  getAudioEnginePort: () => MessagePortMain | null;
  getMainWindow: () => BrowserWindow | null;
}

export function registerAllHandlers(deps: HandlerDeps): void {
  registerFilesystemHandlers(deps);
  registerProjectHandlers(deps);
  registerHistoryHandlers(deps);
  registerSampleHandlers(deps);
  registerFeatureHandlers(deps);
  registerAudioHandlers(deps);
  registerAnalysisHandlers();
  registerCorpusHandlers(deps);
  registerNmfHandlers(deps);
  registerReplHandlers(deps);
  registerErrorHandlers(deps);
  registerMixerHandlers(deps);
  registerMidiHandlers(deps);
  registerTransportHandlers(deps);
}
