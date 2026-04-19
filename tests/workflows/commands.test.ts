import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav, createTextFile } from "./helpers";
import type { WorkflowServices } from "./helpers";

describe("commands", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let textPath: string;
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-commands-"));
    wavPath = path.join(tmpDir, "test.wav");
    textPath = path.join(tmpDir, "not-audio.txt");
    createTestWav(wavPath, 0.2);
    createTextFile(textPath);
  });

  it("read-valid-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    sampleHash = result.hash;
    channelData = result.channelData;
    sampleRate = result.sampleRate;
  });

  it("read-wav-returns-hash", () => {
    assert.ok(typeof sampleHash === "string" && sampleHash.length > 0, "hash should be a non-empty string");
  });

  it("read-wav-returns-channel-data", () => {
    assert.ok(Array.isArray(channelData) && channelData.length > 0, "channelData should be a non-empty array");
  });

  it("read-wav-returns-sample-rate", () => {
    assert.ok(typeof sampleRate === "number" && sampleRate > 0, "sampleRate should be a positive number");
  });

  it("read-non-audio-file-throws", async () => {
    let threw = false;
    try {
      await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: textPath });
    } catch (err) {
      threw = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert.ok(
        msg.toLowerCase().includes("unsupported"),
        `expected "unsupported" in error message, got: ${msg}`,
      );
    }
    assert.ok(threw, "expected readAudioFile to throw for a non-audio file");
  });

  it("play-sample", async () => {
    await services.audioEngineClient.invoke("play", {
      sampleHash,
      pcm: channelData,
      sampleRate,
      loop: false,
    });
  });

  it("play-adds-hash-to-active-playbacks", async () => {
    const state = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      state.activeSampleHashes.includes(sampleHash),
      `expected ${sampleHash} in active playbacks after play()`,
    );
  });

  it("stop-sample", async () => {
    await services.audioEngineClient.invoke("stop", { sampleHash });
  });

  it("stop-removes-hash-from-active-playbacks", async () => {
    const state = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      !state.activeSampleHashes.includes(sampleHash),
      `expected ${sampleHash} to be absent from active playbacks after stop()`,
    );
  });
});
