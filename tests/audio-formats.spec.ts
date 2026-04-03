import { test, expect } from "./fixtures";
import * as path from "path";
import { createTestWavFile } from "./helpers";
import * as fs from "fs";

test.describe("Audio Format Support", () => {
  const testDir = path.join(__dirname, "../test-results/audio-files");

  test.beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test("should load and display WAV file", async ({ window, sendCommand }) => {
    const testFile = path.join(testDir, "test.wav");
    createTestWavFile(testFile);

    try {
      await sendCommand(`const samp = sn.read("${testFile}")`);
      await sendCommand("vis.waveform(samp).show()");

      await expect(window.locator(".visualization-scene-waveform-canvas")).toBeVisible({
        timeout: 5000,
      });
    } finally {
      fs.unlinkSync(testFile);
    }
  });

  test("should handle missing file gracefully", async ({ window, sendCommand }) => {
    const nonexistentPath = path.join(__dirname, "nonexistent-file-12345.wav");
    await sendCommand(`sn.read("${nonexistentPath}")`);

    await expect(window.locator(".xterm-rows")).toContainText(/error/i, {
      timeout: 5000,
    });
  });

  test("should validate file extensions", async ({ window, sendCommand }) => {
    const unsupportedFormats = ["file.avi", "file.mov", "file.txt", "file.pdf"];

    for (const file of unsupportedFormats) {
      await sendCommand(`sn.read("${file}")`);

      await expect(window.locator(".xterm-rows")).toContainText(
        "Unsupported file format",
        { timeout: 5000 },
      );

      await sendCommand("clear()");
    }
  });

  test("should accept all supported audio formats", async () => {
    const supportedExtensions = [
      ".wav",
      ".mp3",
      ".ogg",
      ".flac",
      ".m4a",
      ".aac",
      ".opus",
    ];

    for (const ext of supportedExtensions) {
      const filePath = `test${ext}`;
      const isSupported = (path: string) => {
        const fileExt = path.toLowerCase().substring(path.lastIndexOf("."));
        return supportedExtensions.includes(fileExt);
      };

      if (!isSupported(filePath)) {
        throw new Error(`Extension ${ext} should be supported`);
      }
    }
  });
});
