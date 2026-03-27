import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
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

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = 0.5 * Math.sin(2 * Math.PI * 440 * t);
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

test.describe("GranularInstrument", () => {
  test("inst.granular() creates instrument and terminal shows Granular", async () => {
    test.setTimeout(60000);
    const electronApp = await launchApp();
    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `inst.granular({ name: 'clouds' })`);
      await expect(window.locator(".xterm-rows")).toContainText("Granular 'clouds'", { timeout: 10000 });
    } finally {
      await electronApp.close();
    }
  });

  test("g.load(sn.read(...)) shows Loaded source sample", async () => {
    test.setTimeout(60000);
    const testFile = path.join(__dirname, "test-granular-inst.wav");
    createTestWavFile(testFile, 1.0);
    const electronApp = await launchApp();
    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `const g = inst.granular({ name: 'clouds2' })`);
      await sendCommand(window, `const s = sn.read("${testFile}")`);
      await sendCommand(window, `g.load(s)`);
      await expect(window.locator(".xterm-rows")).toContainText("Loaded source sample", { timeout: 10000 });
    } finally {
      await electronApp.close();
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  test("g.set() shows Updated message", async () => {
    test.setTimeout(60000);
    const electronApp = await launchApp();
    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `const g = inst.granular({ name: 'clouds3' })`);
      await sendCommand(window, `g.set({ position: 0.3, grainSize: 120 })`);
      await expect(window.locator(".xterm-rows")).toContainText("Updated position, grainSize", { timeout: 10000 });
    } finally {
      await electronApp.close();
    }
  });

  test("g.noteOn() shows Note on message", async () => {
    test.setTimeout(60000);
    const electronApp = await launchApp();
    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `const g = inst.granular({ name: 'clouds4' })`);
      await sendCommand(window, `g.noteOn(60)`);
      await expect(window.locator(".xterm-rows")).toContainText("Note on: 60", { timeout: 10000 });
    } finally {
      await electronApp.close();
    }
  });

  test("g.noteOff() shows Note off message", async () => {
    test.setTimeout(60000);
    const electronApp = await launchApp();
    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `const g = inst.granular({ name: 'clouds5' })`);
      await sendCommand(window, `g.noteOff(60)`);
      await expect(window.locator(".xterm-rows")).toContainText("Note off: 60", { timeout: 10000 });
    } finally {
      await electronApp.close();
    }
  });

  test("inst.granular.help() shows Create a new granular synthesis instrument", async () => {
    test.setTimeout(60000);
    const electronApp = await launchApp();
    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `inst.granular.help()`);
      await expect(window.locator(".xterm-rows")).toContainText("Create a new granular synthesis instrument", { timeout: 10000 });
    } finally {
      await electronApp.close();
    }
  });

  test("g.help() shows Load the source sample", async () => {
    test.setTimeout(60000);
    const electronApp = await launchApp();
    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `const g = inst.granular({ name: 'clouds6' })`);
      await sendCommand(window, `g.help()`);
      await expect(window.locator(".xterm-rows")).toContainText("Load the source sample", { timeout: 10000 });
    } finally {
      await electronApp.close();
    }
  });
});
