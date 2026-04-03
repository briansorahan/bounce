import { test, expect } from "./fixtures";
import * as path from "path";
import * as fs from "fs";

async function getPlaybackStates(window: any): Promise<Array<{ hash: string | null; position: number; totalSamples: number }>> {
  return window.evaluate(() => {
    const getter = (window as any).__bounceGetPlaybackStates;
    if (!getter) {
      throw new Error("Playback state getter not exposed");
    }
    return getter();
  });
}

function getLoopAwareAdvance(previous: number, current: number, totalSamples: number): number {
  if (totalSamples <= 0) {
    return 0;
  }
  return ((current - previous) % totalSamples + totalSamples) % totalSamples;
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

  test("playback cursor state should advance during playback", async ({ window, sendCommand }) => {
    const testFile = path.join(testDir, "cursor-test.wav");
    createTestWavFile(testFile, 0.5);

    try {
      await sendCommand(`const samp = sn.read("${testFile}")`);
      await sendCommand("vis.waveform(samp).show()");
      await sendCommand("samp.play()");

      await expect(window.locator(".visualization-scene-waveform-canvas")).toBeVisible({
        timeout: 5000,
      });

      // Poll until playback position is non-zero
      await window.waitForFunction(() => {
        const states = (window as any).__bounceGetPlaybackStates?.();
        return states?.length === 1 && states[0].position > 0;
      }, { timeout: 5000 });
      const playbackA = await getPlaybackStates(window);

      // Poll until position has advanced further
      const posA = playbackA[0].position;
      await window.waitForFunction((prevPos: number) => {
        const states = (window as any).__bounceGetPlaybackStates?.();
        return states?.length === 1 && states[0].position > prevPos;
      }, posA, { timeout: 5000 });
      const playbackB = await getPlaybackStates(window);
      expect(playbackB[0].position).toBeGreaterThan(posA);

      await sendCommand("samp.stop()");
    } finally {
      fs.unlinkSync(testFile);
    }
  });

  test("sn.read should not auto-render visualization", async ({ window, sendCommand }) => {
    const testFile = path.join(testDir, "viz-test.wav");
    createTestWavFile(testFile, 0.2);

    try {
      await expect(window.locator(".visualization-scene")).toHaveCount(0);

      await sendCommand(`sn.read("${testFile}")`);

      await expect(window.locator(".visualization-scene")).toHaveCount(0);
    } finally {
      fs.unlinkSync(testFile);
    }
  });

  test("sample.play should not create visualization if not exists", async ({ window, sendCommand }) => {
    const testFile = path.join(testDir, "play-viz-test.wav");
    createTestWavFile(testFile, 0.3);

    try {
      await sendCommand(`const samp = sn.read("${testFile}")`);
      await sendCommand("samp.play()");

      await expect(window.locator(".xterm-rows")).toContainText("Playing:", {
        timeout: 5000,
      });
      await expect(window.locator(".visualization-scene")).toHaveCount(0);

      await sendCommand("samp.stop()");
    } finally {
      fs.unlinkSync(testFile);
    }
  });

  test("sample.stop should work without errors", async ({ window, sendCommand }) => {
    const testFile = path.join(testDir, "stop-test.wav");
    createTestWavFile(testFile, 0.1);

    try {
      await sendCommand(`const samp = sn.read("${testFile}")`);
      await sendCommand("samp.stop()");

      await expect(window.locator(".xterm-rows")).toContainText(
        "Playback stopped",
        { timeout: 5000 },
      );
    } finally {
      fs.unlinkSync(testFile);
    }
  });

  test("sn.stop should stop all active playback", async ({ window, sendCommand }) => {
    const firstFile = path.join(testDir, "stop-all-a.wav");
    const secondFile = path.join(testDir, "stop-all-b.wav");
    createTestWavFileWithFrequency(firstFile, 440, 1.0);
    createTestWavFileWithFrequency(secondFile, 660, 1.0);

    try {
      await sendCommand(`const samp1 = sn.read("${firstFile}")`);
      await sendCommand(`const samp2 = sn.read("${secondFile}")`);
      await sendCommand("samp1.loop()");
      await sendCommand("samp2.loop()");

      // Poll until both loops are active
      await window.waitForFunction(() => {
        const states = (window as any).__bounceGetPlaybackStates?.();
        return states?.length >= 2;
      }, { timeout: 5000 });

      await sendCommand("sn.stop()");
      await expect(window.locator(".xterm-rows")).toContainText("Playback stopped", {
        timeout: 5000,
      });

      // Poll until all playback states are cleared
      await window.waitForFunction(() => {
        const states = (window as any).__bounceGetPlaybackStates?.();
        return states?.length === 0;
      }, { timeout: 5000 });
    } finally {
      fs.unlinkSync(firstFile);
      fs.unlinkSync(secondFile);
    }
  });

  test("multiple samples should keep independent playback when overlap starts", async ({ window, sendCommand }) => {
    const firstFile = path.join(testDir, "overlap-a.wav");
    const secondFile = path.join(testDir, "overlap-b.wav");
    createTestWavFile(firstFile, 1.2);
    createTestWavFile(secondFile, 1.0);

    try {
      await sendCommand(`const samp1 = sn.read("${firstFile}")`);
      await sendCommand(`const samp2 = sn.read("${secondFile}")`);
      await sendCommand("vis.stack().waveform(samp1).waveform(samp2).show()");
      await expect(window.locator(".visualization-scene")).toHaveCount(2);

      await sendCommand("samp1.loop()");

      // Poll until first loop is active before starting second
      await window.waitForFunction(() => {
        const states = (window as any).__bounceGetPlaybackStates?.();
        return states?.length >= 1 && states[0].position > 0;
      }, { timeout: 5000 });

      await sendCommand("samp2.play()");

      // Poll until both playbacks are active
      await window.waitForFunction(() => {
        const states = (window as any).__bounceGetPlaybackStates?.();
        return states?.length === 2;
      }, { timeout: 5000 });

      const firstStateA = await getPlaybackStates(window);
      expect(firstStateA).toHaveLength(2);
      const firstPlaybackA = firstStateA.find((state) => state.hash !== null && state.totalSamples === 52920);
      const secondPlaybackA = firstStateA.find((state) => state.hash !== null && state.totalSamples === 44100);
      expect(firstPlaybackA).toBeTruthy();
      expect(secondPlaybackA).toBeTruthy();

      // Poll until the first playback has advanced from its captured position
      const pos1A = firstPlaybackA!.position;
      await window.waitForFunction((prevPos: number) => {
        const states = (window as any).__bounceGetPlaybackStates?.();
        const s = states?.find((st: any) => st.totalSamples === 52920);
        return s && s.position !== prevPos;
      }, pos1A, { timeout: 5000 });

      const firstStateB = await getPlaybackStates(window);
      expect(firstStateB).toHaveLength(2);
      const firstPlaybackB = firstStateB.find((state) => state.hash === firstPlaybackA?.hash);
      const secondPlaybackB = firstStateB.find((state) => state.hash === secondPlaybackA?.hash);
      expect(firstPlaybackB).toBeTruthy();
      expect(secondPlaybackB).toBeTruthy();
      expect(
        getLoopAwareAdvance(
          firstPlaybackA!.position,
          firstPlaybackB!.position,
          firstPlaybackA!.totalSamples,
        ),
      ).toBeGreaterThan(0);
      if (secondPlaybackA!.position < secondPlaybackA!.totalSamples) {
        expect(secondPlaybackB!.position).toBeGreaterThan(secondPlaybackA!.position);
      } else {
        expect(secondPlaybackB!.position).toBe(secondPlaybackA!.position);
      }

      await sendCommand("samp1.stop()");
      await sendCommand("samp2.stop()");
    } finally {
      fs.unlinkSync(firstFile);
      fs.unlinkSync(secondFile);
    }
  });
});
