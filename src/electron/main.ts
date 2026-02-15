import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { OnsetSlice } from '../index';
import * as WavDecoder from 'wav-decoder';

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
          { name: 'Audio Files', extensions: ['wav'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        throw new Error('File selection canceled');
      }

      resolvedPath = result.filePaths[0];
    }

    const fileBuffer = fs.readFileSync(resolvedPath);
    const audioData = await WavDecoder.decode(fileBuffer);

    const channelData = audioData.channelData[0];
    const sampleRate = audioData.sampleRate;
    const duration = audioData.length / sampleRate;

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
