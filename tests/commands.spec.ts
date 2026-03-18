import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { launchApp, waitForReady, sendCommand } from "./helpers";

function createTestWavFile(filePath: string, durationSeconds: number = 0.2) {
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

test.describe("Audio Commands", () => {
  const testDir = path.join(__dirname, "../test-results/commands-test");

  test.beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test("sn.read should load a WAV file without auto-visualizing it", async () => {
    const testFile = path.join(testDir, "read-no-viz.wav");
    createTestWavFile(testFile);

    const electronApp = await launchApp();

    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, `sn.read("${testFile}")`);

    await expect(window.locator(".xterm-rows")).toContainText("Loaded:", {
      timeout: 5000,
    });
    await expect(window.locator("#waveform-container")).toBeHidden();

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("sn.read should reject non-audio files", async () => {
    const electronApp = await launchApp();

    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, 'sn.read("file.txt")');

    await expect(window.locator(".xterm-rows")).toContainText(
      "Unsupported file format",
      { timeout: 5000 },
    );

    await electronApp.close();
  });

  test("sample.play should play without auto-showing the waveform panel", async () => {
    const testFile = path.join(testDir, "play-no-viz.wav");
    createTestWavFile(testFile, 0.3);

    const electronApp = await launchApp();

    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "samp.play()");

    await expect(window.locator(".xterm-rows")).toContainText("Playing:", {
      timeout: 5000,
    });
    await expect(window.locator("#waveform-container")).toBeHidden();

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("sample.stop should stop playback", async () => {
    const testFile = path.join(testDir, "stop.wav");
    createTestWavFile(testFile, 0.3);

    const electronApp = await launchApp();

    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "samp.play()");
    await sendCommand(window, "samp.stop()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Playback stopped",
      { timeout: 5000 },
    );

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("help command should show available commands", async () => {
    const electronApp = await launchApp();

    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "help()");

    await expect(window.locator(".xterm-rows")).toContainText("sn", {
      timeout: 5000,
    });

    await electronApp.close();
  });

  test("clear command should clear terminal", async () => {
    const electronApp = await launchApp();

    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "help()");
    await expect(window.locator(".xterm-rows")).toContainText(
      "Show this help message",
      { timeout: 5000 },
    );

    await sendCommand(window, "clear()");

    await expect(window.locator(".xterm-rows")).not.toContainText(
      "Show this help message",
      { timeout: 5000 },
    );

    await electronApp.close();
  });
});
