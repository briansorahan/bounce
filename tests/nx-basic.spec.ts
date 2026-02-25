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

test.describe("NMF Cross-Synthesis Basic", () => {
  test("nx command should execute without crashing", async () => {
    test.setTimeout(120000);
    
    const audioPath = path.join(__dirname, "test-multi-viz.wav");

    // Load same audio twice (as both source and target)
    await window.evaluate(
      async (path) => {
        return await window.electron.readAudioFile(path);
      },
      audioPath,
    );

    await window.waitForTimeout(500);

    const samples1 = await window.evaluate(async () => {
      return await window.electron.listSamples();
    });
    const sample1Hash = samples1[samples1.length - 1].hash.substring(0, 8);

    // Analyze first load as source
    const analyzeResult = await window.evaluate(async (hash) => {
      return await window.electron.analyzeNMF([
        hash,
        "--components",
        "2",
        "--iterations",
        "10",
      ]);
    }, sample1Hash);

    expect(analyzeResult.success).toBe(true);
    await window.waitForTimeout(1000);

    // Load second time as target
    await window.evaluate(
      async (path) => {
        return await window.electron.readAudioFile(path);
      },
      audioPath,
    );

    await window.waitForTimeout(500);

    const samples2 = await window.evaluate(async () => {
      return await window.electron.listSamples();
    });
    const sample2Hash = samples2[samples2.length - 1].hash.substring(0, 8);

    // Run nx (should not crash)
    const nxResult = await window.evaluate(
      async (args) => {
        return await window.electron.sendCommand("nx", args);
      },
      [sample2Hash, sample1Hash],
    );

    expect(nxResult).toBeDefined();
    expect(nxResult.success).toBe(true);
  });
});
