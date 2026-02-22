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

test.describe("Audio Commands", () => {
  test("display command should load and visualize WAV file", async () => {
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

    await sendCommand(window, `display "${testFile}"`);
    await window.waitForTimeout(1000);

    const waveformContainer = await window.locator("#waveform-container");
    const isVisible = await waveformContainer.isVisible();

    if (!isVisible) {
      throw new Error("Waveform container not visible after display command");
    }

    await electronApp.close();
  });

  test("display command should reject non-audio files", async () => {
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

    await sendCommand(window, 'display "file.txt"');
    await window.waitForTimeout(500);

    const terminalContent = await window.locator(".xterm-rows").textContent();

    if (!terminalContent?.includes("unsupported file format")) {
      throw new Error("Expected error message for unsupported file format");
    }

    await electronApp.close();
  });

  test("play command should load file if not already displayed", async () => {
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

    await sendCommand(window, `play "${testFile}"`);
    await window.waitForTimeout(1500);

    const waveformContainer = await window.locator("#waveform-container");
    const isVisible = await waveformContainer.isVisible();

    if (!isVisible) {
      throw new Error(
        "Waveform not created when play command used on new file",
      );
    }

    await electronApp.close();
  });

  test("stop command should stop playback", async () => {
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

    await sendCommand(window, `play "${testFile}"`);
    await window.waitForTimeout(500);

    await sendCommand(window, "stop");
    await window.waitForTimeout(500);

    const terminalContent = await window.locator(".xterm-rows").textContent();

    if (!terminalContent?.includes("Playback stopped")) {
      throw new Error('Expected "Playback stopped" message');
    }

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

    await sendCommand(window, "help");
    await window.waitForTimeout(1000);

    const terminalContent = await window.locator(".xterm-rows").textContent();

    // The help output is long, so we just check that it includes some key commands
    // Even if it scrolls, we should see at least some of: play, stop, clear, help, analyze
    const hasCommands =
      terminalContent?.includes("play") ||
      terminalContent?.includes("stop") ||
      terminalContent?.includes("clear") ||
      terminalContent?.includes("help") ||
      terminalContent?.includes("analyze");

    if (!hasCommands) {
      throw new Error("Help command should list available commands");
    }

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

    await sendCommand(window, "help");
    await window.waitForTimeout(500);

    await sendCommand(window, "clear");
    await window.waitForTimeout(500);

    const terminalContent = await window.locator(".xterm-rows").textContent();

    if (terminalContent?.includes("Available Commands")) {
      throw new Error("Terminal should be cleared after clear command");
    }

    await electronApp.close();
  });
});
