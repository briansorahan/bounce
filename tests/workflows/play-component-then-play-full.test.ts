import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult } from "../../src/shared/rpc/analysis.rpc";

const COMPONENT_INDEX = 1;

describe("play-component-then-play-full", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let sampleHash: string;
  let componentHash: string;
  let channelData: number[];
  let sampleRate: number;
  let nmfResult: BufNMFResult;
  let componentAudio: number[];

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-play-comp-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.5);
  });

  it("read-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    sampleHash = result.hash;
    channelData = result.channelData;
    sampleRate = result.sampleRate;
  });

  it("run-nmf", async () => {
    nmfResult = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
      options: { components: 3 },
    }) as BufNMFResult;
  });

  it("resynthesize-component", async () => {
    const result = await services.analysisClient.invoke("resynthesize", {
      audioData: channelData,
      sampleRate,
      bases: nmfResult.bases,
      activations: nmfResult.activations,
      componentIndex: COMPONENT_INDEX,
    });
    componentAudio = result.componentAudio;
    componentHash = `${sampleHash}:component:${COMPONENT_INDEX}`;
  });

  it("component-audio-is-non-empty", () => {
    assert.ok(componentAudio.length > 0, "resynthesized component audio should be non-empty");
  });

  it("play-component", async () => {
    await services.audioEngineClient.invoke("play", {
      sampleHash: componentHash,
      pcm: componentAudio,
      sampleRate,
      loop: false,
    });
  });

  it("component-hash-is-active-after-play", async () => {
    const state = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      state.activeSampleHashes.includes(componentHash),
      `expected component hash ${componentHash} in active playbacks`,
    );
  });

  it("play-full", async () => {
    await services.audioEngineClient.invoke("play", {
      sampleHash,
      pcm: channelData,
      sampleRate,
      loop: false,
    });
  });

  it("full-sample-hash-is-active-after-play", async () => {
    const state = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      state.activeSampleHashes.includes(sampleHash),
      `expected original hash ${sampleHash} in active playbacks after playing full sample`,
    );
  });

  it("both-hashes-active-simultaneously", async () => {
    const state = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      state.activeSampleHashes.includes(componentHash),
      `expected component hash ${componentHash} to still be active`,
    );
    assert.ok(
      state.activeSampleHashes.includes(sampleHash),
      `expected original hash ${sampleHash} to be active`,
    );
  });

  it("stop-component", async () => {
    await services.audioEngineClient.invoke("stop", { sampleHash: componentHash });
  });

  it("full-sample-still-active-after-stopping-component", async () => {
    const state = await services.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      !state.activeSampleHashes.includes(componentHash),
      "component hash should be gone after stop()",
    );
    assert.ok(
      state.activeSampleHashes.includes(sampleHash),
      `original hash ${sampleHash} should still be active after stopping the component`,
    );
  });
});
