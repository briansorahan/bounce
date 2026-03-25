import { ipcMain } from "electron";
import type { HandlerDeps } from "./register";

export function registerTransportHandlers(deps: HandlerDeps): void {
  const { getAudioEnginePort } = deps;

  ipcMain.on("transport-start", () => {
    getAudioEnginePort()?.postMessage({ type: "transport-start" });
  });

  ipcMain.on("transport-stop", () => {
    getAudioEnginePort()?.postMessage({ type: "transport-stop" });
  });

  ipcMain.on("transport-set-bpm", (_event, { bpm }: { bpm: number }) => {
    getAudioEnginePort()?.postMessage({ type: "transport-set-bpm", bpm });
  });

  ipcMain.on("transport-set-pattern", (_event, { channelIndex, stepsJson }: { channelIndex: number; stepsJson: string }) => {
    getAudioEnginePort()?.postMessage({ type: "transport-set-pattern", channelIndex, stepsJson });
  });

  ipcMain.on("transport-clear-pattern", (_event, { channelIndex }: { channelIndex: number }) => {
    getAudioEnginePort()?.postMessage({ type: "transport-clear-pattern", channelIndex });
  });
}
