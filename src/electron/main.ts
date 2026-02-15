import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { OnsetSlice } from '../index';
import decode from 'audio-decode';
import { DatabaseManager } from './database';

let dbManager: DatabaseManager | null = null;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Bounce',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

ipcMain.handle('read-audio-file', async (_event, filePath: string) => {
  try {
    let resolvedPath = filePath;

    if (!path.isAbsolute(filePath)) {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        throw new Error('File selection canceled');
      }

      resolvedPath = result.filePaths[0];
    }

    const fileBuffer = fs.readFileSync(resolvedPath);
    const audioBuffer = await decode(fileBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    return {
      channelData: Array.from(channelData),
      sampleRate,
      duration
    };
  } catch (error) {
    throw new Error(`Failed to read audio file: ${error instanceof Error ? error.message : String(error)}`);
  }
});

ipcMain.handle('analyze-onset-slice', async (_event, audioDataArray: number[], options?: any) => {
  try {
    const audioData = new Float32Array(audioDataArray);
    
    const slicer = new OnsetSlice(options || {});
    const slices = slicer.process(audioData);

    return Array.from(slices);
  } catch (error) {
    throw new Error(`Failed to analyze onset slices: ${error instanceof Error ? error.message : String(error)}`);
  }
});

ipcMain.handle('save-command', async (_event, command: string) => {
  try {
    if (dbManager) {
      dbManager.addCommand(command);
    }
  } catch (error) {
    console.error('Failed to save command to database:', error);
  }
});

ipcMain.handle('get-command-history', async () => {
  try {
    return dbManager ? dbManager.getCommandHistory(1000) : [];
  } catch (error) {
    console.error('Failed to load command history:', error);
    return [];
  }
});

ipcMain.handle('debug-log', async (_event, level: string, message: string, data?: any) => {
  try {
    if (dbManager) {
      dbManager.addDebugLog(level, message, data);
    }
  } catch (error) {
    console.error('Failed to save debug log:', error);
  }
});

ipcMain.handle('get-debug-logs', async (_event, limit?: number) => {
  try {
    return dbManager ? dbManager.getDebugLogs(limit || 100) : [];
  } catch (error) {
    console.error('Failed to get debug logs:', error);
    return [];
  }
});

ipcMain.handle('clear-debug-logs', async () => {
  try {
    if (dbManager) {
      dbManager.clearDebugLogs();
    }
  } catch (error) {
    console.error('Failed to clear debug logs:', error);
  }
});

app.whenReady().then(() => {
  dbManager = new DatabaseManager();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (dbManager) {
    dbManager.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
