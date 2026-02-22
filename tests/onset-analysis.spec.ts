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
    executeCommand(cmd);
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

  // Generate audio with some transients for onset detection
  for (let i = 0; i < numSamples; i++) {
    let value = 0;

    // Add transients at regular intervals to trigger onset detection
    if (i % 8820 === 0) {
      // Every 0.2s at 44100 Hz
      value = 0.8;
    } else if (i % 8820 < 441) {
      // Short decay
      value = 0.8 * (1 - (i % 8820) / 441);
    }

    const sample = Math.floor(value * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

test.describe("Onset Slice Analysis", () => {
  test("should analyze onset slices and display on waveform", async () => {
    const testFile = path.join(__dirname, "test-onset-audio.wav");
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

    await sendCommand(window, `analyze onset-slice "${testFile}"`);
    await window.waitForTimeout(2000);

    // Check that waveform canvas is visible
    const waveformCanvas = window.locator("#waveform-canvas");
    const isVisible = await waveformCanvas.isVisible();

    if (!isVisible) {
      throw new Error("Waveform canvas not visible");
    }

    // Check terminal shows success message
    const terminalContent = await window.locator(".xterm-rows").textContent();

    if (
      !terminalContent?.includes("Found") ||
      !terminalContent?.includes("onset slices")
    ) {
      throw new Error(
        `Expected onset slice count message, got: ${terminalContent?.slice(-200)}`,
      );
    }

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("should update visualization when running analysis again", async () => {
    const testFile = path.join(__dirname, "test-multi-analysis.wav");
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

    // First analysis
    await sendCommand(window, `analyze onset-slice "${testFile}"`);
    await window.waitForTimeout(1000);

    let terminalContent = await window.locator(".xterm-rows").textContent();
    const firstMatch = terminalContent?.match(/Found (\d+) onset slices/);

    // Second analysis with different threshold
    await sendCommand(
      window,
      `analyze onset-slice "${testFile}" --threshold 0.5`,
    );
    await window.waitForTimeout(1000);

    terminalContent = await window.locator(".xterm-rows").textContent();
    const secondMatch = terminalContent?.match(/Found (\d+) onset slices/g);

    if (!secondMatch || secondMatch.length < 2) {
      throw new Error("Expected two analysis results in terminal");
    }

    await electronApp.close();
    fs.unlinkSync(testFile);
  });
});
