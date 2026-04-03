import { _electron as electron } from "@playwright/test";
import electronPath from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

/**
 * Standard Electron launch args for all Playwright tests.
 * --no-sandbox / --disable-setuid-sandbox: required when running as root in Docker.
 * --use-fake-device-for-media-stream: synthetic audio input for CI.
 * --disable-dev-shm-usage: prevents /dev/shm exhaustion when running many
 *   sequential Electron instances (Docker defaults to 64 MB for /dev/shm).
 * --disable-gpu: avoids GPU process crashes that accumulate across many
 *   Electron launches in Docker and eventually block new instances from starting.
 * --no-first-run / --disable-extensions: suppress one-time setup and background
 *   network activity that slow down or destabilize headless launches.
 */
export const ELECTRON_MAIN = path.join(__dirname, "../dist/electron/main.js");
export const ELECTRON_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--use-fake-device-for-media-stream",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--disable-extensions",
];

export async function launchApp(userDataDir?: string) {
  const ownsUserDataDir = !userDataDir;
  const effectiveUserDataDir =
    userDataDir ??
    fs.mkdtempSync(path.join(os.tmpdir(), "bounce-playwright-userdata-"));

  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [ELECTRON_MAIN, ...ELECTRON_ARGS],
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
  const timeout = process.env.CI ? 30000 : 10000;
  await window.waitForSelector(".xterm-screen", { timeout });
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
