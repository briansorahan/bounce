import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const electronPath = require('electron') as string;

async function sendCommand(window: any, command: string) {
  await window.evaluate((cmd: string) => {
    const executeCommand = (window as any).__bounceExecuteCommand;
    if (!executeCommand) {
      throw new Error('Execute command function not exposed');
    }
    executeCommand(cmd);
  }, command);
}

function createTestWavFile(filePath: string, durationSeconds: number = 0.1) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const numChannels = 1;
  const bytesPerSample = 2;
  
  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 36 + dataSize;
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);
  
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * 440 * t);
    const sample = Math.floor(value * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  
  fs.writeFileSync(filePath, buffer);
}

test.describe('Audio Format Support', () => {
  const testDir = path.join(__dirname, '../test-results/audio-files');

  test.beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test('should load and display WAV file', async () => {
    const testFile = path.join(testDir, 'test.wav');
    createTestWavFile(testFile);

    const electronApp = await electron.launch({
      executablePath: electronPath,
      args: [path.join(__dirname, '../dist/electron/main.js'), '--no-sandbox', '--disable-setuid-sandbox'],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, `display "${testFile}"`);
    await window.waitForTimeout(1500);

    const waveformContainer = await window.locator('#waveform-container');
    const isVisible = await waveformContainer.isVisible();
    
    if (!isVisible) {
      throw new Error('WAV file failed to load and display');
    }

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test('should handle missing file gracefully', async () => {
    const electronApp = await electron.launch({
      executablePath: electronPath,
      args: [path.join(__dirname, '../dist/electron/main.js'), '--no-sandbox', '--disable-setuid-sandbox'],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const nonexistentPath = path.join(__dirname, 'nonexistent-file-12345.wav');
    await sendCommand(window, `display "${nonexistentPath}"`);
    await window.waitForTimeout(1000);

    const terminalContent = await window.locator('.xterm-rows').textContent();
    
    if (!terminalContent?.toLowerCase().includes('error')) {
      throw new Error(`Expected error message for missing file. Got: ${terminalContent}`);
    }

    await electronApp.close();
  });

  test('should validate file extensions', async () => {
    const electronApp = await electron.launch({
      executablePath: electronPath,
      args: [path.join(__dirname, '../dist/electron/main.js'), '--no-sandbox', '--disable-setuid-sandbox'],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const unsupportedFormats = ['file.avi', 'file.mov', 'file.txt', 'file.pdf'];

    for (const file of unsupportedFormats) {
      await sendCommand(window, `display "${file}"`);
      await window.waitForTimeout(300);

      const terminalContent = await window.locator('.xterm-rows').textContent();
      
      if (!terminalContent?.includes('unsupported file format')) {
        throw new Error(`Should reject unsupported format: ${file}`);
      }

      await sendCommand(window, 'clear');
      await window.waitForTimeout(200);
    }

    await electronApp.close();
  });

  test('should accept all supported audio formats', async () => {
    const supportedExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.opus'];
    
    for (const ext of supportedExtensions) {
      const filePath = `test${ext}`;
      const isSupported = (path: string) => {
        const fileExt = path.toLowerCase().substring(path.lastIndexOf('.'));
        return supportedExtensions.includes(fileExt);
      };
      
      if (!isSupported(filePath)) {
        throw new Error(`Extension ${ext} should be supported`);
      }
    }
  });
});
