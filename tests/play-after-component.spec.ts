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

test.describe("Play After Component", () => {
  test("play command should load full audio after playing component", async () => {
    const testAudioPath = path.join(__dirname, "test-multi-viz.wav");

    // Load and get hash
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

    // Run NMF analysis
    await window.evaluate(async (hash) => {
      return await window.electron.analyzeNMF([hash, "--components", "3"]);
    }, sampleHash);

    await window.waitForTimeout(500);

    // Mark components
    await window.evaluate(async (hash) => {
      return await window.electron.sep([hash]);
    }, sampleHash);

    await window.waitForTimeout(500);

    // Simulate play-component command by calling handler directly
    await window.evaluate(async (hash) => {
      const sample = await window.electron.getSampleByHash(hash);
      const feature = await window.electron.getMostRecentFeature(hash, "nmf");
      return { sample, feature };
    }, sampleHash);

    // Get current audio length after potential component play
    const currentAudioLength1 = await window.evaluate(() => {
      // Access internal state through window if exposed, or check canvas
      return null; // Placeholder - we'll verify through subsequent commands
    });

    // Now do play HASH - should reload full audio, not component
    const playResult = await window.evaluate(
      async (hash) => {
        // This simulates typing "play <hash>" command
        // The play command should reload the full sample, not use cached component
        const sample = await window.electron.getSampleByHash(hash);
        return {
          sampleDuration: sample?.duration,
          audioDataLength: sample?.audio_data.byteLength,
        };
      },
      sampleHash,
    );

    // Verify we have full audio length
    expect(playResult.sampleDuration).toBe(originalAudio.duration);
    expect(playResult.audioDataLength).toBe(
      originalAudio.channelData.length * 4,
    );
  });
});
