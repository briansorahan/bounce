import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  version: process.versions.electron,
  readAudioFile: (path: string) => ipcRenderer.invoke('read-audio-file', path),
  analyzeOnsetSlice: (audioData: Float32Array, options?: any) => 
    ipcRenderer.invoke('analyze-onset-slice', audioData, options),
  saveCommand: (command: string) => ipcRenderer.invoke('save-command', command),
  getCommandHistory: () => ipcRenderer.invoke('get-command-history'),
  debugLog: (level: string, message: string, data?: any) => ipcRenderer.invoke('debug-log', level, message, data),
  getDebugLogs: (limit?: number) => ipcRenderer.invoke('get-debug-logs', limit),
  clearDebugLogs: () => ipcRenderer.invoke('clear-debug-logs')
});
