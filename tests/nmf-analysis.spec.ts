import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import path from "path";
import fs from "fs";

const electronPath = require("electron") as string;

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
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
});

test.describe("NMF Analysis", () => {
  test("should analyze sample with NMF and visualize results", async () => {
    const testFile = path.join(__dirname, "test-multi-viz.wav");
    expect(fs.existsSync(testFile)).toBe(true);

    // Play the audio file to load it into samples table
    await window.keyboard.type(`play "${testFile}"`);
    await window.keyboard.press("Enter");

    // Wait for file to load
    await window.waitForTimeout(1000);

    // Get the sample hash from terminal output
    const terminalContent = await window.locator(".xterm-screen").textContent();
    const hashMatch = terminalContent?.match(/Hash: ([a-f0-9]+)/);
    expect(hashMatch).toBeTruthy();
    const sampleHash = hashMatch![1].substring(0, 8);

    // Stop playback but keep audio data loaded
    await window.keyboard.type("stop");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    // Run NMF analysis
    await window.keyboard.type(`analyze-nmf ${sampleHash}`);
    await window.keyboard.press("Enter");

    // Wait for analysis to complete (NMF can take a few seconds)
    await window.waitForTimeout(5000);

    // Verify feature was stored
    await window.keyboard.type("list-features");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    const featuresOutput = await window.locator(".xterm-screen").textContent();
    expect(featuresOutput).toContain("nmf");

    // Play the sample again to show waveform
    await window.keyboard.type(`play ${sampleHash}`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(1000);

    // Verify waveform canvas exists
    const waveformCanvas = window.locator("#waveform-canvas");
    await expect(waveformCanvas).toBeVisible();

    // Stop playback
    await window.keyboard.type("stop");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    // Visualize NMF on the waveform
    await window.keyboard.type(`visualize-nmf ${sampleHash}`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(1000);

    // Verify the NMF visualization was applied
    const finalOutput = await window.locator(".xterm-screen").textContent();
    expect(finalOutput).toContain("NMF visualization overlaid");
  });

  test.skip("should handle visualize-nmf without loaded waveform", async () => {
    const testFile = path.join(__dirname, "test-multi-viz.wav");

    // Clear any existing visualizations
    await window.keyboard.type("clear");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    // Load sample
    await window.keyboard.type(`play "${testFile}"`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(2000);

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

    await window.keyboard.type("stop");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    // Ensure sample has NMF data (may already exist from previous test)
    await window.keyboard.type(`analyze-nmf ${sampleHash}`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(5000);

    // Clear the waveform
    await window.keyboard.type("clear");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);

    // Try to visualize NMF without waveform displayed
    await window.keyboard.type(`visualize-nmf ${sampleHash}`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(1500); // Give IPC time to complete

    const output = await window.locator(".xterm-screen").textContent();
    // Should indicate no waveform is displayed
    expect(output).toContain("No waveform currently displayed");
  });
});
