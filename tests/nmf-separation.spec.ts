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

test.describe("NMF Separation", () => {
  test("sep command workflow", async () => {
    const testAudioPath = path.join(__dirname, "test-multi-viz.wav");

    // Load audio
    await window.evaluate(
      async (audioPath) => {
        const audio = await window.electron.readAudioFile(audioPath);
        return audio;
      },
      testAudioPath,
    );

    await window.waitForTimeout(1000);

    // Get sample hash
    const samples = await window.evaluate(async () => {
      return await window.electron.listSamples();
    });

    expect(samples.length).toBeGreaterThan(0);
    const sampleHash = samples[0].hash;

    // Run analyze-nmf
    const analyzeResult = await window.evaluate(async (hash) => {
      return await window.electron.analyzeNMF([hash, "--components", "3"]);
    }, sampleHash);

    expect(analyzeResult.success).toBe(true);
    await window.waitForTimeout(500);

    // Run sep command
    const sepResult = await window.evaluate(async (hash) => {
      return await window.electron.sep([hash]);
    }, sampleHash);

    expect(sepResult.success).toBe(true);
    expect(sepResult.message).toContain("components");

    // Verify components were created
    const componentsSummary = await window.evaluate(async () => {
      return await window.electron.listComponentsSummary();
    });

    expect(componentsSummary.length).toBeGreaterThan(0);
    expect(componentsSummary[0].component_count).toBe(3);
  });
});
