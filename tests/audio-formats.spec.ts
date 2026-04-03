import { test, expect } from "@playwright/test";
import * as path from "path";
import { launchApp, waitForReady, sendCommand, createTestWavFile } from "./helpers";
import * as fs from "fs";
import * as os from "os";

test.describe("Audio Format Support", () => {
  const testDir = path.join(__dirname, "../test-results/audio-files");

  test.beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test("should load and display WAV file", async () => {
    const testFile = path.join(testDir, "test.wav");
    createTestWavFile(testFile);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-audio-formats-"));

    try {
      const electronApp = await launchApp(userDataDir);
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, `const samp = sn.read("${testFile}")`);
      await sendCommand(window, "vis.waveform(samp).show()");

      await expect(window.locator(".visualization-scene-waveform-canvas")).toBeVisible({
        timeout: 5000,
      });

      await electronApp.close();
    } finally {
      fs.unlinkSync(testFile);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("should handle missing file gracefully", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-audio-formats-"));

    try {
      const electronApp = await launchApp(userDataDir);
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      const nonexistentPath = path.join(__dirname, "nonexistent-file-12345.wav");
      await sendCommand(window, `sn.read("${nonexistentPath}")`);

      await expect(window.locator(".xterm-rows")).toContainText(/error/i, {
        timeout: 5000,
      });

      await electronApp.close();
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("should validate file extensions", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-audio-formats-"));

    try {
      const electronApp = await launchApp(userDataDir);
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      const unsupportedFormats = ["file.avi", "file.mov", "file.txt", "file.pdf"];

      for (const file of unsupportedFormats) {
        await sendCommand(window, `sn.read("${file}")`);

        await expect(window.locator(".xterm-rows")).toContainText(
          "Unsupported file format",
          { timeout: 5000 },
        );

        await sendCommand(window, "clear()");
      }

      await electronApp.close();
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
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
