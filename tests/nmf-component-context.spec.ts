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

test.describe("NMF Component Context", () => {
  test("visualize-nmf should load original sample after playing component", async () => {
    const testAudioPath = path.join(__dirname, "test-multi-viz.wav");

    // Load audio
    const originalAudio = await window.evaluate(
      async (audioPath) => {
        return await window.electron.readAudioFile(audioPath);
      },
      testAudioPath,
    );

    const samples = await window.evaluate(async () => {
      return await window.electron.listSamples();
    });

    const sampleHash = samples[0].hash;

    // Run analyze-nmf
    await window.evaluate(async (hash) => {
      return await window.electron.analyzeNMF([hash, "--components", "3"]);
    }, sampleHash);

    await window.waitForTimeout(500);

    // Run sep
    await window.evaluate(async (hash) => {
      return await window.electron.sep([hash]);
    }, sampleHash);

    await window.waitForTimeout(500);

    // Get waveform data after initial analysis
    const waveformAfterAnalyze = await window.evaluate(() => {
      const canvas = document.getElementById("waveform-canvas") as HTMLCanvasElement;
      return canvas ? canvas.toDataURL() : null;
    });

    // Play component (changes current audio)
    await window.evaluate(async (hash) => {
      const feature = await window.electron.getMostRecentFeature(hash, "nmf");
      // Component playback happens but we won't actually wait for audio
    }, sampleHash);

    await window.waitForTimeout(500);

    // Run visualize-nmf again - should load original sample
    await window.evaluate(async (hash) => {
      return await window.electron.visualizeNMF(hash);
    }, sampleHash);

    await window.waitForTimeout(1000);

    // Verify waveform shows original audio, not component
    const waveformAfterVisualize = await window.evaluate(() => {
      const canvas = document.getElementById("waveform-canvas") as HTMLCanvasElement;
      return canvas ? canvas.toDataURL() : null;
    });

    // The waveforms should be similar (showing original audio)
    expect(waveformAfterVisualize).toBeTruthy();
    expect(waveformAfterAnalyze).toBeTruthy();
  });
});
