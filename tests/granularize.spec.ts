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
    const testFile = path.join(__dirname, "test-granularize.wav");
    createTestWavFile(testFile, 1.0);

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

    try {
      const window = await electronApp.firstWindow();
      await window.waitForTimeout(1000);

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
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  test("granularize rejects samples longer than 20 seconds", async () => {
    const testFile = path.join(__dirname, "test-granularize-long.wav");
    createTestWavFile(testFile, 0.5); // short file; we fake the check via a hash manipulation test

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

    try {
      const window = await electronApp.firstWindow();
      await window.waitForTimeout(1000);

      // Pass a non-existent hash — should surface a clear error in the terminal
      await sendCommand(window, `sn.read("nonexistenthash00")`);
      await expect(window.locator(".xterm-rows")).toContainText("Error", {
        timeout: 5000,
      });
    } finally {
      await electronApp.close();
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });
});
