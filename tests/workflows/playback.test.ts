import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";

describe("playback", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let sampleHash: string;
  let channelData: number[];
  let sampleRate: number;

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-playback-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.2);
  });

  it("read-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    sampleHash = result.hash;
    channelData = result.channelData;
    sampleRate = result.sampleRate;
  });

  it("play-sample", async () => {
    await services.audioEngineClient.invoke("play", {
      sampleHash,
      pcm: channelData,
      sampleRate,
      loop: false,
    });
  });

  it("sample-is-active-after-play", async () => {
    const { activeSampleHashes } = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      activeSampleHashes.includes(sampleHash),
      `Expected ${sampleHash.substring(0, 8)}... to be active`,
    );
  });

  it("stop-sample", async () => {
    await services.audioEngineClient.invoke("stop", { sampleHash });
  });

  it("sample-not-active-after-stop", async () => {
    const { activeSampleHashes } = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      !activeSampleHashes.includes(sampleHash),
      `Expected ${sampleHash.substring(0, 8)}... to no longer be active`,
    );
  });

  it("play-two", async () => {
    await services.audioEngineClient.invoke("play", {
      sampleHash: "mock-hash-a",
      pcm: channelData,
      sampleRate,
      loop: false,
    });
    await services.audioEngineClient.invoke("play", {
      sampleHash: "mock-hash-b",
      pcm: channelData,
      sampleRate,
      loop: false,
    });
  });

  it("stop-all", async () => {
    await services.audioEngineClient.invoke("stopAll", {});
  });

  it("stop-all-clears-active", async () => {
    const { activeSampleHashes } = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.strictEqual(activeSampleHashes.length, 0, "Expected no active playbacks after stopAll");
  });
});
