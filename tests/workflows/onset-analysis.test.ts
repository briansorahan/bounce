import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { OnsetSliceResult } from "../../src/shared/rpc/analysis.rpc";

function createTransientWav(filePath: string): void {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * 0.5);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buf.writeUInt16LE(bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  const period = Math.floor(sampleRate * 0.1);
  const impulseLen = 20;
  for (let i = 0; i < numSamples; i++) {
    const phase = i % period;
    const v = phase < impulseLen ? Math.floor(0.9 * 32767 * (1 - phase / impulseLen)) : 0;
    buf.writeInt16LE(v, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buf);
}

function createSilentWav(filePath: string): void {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * 0.2);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize, 0);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buf.writeUInt16LE(bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(filePath, buf);
}

describe("onset-analysis", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let channelData: number[];
  let silentChannelData: number[];

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    cleanup?.();
  });

  it("setup", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-onset-"));
    const transientWavPath = path.join(tmpDir, "transients.wav");
    const silentWavPath = path.join(tmpDir, "silent.wav");
    createTransientWav(transientWavPath);
    createSilentWav(silentWavPath);
  });

  it("read-transient-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: path.join(tmpDir, "transients.wav"),
    });
    channelData = result.channelData;
  });

  it("read-silent-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: path.join(tmpDir, "silent.wav"),
    });
    silentChannelData = result.channelData;
  });

  it("returns-at-least-one-onset", async () => {
    const result = await services.analysisClient.invoke("onsetSlice", {
      audioData: channelData,
    }) as OnsetSliceResult;
    assert.ok(result.onsets.length > 0, "expected at least one onset in transient-rich audio");
  });

  it("onset-positions-are-non-negative", async () => {
    const result = await services.analysisClient.invoke("onsetSlice", {
      audioData: channelData,
    }) as OnsetSliceResult;
    for (const onset of result.onsets) {
      assert.ok(onset >= 0, `onset position ${onset} should be non-negative`);
    }
  });

  it("onset-positions-are-ascending", async () => {
    const result = await services.analysisClient.invoke("onsetSlice", {
      audioData: channelData,
    }) as OnsetSliceResult;
    for (let i = 1; i < result.onsets.length; i++) {
      assert.ok(
        result.onsets[i] > result.onsets[i - 1],
        `onset[${i}]=${result.onsets[i]} should be > onset[${i - 1}]=${result.onsets[i - 1]}`,
      );
    }
  });

  it("higher-threshold-returns-fewer-onsets", async () => {
    const low = await services.analysisClient.invoke("onsetSlice", {
      audioData: channelData,
      options: { threshold: 0.1 },
    }) as OnsetSliceResult;
    const high = await services.analysisClient.invoke("onsetSlice", {
      audioData: channelData,
      options: { threshold: 0.9 },
    }) as OnsetSliceResult;
    assert.ok(
      high.onsets.length <= low.onsets.length,
      `high threshold (${high.onsets.length}) should yield ≤ onsets than low threshold (${low.onsets.length})`,
    );
  });

  it("silent-audio-returns-no-onsets", async () => {
    const result = await services.analysisClient.invoke("onsetSlice", {
      audioData: silentChannelData,
    }) as OnsetSliceResult;
    assert.strictEqual(result.onsets.length, 0, "silent audio should produce no onsets");
  });
});
