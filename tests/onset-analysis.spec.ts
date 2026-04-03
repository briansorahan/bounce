import { test, expect } from "./fixtures";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

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
  test("should analyze onset slices and display only when explicitly shown", async ({ window, sendCommand }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-onset-"));
    const testFile = path.join(tmpDir, "test-onset-audio.wav");
    createTestWavFile(testFile, 0.5);

    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("samp.onsetSlice()");

    await expect(window.locator(".xterm-rows")).toContainText("Found", {
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("onset slices", {
      timeout: 5000,
    });

    await expect(window.locator(".visualization-scene-waveform-canvas")).toHaveCount(0);

    await sendCommand("const onsetScene = vis.waveform(samp).overlay(samp.onsetSlice())");
    await sendCommand("onsetScene.show()");

    await expect(window.locator(".visualization-scene-waveform-canvas")).toBeVisible({
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("Scene scene-", {
      timeout: 5000,
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("should append a new scene when shown again", async ({ window, sendCommand }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-onset-"));
    const testFile = path.join(tmpDir, "test-multi-analysis.wav");
    createTestWavFile(testFile, 0.3);

    // First analysis
    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("const onsetsA = samp.onsetSlice()");
    await sendCommand("vis.waveform(samp).overlay(onsetsA).show()");
    await expect(window.locator(".xterm-rows")).toContainText("Analyzing onset slices...", {
      timeout: 5000,
    });
    await expect(window.locator(".visualization-scene")).toHaveCount(1);

    // Second analysis with different threshold
    await sendCommand("const onsetsB = samp.onsetSlice({ threshold: 0.5 })");
    await sendCommand("vis.waveform(samp).overlay(onsetsB).show()");

    await expect(window.locator(".visualization-scene")).toHaveCount(2);

    const beforeResize = await window.evaluate(() => {
      const area = document.getElementById("visualization-area");
      if (!(area instanceof HTMLElement)) {
        throw new Error("visualization-area not found");
      }
      return {
        clientHeight: area.clientHeight,
        scrollHeight: area.scrollHeight,
      };
    });

    const divider = window.locator("#divider");
    const box = await divider.boundingBox();
    if (!box) {
      throw new Error("divider bounding box not found");
    }
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.mouse.down();
    await window.mouse.move(box.x + box.width / 2, 80);
    await window.mouse.up();

    const afterResize = await window.evaluate(() => {
      const area = document.getElementById("visualization-area");
      if (!(area instanceof HTMLElement)) {
        throw new Error("visualization-area not found");
      }
      return {
        clientHeight: area.clientHeight,
        scrollHeight: area.scrollHeight,
      };
    });

    expect(afterResize.clientHeight).toBeGreaterThan(beforeResize.clientHeight);
    expect(afterResize.scrollHeight).toBeLessThanOrEqual(afterResize.clientHeight + 2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("should show multiple waveform scenes from one vis.stack command", async ({ window, sendCommand }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-onset-"));
    const firstFile = path.join(tmpDir, "test-stack-a.wav");
    const secondFile = path.join(tmpDir, "test-stack-b.wav");
    createTestWavFile(firstFile, 0.25);
    createTestWavFile(secondFile, 0.35);

    await sendCommand(`const a = sn.read("${firstFile}")`);
    await sendCommand(`const b = sn.read("${secondFile}")`);
    await sendCommand("vis.stack().waveform(a).waveform(b).show()");

    await expect(window.locator(".visualization-scene")).toHaveCount(2);
    await expect(window.locator(".xterm-rows")).toContainText("Rendered 2 scenes", {
      timeout: 5000,
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
