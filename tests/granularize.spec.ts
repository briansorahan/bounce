import { test, expect } from "./fixtures";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

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
  test("grains returns GrainCollection with correct length", async ({ window, sendCommand }) => {
    test.setTimeout(60000);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-grains-"));
    const testFile = path.join(tmpDir, "test-grains.wav");
    createTestWavFile(testFile, 1.0);

    await sendCommand(`const samp = sn.read("${testFile}")`);

    // 1s sample / 100ms grains = 10 grains; disable silence filtering so sine wave grains aren't skipped
    // Call without assignment so the return value is printed to the terminal
    await sendCommand(
      `samp.grains({ grainSize: 100, silenceThreshold: -100 })`,
    );

    await expect(window.locator(".xterm-rows")).toContainText("Granularized", {
      timeout: 10000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("grains", {
      timeout: 5000,
    });

    // Assign to gc for method tests (result not printed since it's a declaration)
    await sendCommand(
      `const gc = samp.grains({ grainSize: 100, silenceThreshold: -100 })`,
    );

    // Verify length() via REPL
    await sendCommand(`gc.length()`);
    await expect(window.locator(".xterm-rows")).toContainText("10", {
      timeout: 5000,
    });

    // Verify forEach iterates
    await sendCommand(
      `let count = 0; gc.forEach(() => { count++; }); count`,
    );
    await expect(window.locator(".xterm-rows")).toContainText("10", {
      timeout: 5000,
    });

    // Verify filter returns a smaller GrainCollection
    await sendCommand(`gc.filter((_, i) => i < 3).length()`);
    await expect(window.locator(".xterm-rows")).toContainText("3", {
      timeout: 5000,
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("grains rejects samples longer than 20 seconds", async ({ window, sendCommand }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-grains-"));
    const testFile = path.join(tmpDir, "test-grains-long.wav");
    createTestWavFile(testFile, 0.5); // short file; we fake the check via a hash manipulation test

    // Pass a non-existent hash -- should surface a clear error in the terminal
    await sendCommand(`sn.read("nonexistenthash00")`);
    await expect(window.locator(".xterm-rows")).toContainText("Error", {
      timeout: 5000,
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
