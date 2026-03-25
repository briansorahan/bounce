import { ipcMain } from "electron";
import { IpcChannel } from "../../shared/ipc-contract";
import type { HandlerDeps } from "./register";

export function registerTransportHandlers(deps: HandlerDeps): void {
  const { getAudioEnginePort } = deps;

  ipcMain.on(IpcChannel.TransportStart, () => {
    getAudioEnginePort()?.postMessage({ type: "transport-start" });
  });

  ipcMain.on(IpcChannel.TransportStop, () => {
    getAudioEnginePort()?.postMessage({ type: "transport-stop" });
  });

  ipcMain.on(IpcChannel.TransportSetBpm, (_event, { bpm }: { bpm: number }) => {
    getAudioEnginePort()?.postMessage({ type: "transport-set-bpm", bpm });
  });

  ipcMain.on(IpcChannel.TransportSetPattern, (_event, { channelIndex, stepsJson }: { channelIndex: number; stepsJson: string }) => {
    getAudioEnginePort()?.postMessage({ type: "transport-set-pattern", channelIndex, stepsJson });
  });

  ipcMain.on(IpcChannel.TransportClearPattern, (_event, { channelIndex }: { channelIndex: number }) => {
    getAudioEnginePort()?.postMessage({ type: "transport-clear-pattern", channelIndex });
  });
}
