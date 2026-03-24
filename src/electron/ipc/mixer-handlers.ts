import { ipcMain } from "electron";
import type { HandlerDeps } from "./register";

export function registerMixerHandlers(deps: HandlerDeps): void {
  const { getAudioEnginePort } = deps;

  // Helper to safely get current project id (returns null if no project loaded yet)
  function currentProjectId(): number | null {
    try {
      return deps.dbManager?.getCurrentProject().id ?? null;
    } catch {
      return null;
    }
  }

  ipcMain.on("mixer-set-channel-gain", (_event, payload: { channelIndex: number; gainDb: number }) => {
    getAudioEnginePort()?.postMessage({ type: "mixer-set-channel-gain", ...payload });
    const projectId = currentProjectId();
    if (projectId !== null) {
      const state = deps.dbManager!.getMixerState(projectId);
      const existing = state.channels.find(c => c.channel_idx === payload.channelIndex);
      deps.dbManager!.saveMixerChannel(projectId, payload.channelIndex, {
        gainDb: payload.gainDb,
        pan: existing?.pan ?? 0.0,
        mute: (existing?.mute ?? 0) !== 0,
        solo: (existing?.solo ?? 0) !== 0,
        instrumentName: existing?.instrument_name ?? null,
      });
    }
  });

  ipcMain.on("mixer-set-channel-pan", (_event, payload: { channelIndex: number; pan: number }) => {
    getAudioEnginePort()?.postMessage({ type: "mixer-set-channel-pan", ...payload });
    const projectId = currentProjectId();
    if (projectId !== null) {
      const state = deps.dbManager!.getMixerState(projectId);
      const existing = state.channels.find(c => c.channel_idx === payload.channelIndex);
      deps.dbManager!.saveMixerChannel(projectId, payload.channelIndex, {
        gainDb: existing?.gain_db ?? -6.0,
        pan: payload.pan,
        mute: (existing?.mute ?? 0) !== 0,
        solo: (existing?.solo ?? 0) !== 0,
        instrumentName: existing?.instrument_name ?? null,
      });
    }
  });

  ipcMain.on("mixer-set-channel-mute", (_event, payload: { channelIndex: number; mute: boolean }) => {
    getAudioEnginePort()?.postMessage({ type: "mixer-set-channel-mute", ...payload });
    const projectId = currentProjectId();
    if (projectId !== null) {
      const state = deps.dbManager!.getMixerState(projectId);
      const existing = state.channels.find(c => c.channel_idx === payload.channelIndex);
      deps.dbManager!.saveMixerChannel(projectId, payload.channelIndex, {
        gainDb: existing?.gain_db ?? -6.0,
        pan: existing?.pan ?? 0.0,
        mute: payload.mute,
        solo: (existing?.solo ?? 0) !== 0,
        instrumentName: existing?.instrument_name ?? null,
      });
    }
  });

  ipcMain.on("mixer-set-channel-solo", (_event, payload: { channelIndex: number; solo: boolean }) => {
    getAudioEnginePort()?.postMessage({ type: "mixer-set-channel-solo", ...payload });
    const projectId = currentProjectId();
    if (projectId !== null) {
      const state = deps.dbManager!.getMixerState(projectId);
      const existing = state.channels.find(c => c.channel_idx === payload.channelIndex);
      deps.dbManager!.saveMixerChannel(projectId, payload.channelIndex, {
        gainDb: existing?.gain_db ?? -6.0,
        pan: existing?.pan ?? 0.0,
        mute: (existing?.mute ?? 0) !== 0,
        solo: payload.solo,
        instrumentName: existing?.instrument_name ?? null,
      });
    }
  });

  ipcMain.on("mixer-attach-instrument", (_event, payload: { channelIndex: number; instrumentId: string }) => {
    getAudioEnginePort()?.postMessage({ type: "mixer-attach-instrument", ...payload });
    const projectId = currentProjectId();
    if (projectId !== null) {
      const state = deps.dbManager!.getMixerState(projectId);
      const existing = state.channels.find(c => c.channel_idx === payload.channelIndex);
      deps.dbManager!.saveMixerChannel(projectId, payload.channelIndex, {
        gainDb: existing?.gain_db ?? -6.0,
        pan: existing?.pan ?? 0.0,
        mute: (existing?.mute ?? 0) !== 0,
        solo: (existing?.solo ?? 0) !== 0,
        instrumentName: payload.instrumentId,
      });
    }
  });

  ipcMain.on("mixer-detach-channel", (_event, payload: { channelIndex: number }) => {
    getAudioEnginePort()?.postMessage({ type: "mixer-detach-channel", ...payload });
    const projectId = currentProjectId();
    if (projectId !== null) {
      const state = deps.dbManager!.getMixerState(projectId);
      const existing = state.channels.find(c => c.channel_idx === payload.channelIndex);
      deps.dbManager!.saveMixerChannel(projectId, payload.channelIndex, {
        gainDb: existing?.gain_db ?? -6.0,
        pan: existing?.pan ?? 0.0,
        mute: (existing?.mute ?? 0) !== 0,
        solo: (existing?.solo ?? 0) !== 0,
        instrumentName: null,
      });
    }
  });

  ipcMain.on("mixer-set-master-gain", (_event, payload: { gainDb: number }) => {
    getAudioEnginePort()?.postMessage({ type: "mixer-set-master-gain", ...payload });
    const projectId = currentProjectId();
    if (projectId !== null) {
      const state = deps.dbManager!.getMixerState(projectId);
      deps.dbManager!.saveMixerMaster(projectId, {
        gainDb: payload.gainDb,
        mute: (state.master?.mute ?? 0) !== 0,
      });
    }
  });

  ipcMain.on("mixer-set-master-mute", (_event, payload: { mute: boolean }) => {
    getAudioEnginePort()?.postMessage({ type: "mixer-set-master-mute", ...payload });
    const projectId = currentProjectId();
    if (projectId !== null) {
      const state = deps.dbManager!.getMixerState(projectId);
      deps.dbManager!.saveMixerMaster(projectId, {
        gainDb: state.master?.gain_db ?? 0.0,
        mute: payload.mute,
      });
    }
  });

  // Returns saved mixer state for the current project so the renderer can restore it.
  ipcMain.handle("mixer-get-state", async () => {
    const projectId = currentProjectId();
    if (projectId === null || !deps.dbManager) return null;
    return deps.dbManager.getMixerState(projectId);
  });
}
