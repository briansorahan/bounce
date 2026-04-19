import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult } from "../../src/shared/rpc/analysis.rpc";

describe("nmf-analysis", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-nmf-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.5);
  });

  it("read-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    channelData = result.channelData;
    sampleRate = result.sampleRate;
  });

  it("result-has-bases-and-activations", async () => {
    const result = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
    }) as BufNMFResult;
    assert.ok(Array.isArray(result.bases), "bases should be an array");
    assert.ok(Array.isArray(result.activations), "activations should be an array");
  });

  it("default-yields-1-component", async () => {
    const result = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
    }) as BufNMFResult;
    assert.strictEqual(result.components, 1, "default component count should be 1");
    assert.strictEqual(result.bases.length, 1, "default should yield 1 basis");
    assert.strictEqual(result.activations.length, 1, "default should yield 1 activation");
  });

  it("each-basis-is-non-empty", async () => {
    const result = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
    }) as BufNMFResult;
    for (let i = 0; i < result.bases.length; i++) {
      assert.ok(result.bases[i].length > 0, `bases[${i}] should be non-empty`);
    }
  });

  it("each-activation-is-non-empty", async () => {
    const result = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
    }) as BufNMFResult;
    for (let i = 0; i < result.activations.length; i++) {
      assert.ok(result.activations[i].length > 0, `activations[${i}] should be non-empty`);
    }
  });

  it("components-option-3-respected", async () => {
    const result = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
      options: { components: 3 },
    }) as BufNMFResult;
    assert.strictEqual(result.components, 3, "components:3 should be reflected in result");
    assert.strictEqual(result.bases.length, 3, "components:3 should yield 3 bases");
    assert.strictEqual(result.activations.length, 3, "components:3 should yield 3 activations");
  });

  it("converged-is-boolean", async () => {
    const result = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
    }) as BufNMFResult;
    assert.strictEqual(typeof result.converged, "boolean", "converged should be a boolean");
  });

  it("iterations-is-positive", async () => {
    const result = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
    }) as BufNMFResult;
    assert.ok(result.iterations > 0, `iterations should be positive, got ${result.iterations}`);
  });
});
