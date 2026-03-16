import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";

const electronPath = require("electron") as string;

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

async function sendCommand(command: string) {
  await window.evaluate((cmd: string) => {
    const executeCommand = (window as unknown as { __bounceExecuteCommand?: (source: string) => Promise<void> }).__bounceExecuteCommand;
    if (!executeCommand) {
      throw new Error("Execute command function not exposed");
    }
    return executeCommand(cmd);
  }, command);
}

test.beforeAll(async () => {
  userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "bounce-nmf-analysis-"),
  );
  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [
      path.join(__dirname, "../dist/electron/main.js"),
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      BOUNCE_USER_DATA_PATH: userDataDir,
    },
  });
  window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.waitForSelector(".xterm-screen", { timeout: 10000 });
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test.describe("NMF Analysis", () => {
  test("should analyze sample with NMF and visualize results explicitly", async () => {
    const testFile = path.join(__dirname, "test-multi-viz.wav");
    expect(fs.existsSync(testFile)).toBe(true);

    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("const feature = samp.nmf()");
    await sendCommand("feature.featureType");
    await expect(window.locator(".xterm-rows")).toContainText("nmf", {
      timeout: 5000,
    });

    await expect(window.locator(".visualization-scene-waveform-canvas")).toHaveCount(0);

    await sendCommand("vis.waveform(samp).overlay(feature).panel(feature).show()");

    await expect(window.locator(".visualization-scene-waveform-canvas")).toBeVisible();
    await expect(window.locator(".visualization-scene-panel canvas")).toBeVisible();
    await expect(window.locator(".xterm-screen")).toContainText(
      "Scene scene-",
      { timeout: 5000 },
    );
  });

  test.skip("should handle visualize-nmf without loaded waveform", async () => {
    const testFile = path.join(__dirname, "test-multi-viz.wav");

    // Clear any existing visualizations
    await window.keyboard.type("clear()");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    // Load sample
    await window.keyboard.type(`const samp = sn.read("${testFile}")`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(1000);

    await window.keyboard.type("samp.play()");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(1000);

    // Wait for hash to appear in terminal
    await window.waitForFunction(
      () => {
        const content =
          document.querySelector(".xterm-screen")?.textContent || "";
        return content.includes("Hash:");
      },
      { timeout: 5000 },
    );

    const terminalContent = await window.locator(".xterm-screen").textContent();
    const hashMatch = terminalContent?.match(/Hash: ([a-f0-9]+)/);
    expect(hashMatch).toBeTruthy();
    const sampleHash = hashMatch![1].substring(0, 8);

    await window.keyboard.type("sn.stop()");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    // Ensure sample has NMF data (may already exist from previous test)
    await window.keyboard.type("await analyzeNmf()");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(5000);

    // Clear the waveform
    await window.keyboard.type("clear()");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    // Try to visualize NMF without waveform displayed
    await window.keyboard.type("await visualizeNmf()");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(1500); // Give IPC time to complete

    const output = await window.locator(".xterm-screen").textContent();
    // Should indicate no waveform is displayed
    expect(output).toContain("No waveform currently displayed");
  });
});
