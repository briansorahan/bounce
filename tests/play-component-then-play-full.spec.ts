import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import path from "path";

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

test.describe("Play Component Then Play Full", () => {
  test("should reload full audio after playing component", async () => {
    const testAudioPath = path.join(__dirname, "test-multi-viz.wav");

    // Type commands directly in terminal (more realistic test)
    const terminal = await window.locator(".xterm-screen");
    
    // Load audio
    await window.keyboard.type(`play "${testAudioPath}"`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(2000);

    // Get the hash from output
    const terminalText = await terminal.textContent();
    const hashMatch = terminalText?.match(/Hash: ([0-9a-f]{8})/);
    expect(hashMatch).toBeTruthy();
    const sampleHash = hashMatch![1];

    // Analyze with NMF
    await window.keyboard.type(`analyze-nmf ${sampleHash} --components 3`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(3000);

    // Sep command
    await window.keyboard.type(`sep ${sampleHash}`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(1000);

    // Play component 1
    await window.keyboard.type(`play-component ${sampleHash} 1`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(2000);

    // Get current audio data length (should be modulated component)
    const componentAudioLength = await window.evaluate(() => {
      // Access through the app's audioManager if possible
      return null; // We'll check via terminal output
    });

    // Now play full audio by hash
    await window.keyboard.type(`play ${sampleHash}`);
    await window.keyboard.press("Enter");
    await window.waitForTimeout(2000);

    // Check terminal output - should say "Loaded" not just "Playing"
    const terminalAfterPlay = await terminal.textContent();
    
    // If it reloaded, we should see "Loaded:" message
    // If it just replayed cached, we'd only see "Playing:"
    expect(terminalAfterPlay).toContain("Loaded:");
  });
});
