import { _electron as electron } from "@playwright/test";
import electronPath from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export async function launchApp(userDataDir?: string) {
  const ownsUserDataDir = !userDataDir;
  const effectiveUserDataDir =
    userDataDir ??
    fs.mkdtempSync(path.join(os.tmpdir(), "bounce-playwright-userdata-"));

  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [
      path.join(__dirname, "../dist/electron/main.js"),
      "--no-sandbox",
      "--disable-setuid-sandbox",
      // Provide a synthetic audio input so getUserMedia / MediaRecorder work in
      // headless CI environments that have no real audio hardware.
      "--use-fake-device-for-media-stream",
    ],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      BOUNCE_USER_DATA_PATH: effectiveUserDataDir,
    },
  });

  if (ownsUserDataDir) {
    const originalClose = electronApp.close.bind(electronApp);
    electronApp.close = async () => {
      try {
        await originalClose();
      } finally {
        fs.rmSync(effectiveUserDataDir, { recursive: true, force: true });
      }
    };
  }

  return electronApp;
}

export async function waitForReady(window: any) {
  await window.waitForLoadState("domcontentloaded");
  await window.waitForSelector(".xterm-screen", { timeout: 10000 });
}

export async function sendCommand(window: any, command: string): Promise<void> {
  await window.evaluate((cmd: string) => {
    const executeCommand = (window as any).__bounceExecuteCommand;
    if (!executeCommand) {
      throw new Error("Execute command function not exposed");
    }
    return executeCommand(cmd);
  }, command);
}

export function createTestWavFile(filePath: string, durationSeconds = 0.2) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const numChannels = 1;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 36 + dataSize;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * 440 * t);
    const sample = Math.floor(value * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}
