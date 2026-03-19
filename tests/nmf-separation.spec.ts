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

test.beforeAll(async () => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-nmf-sep-"));
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

    // Run sep command
    const sepResult = await window.evaluate(async (hash) => {
      return await window.electron.sep([hash]);
    }, sampleHash);

    expect(sepResult.success).toBe(true);
    expect(sepResult.message).toContain("components");

    // Verify components were created
    const componentsSummary = await window.evaluate(async () => {
      const summary = await window.electron.listDerivedSamplesSummary();
      return summary.filter((s) => s.feature_type === "nmf");
    });

    expect(componentsSummary.length).toBeGreaterThan(0);
    expect(componentsSummary[0].derived_count).toBe(3);
  });
});
