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
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-nx-cross-"));
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

test.describe("NMF Cross-Synthesis", () => {
  test("nx command should apply source dictionary to target and display waveform", async () => {
    test.setTimeout(120000); // 2 minutes for longer processing
    
    const sourceAudioPath = path.join(__dirname, "test-multi-viz.wav");
    const targetAudioPath = path.join(__dirname, "test-remove-viz.wav");

    // Load and analyze source audio
    await window.evaluate(
      async (audioPath) => {
        return await window.electron.readAudioFile(audioPath);
      },
      sourceAudioPath,
    );

    await window.waitForTimeout(500);

    const sourceSamples = await window.evaluate(async () => {
      return await window.electron.listSamples();
    });
    const sourceHash = sourceSamples[sourceSamples.length - 1].hash;
    const sourceHashShort = sourceHash.substring(0, 8);

    // Analyze source with NMF to create dictionary
    const analyzeResult = await window.evaluate(async (hash) => {
      return await window.electron.analyzeNMF([
        hash,
        "--components",
        "2",
        "--iterations",
        "10",
      ]);
    }, sourceHash);

    expect(analyzeResult.success).toBe(true);
    await window.waitForTimeout(1500);

    // Load target audio
    await window.evaluate(
      async (audioPath) => {
        return await window.electron.readAudioFile(audioPath);
      },
      targetAudioPath,
    );

    await window.waitForTimeout(500);

    const targetSamples = await window.evaluate(async () => {
      return await window.electron.listSamples();
    });
    const targetHash = targetSamples[targetSamples.length - 1].hash;
    const targetHashShort = targetHash.substring(0, 8);

    // Get initial waveform canvas state
    const initialWaveform = await window.evaluate(() => {
      const canvas = document.getElementById(
        "waveform-canvas",
      ) as HTMLCanvasElement;
      return canvas ? canvas.toDataURL() : null;
    });

    expect(initialWaveform).toBeTruthy();

    // Execute nx via terminal using sendCommand
    let nxResult;
    try {
      nxResult = await window.evaluate(
        async (args) => {
          try {
            const result = await window.electron.sendCommand("nx", args);
            console.log("NX Result:", result);
            return result;
          } catch (err) {
            console.error("NX Error:", err);
            return { success: false, message: String(err), error: err };
          }
        },
        [targetHashShort, sourceHashShort],
      );
    } catch (err) {
      console.error("Evaluation error:", err);
      throw err;
    }

    expect(nxResult).toBeDefined();
    
    if (!nxResult.success) {
      console.error("NX failed:", nxResult.message);
    }
    
    expect(nxResult.success).toBe(true);
    expect(nxResult.message).toContain("cross-synthesis complete");
    expect(nxResult.message).toContain("2 components resynthesized");

    await window.waitForTimeout(1500);

    // Verify nmf-cross feature was stored
    const features = await window.evaluate(async () => {
      return await window.electron.listFeatures();
    });

    const crossFeature = features.find(
      (f) => f.feature_type === "nmf-cross" && f.sample_hash.startsWith(targetHashShort),
    );
    expect(crossFeature).toBeDefined();

    // Verify components were created and have audio data
    const componentsSummary = await window.evaluate(async () => {
      const summary = await window.electron.listDerivedSamplesSummary();
      return summary.filter((s) => s.feature_type === "nmf-cross");
    });

    const targetComponents = componentsSummary.find(
      (s) => s.source_hash.startsWith(targetHashShort) && s.derived_count === 2,
    );
    expect(targetComponents).toBeDefined();
    expect(targetComponents!.derived_count).toBe(2);
  });
});
