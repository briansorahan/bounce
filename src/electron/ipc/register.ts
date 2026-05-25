import { BrowserWindow, MessagePortMain } from "electron";
import { DatabaseManager } from "../database.js";
import { SettingsStore } from "../settings-store.js";
import { CorpusManager } from "../corpus-manager.js";
import { LanguageServiceManager } from "../language-service-manager.js";

import { registerFilesystemHandlers } from "./filesystem-handlers.js";
import { registerProjectHandlers } from "./project-handlers.js";
import { registerHistoryHandlers } from "./history-handlers.js";
import { registerSampleHandlers } from "./sample-handlers.js";
import { registerFeatureHandlers } from "./feature-handlers.js";
import { registerAudioHandlers } from "./audio-handlers.js";
import { registerAnalysisHandlers } from "./analysis-handlers.js";
import { registerCorpusHandlers } from "./corpus-handlers.js";
import { registerNmfHandlers } from "./nmf-handlers.js";
import { registerReplHandlers } from "./repl-handlers.js";
import { registerErrorHandlers } from "./error-handlers.js";
import { registerMixerHandlers } from "./mixer-handlers.js";
import { registerMidiHandlers } from "./midi-handlers.js";
import { registerTransportHandlers } from "./transport-handlers.js";
import { registerCompletionHandlers } from "./completion-handlers.js";

export interface HandlerDeps {
  dbManager: DatabaseManager;
  settingsStore: SettingsStore;
  corpusManager: CorpusManager;
  getAudioEnginePort: () => MessagePortMain | null;
  getMainWindow: () => BrowserWindow | null;
  languageServiceManager: LanguageServiceManager;
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
  registerCompletionHandlers(deps);
}
