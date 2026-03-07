import { test, expect, _electron as electron } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const electronPath = require("electron") as string;

async function sendCommand(window: any, command: string) {
  await window.evaluate((cmd: string) => {
    const executeCommand = (window as any).__bounceExecuteCommand;
    if (!executeCommand) {
      throw new Error("Execute command function not exposed");
    }
    return executeCommand(cmd);
  }, command);
}

function createTestWavFile(filePath: string, durationSeconds: number = 0.5) {
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

test.describe("Playback and Visualization", () => {
  const testDir = path.join(__dirname, "../test-results/playback-test");

  test.beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test("playback cursor should be visible during playback", async () => {
    const testFile = path.join(testDir, "cursor-test.wav");
    createTestWavFile(testFile, 0.5);

    const electronApp = await electron.launch({
      executablePath: electronPath,
      args: [
        path.join(__dirname, "../dist/electron/main.js"),
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, `await play("${testFile}")`);

    await expect(window.locator("#waveform-canvas")).toBeVisible({
      timeout: 5000,
    });

    await sendCommand(window, "stop()");

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("visualization should update on display command", async () => {
    const testFile = path.join(testDir, "viz-test.wav");
    createTestWavFile(testFile, 0.2);

    const electronApp = await electron.launch({
      executablePath: electronPath,
      args: [
        path.join(__dirname, "../dist/electron/main.js"),
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const waveformContainerBefore = await window.locator("#waveform-container");
    const isVisibleBefore = await waveformContainerBefore.isVisible();

    if (isVisibleBefore) {
      throw new Error("Waveform should not be visible before display command");
    }

    await sendCommand(window, `await display("${testFile}")`);

    await expect(window.locator("#waveform-container")).toBeVisible({
      timeout: 5000,
    });

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("play command should create visualization if not exists", async () => {
    const testFile = path.join(testDir, "play-viz-test.wav");
    createTestWavFile(testFile, 0.3);

    const electronApp = await electron.launch({
      executablePath: electronPath,
      args: [
        path.join(__dirname, "../dist/electron/main.js"),
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, `await play("${testFile}")`);

    await expect(window.locator("#waveform-container")).toBeVisible({
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("Loaded:", {
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("Playing:", {
      timeout: 5000,
    });

    await sendCommand(window, "stop()");

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("stop command should work without errors", async () => {
    const electronApp = await electron.launch({
      executablePath: electronPath,
      args: [
        path.join(__dirname, "../dist/electron/main.js"),
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "stop()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Playback stopped",
      { timeout: 5000 },
    );

    await electronApp.close();
  });
});
