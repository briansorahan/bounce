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

test.describe("Audio Commands", () => {
  test("sn.read should load and visualize WAV file", async () => {
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

    const testFile = path.join(
      __dirname,
      "../flucoma-core/Resources/AudioFiles/Tremblay-SlideChoirAdd-M.wav",
    );

    if (!fs.existsSync(testFile)) {
      throw new Error(`Test file not found: ${testFile}`);
    }

    await sendCommand(window, `sn.read("${testFile}")`);

    await expect(window.locator("#waveform-container")).toBeVisible({
      timeout: 5000,
    });

    await electronApp.close();
  });

  test("sn.read should reject non-audio files", async () => {
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

    await sendCommand(window, 'sn.read("file.txt")');

    await expect(window.locator(".xterm-rows")).toContainText(
      "Unsupported file format",
      { timeout: 5000 },
    );

    await electronApp.close();
  });

  test("sample.play should load file if not already displayed", async () => {
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

    const testFile = path.join(
      __dirname,
      "../flucoma-core/Resources/AudioFiles/Tremblay-SlideChoirAdd-M.wav",
    );

    if (!fs.existsSync(testFile)) {
      throw new Error(`Test file not found: ${testFile}`);
    }

    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "samp.play()");

    await expect(window.locator("#waveform-container")).toBeVisible({
      timeout: 5000,
    });

    await electronApp.close();
  });

  test("sample.stop should stop playback", async () => {
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

    const testFile = path.join(
      __dirname,
      "../flucoma-core/Resources/AudioFiles/Tremblay-SlideChoirAdd-M.wav",
    );

    if (!fs.existsSync(testFile)) {
      throw new Error(`Test file not found: ${testFile}`);
    }

    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "samp.play()");
    await sendCommand(window, "samp.stop()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Playback stopped",
      { timeout: 5000 },
    );

    await electronApp.close();
  });

  test("help command should show available commands", async () => {
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

    await sendCommand(window, "help()");

    await expect(window.locator(".xterm-rows")).toContainText("sn", {
      timeout: 5000,
    });

    await electronApp.close();
  });

  test("clear command should clear terminal", async () => {
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
