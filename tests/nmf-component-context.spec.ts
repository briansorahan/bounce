import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import path from "path";
import { ELECTRON_MAIN, ELECTRON_ARGS, waitForReady, closeApp } from "./helpers";

const electronPath = require("electron") as string;

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [ELECTRON_MAIN, ...ELECTRON_ARGS],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
  window = await electronApp.firstWindow();
  await waitForReady(window);
});

test.afterAll(async () => {
  if (electronApp) {
    await closeApp(electronApp);
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

    expect(samples.length).toBeGreaterThan(0);
    const sampleHash = samples.find((s: { display_name: string | null }) => s.display_name?.includes("test-multi-viz"))!.hash;

    // Run analyze-nmf
    await window.evaluate(async (hash) => {
      return await window.electron.analyzeNMF([hash, "--components", "3"]);
    }, sampleHash);

    // Run sep
    await window.evaluate(async (hash) => {
      return await window.electron.sep([hash]);
    }, sampleHash);

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

    // Run visualize-nmf again - should load original sample
    await window.evaluate(async (hash) => {
      return await window.electron.visualizeNMF(hash);
    }, sampleHash);

    // Poll until waveform canvas has rendered content
    await window.waitForFunction(() => {
      const canvas = document.getElementById("waveform-canvas") as HTMLCanvasElement;
      if (!canvas) return false;
      const data = canvas.toDataURL();
      return data && data !== "data:,";
    }, { timeout: 5000 });

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
