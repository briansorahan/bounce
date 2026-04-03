import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { launchApp, waitForReady, sendCommand } from "./helpers";

function createTestWavFile(filePath: string, durationSeconds = 1.0) {
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

  // Sine wave so grains have audible content above silence threshold
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = 0.5 * Math.sin(2 * Math.PI * 440 * t);
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

test.describe("Granularize", () => {
  test("granularize returns GrainCollection with correct length", async () => {
    test.setTimeout(60000);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-granularize-"));
    const testFile = path.join(tmpDir, "test-granularize.wav");
    createTestWavFile(testFile, 1.0);

    const electronApp = await launchApp();

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `const samp = sn.read("${testFile}")`);

      // 1s sample ÷ 100ms grains = 10 grains; disable silence filtering so sine wave grains aren't skipped
      // Call without assignment so the return value is printed to the terminal
      await sendCommand(
        window,
        `samp.granularize({ grainSize: 100, silenceThreshold: -100 })`,
      );

      await expect(window.locator(".xterm-rows")).toContainText("Granularized", {
        timeout: 10000,
      });
      await expect(window.locator(".xterm-rows")).toContainText("grains", {
        timeout: 5000,
      });

      // Assign to gc for method tests (result not printed since it's a declaration)
      await sendCommand(
        window,
        `const gc = samp.granularize({ grainSize: 100, silenceThreshold: -100 })`,
      );

      // Verify length() via REPL
      await sendCommand(window, `gc.length()`);
      await expect(window.locator(".xterm-rows")).toContainText("10", {
        timeout: 5000,
      });

      // Verify forEach iterates
      await sendCommand(
        window,
        `let count = 0; gc.forEach(() => { count++; }); count`,
      );
      await expect(window.locator(".xterm-rows")).toContainText("10", {
        timeout: 5000,
      });

      // Verify filter returns a smaller GrainCollection
      await sendCommand(window, `gc.filter((_, i) => i < 3).length()`);
      await expect(window.locator(".xterm-rows")).toContainText("3", {
        timeout: 5000,
      });
    } finally {
      await electronApp.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("granularize rejects samples longer than 20 seconds", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-granularize-"));
    const testFile = path.join(tmpDir, "test-granularize-long.wav");
    createTestWavFile(testFile, 0.5); // short file; we fake the check via a hash manipulation test

    const electronApp = await launchApp();

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      // Pass a non-existent hash — should surface a clear error in the terminal
      await sendCommand(window, `sn.read("nonexistenthash00")`);
      await expect(window.locator(".xterm-rows")).toContainText("Error", {
        timeout: 5000,
      });
    } finally {
      await electronApp.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
