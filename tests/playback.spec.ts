import { test, expect, _electron as electron } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const electronPath = require("electron") as string;

async function sendCommand(window: any, command: string) {
  await window.evaluate((cmd: string) => {
    const executeCommand = (window as any).__bounceExecuteCommand;
    if (!executeCommand) {
      throw new Error("Execute command function not exposed");
    }
    return executeCommand(cmd);
  }, command);
}

async function getPlaybackStates(window: any): Promise<Array<{ hash: string | null; position: number; totalSamples: number }>> {
  return window.evaluate(() => {
    const getter = (window as any).__bounceGetPlaybackStates;
    if (!getter) {
      throw new Error("Playback state getter not exposed");
    }
    return getter();
  });
}

function createTestWavFile(filePath: string, durationSeconds: number = 0.5) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const numChannels = 1;
  const bytesPerSample = 2;

  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write("WAVE", 8);

  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);

  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * 440 * t);
    const sample = Math.floor(value * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

function createTestWavFileWithFrequency(
  filePath: string,
  frequencyHz: number,
  durationSeconds: number = 0.5,
) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const numChannels = 1;
  const bytesPerSample = 2;

  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * frequencyHz * t);
    const sample = Math.floor(value * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

test.describe("Playback and Visualization", () => {
  const testDir = path.join(__dirname, "../test-results/playback-test");

  test.beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test("playback cursor state should advance during playback", async () => {
    const testFile = path.join(testDir, "cursor-test.wav");
    createTestWavFile(testFile, 0.5);

    const electronApp = await electron.launch({
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

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "vis.waveform(samp).show()");
    await sendCommand(window, "samp.play()");

    await expect(window.locator(".visualization-scene-waveform-canvas")).toBeVisible({
      timeout: 5000,
    });

    await window.waitForTimeout(150);
    const playbackA = await getPlaybackStates(window);
    expect(playbackA).toHaveLength(1);
    expect(playbackA[0].position).toBeGreaterThan(0);

    await window.waitForTimeout(150);
    const playbackB = await getPlaybackStates(window);
    expect(playbackB).toHaveLength(1);
    expect(playbackB[0].position).toBeGreaterThan(playbackA[0].position);

    await sendCommand(window, "samp.stop()");

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("sn.read should not auto-render visualization", async () => {
    const testFile = path.join(testDir, "viz-test.wav");
    createTestWavFile(testFile, 0.2);

    const electronApp = await electron.launch({
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

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await expect(window.locator(".visualization-scene")).toHaveCount(0);

    await sendCommand(window, `sn.read("${testFile}")`);

    await expect(window.locator(".visualization-scene")).toHaveCount(0);

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("sample.play should not create visualization if not exists", async () => {
    const testFile = path.join(testDir, "play-viz-test.wav");
    createTestWavFile(testFile, 0.3);

    const electronApp = await electron.launch({
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

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "samp.play()");

    await expect(window.locator(".xterm-rows")).toContainText("Playing:", {
      timeout: 5000,
    });
    await expect(window.locator(".visualization-scene")).toHaveCount(0);

    await sendCommand(window, "samp.stop()");

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("sample.stop should work without errors", async () => {
    const electronApp = await electron.launch({
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

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const testFile = path.join(testDir, "stop-test.wav");
    createTestWavFile(testFile, 0.1);

    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "samp.stop()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Playback stopped",
      { timeout: 5000 },
    );

    await electronApp.close();
    fs.unlinkSync(testFile);
  });

  test("sn.stop should stop all active playback", async () => {
    const firstFile = path.join(testDir, "stop-all-a.wav");
    const secondFile = path.join(testDir, "stop-all-b.wav");
    createTestWavFileWithFrequency(firstFile, 440, 1.0);
    createTestWavFileWithFrequency(secondFile, 660, 1.0);

    const electronApp = await electron.launch({
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

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, `const samp1 = sn.read("${firstFile}")`);
    await sendCommand(window, `const samp2 = sn.read("${secondFile}")`);
    await sendCommand(window, "samp1.loop()");
    await sendCommand(window, "samp2.loop()");
    await window.waitForTimeout(150);

    const beforeStop = await getPlaybackStates(window);
    expect(beforeStop.length).toBeGreaterThanOrEqual(2);

    await sendCommand(window, "sn.stop()");
    await expect(window.locator(".xterm-rows")).toContainText("Playback stopped", {
      timeout: 5000,
    });

    await window.waitForTimeout(100);
    const afterStop = await getPlaybackStates(window);
    expect(afterStop).toHaveLength(0);

    await electronApp.close();
    fs.unlinkSync(firstFile);
    fs.unlinkSync(secondFile);
  });

  test("multiple samples should keep independent playback when overlap starts", async () => {
    const firstFile = path.join(testDir, "overlap-a.wav");
    const secondFile = path.join(testDir, "overlap-b.wav");
    createTestWavFile(firstFile, 1.2);
    createTestWavFile(secondFile, 1.0);

    const electronApp = await electron.launch({
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

    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, `const samp1 = sn.read("${firstFile}")`);
    await sendCommand(window, `const samp2 = sn.read("${secondFile}")`);
    await sendCommand(window, "vis.stack().waveform(samp1).waveform(samp2).show()");
    await expect(window.locator(".visualization-scene")).toHaveCount(2);

    await sendCommand(window, "samp1.loop()");
    await window.waitForTimeout(200);
    await sendCommand(window, "samp2.play()");
    await window.waitForTimeout(120);

    const firstStateA = await getPlaybackStates(window);
    expect(firstStateA).toHaveLength(2);
    const firstPlaybackA = firstStateA.find((state) => state.hash !== null && state.totalSamples === 52920);
    const secondPlaybackA = firstStateA.find((state) => state.hash !== null && state.totalSamples === 44100);
    expect(firstPlaybackA).toBeTruthy();
    expect(secondPlaybackA).toBeTruthy();

    await window.waitForTimeout(220);

    const firstStateB = await getPlaybackStates(window);
    expect(firstStateB).toHaveLength(2);
    const firstPlaybackB = firstStateB.find((state) => state.hash === firstPlaybackA?.hash);
    const secondPlaybackB = firstStateB.find((state) => state.hash === secondPlaybackA?.hash);
    expect(firstPlaybackB).toBeTruthy();
    expect(secondPlaybackB).toBeTruthy();
    expect(firstPlaybackB!.position).toBeGreaterThan(firstPlaybackA!.position);
    expect(secondPlaybackB!.position).toBeGreaterThan(secondPlaybackA!.position);

    await sendCommand(window, "samp1.stop()");
    await sendCommand(window, "samp2.stop()");

    await electronApp.close();
    fs.unlinkSync(firstFile);
    fs.unlinkSync(secondFile);
  });
});
