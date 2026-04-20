import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult, BufNMFCrossResult } from "../../src/shared/rpc/analysis.rpc";

const FFT_SIZE = 1024;

describe("nx-basic", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let channelData: number[];
  let sampleRate: number;
  let sourceNmf: BufNMFResult;
  let crossResult: BufNMFCrossResult;

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-nx-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.5);
  });

  it("read-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    channelData = result.channelData;
    sampleRate = result.sampleRate;
  });

  it("run-source-nmf", async () => {
    sourceNmf = await services.analysisClient.invoke("bufNMF", {
      audioData: channelData,
      sampleRate,
      options: { components: 2, iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFResult;
  });

  it("run-cross-synthesis", async () => {
    crossResult = await services.analysisClient.invoke("bufNMFCross", {
      targetAudioData: channelData,
      sampleRate,
      sourceBases: sourceNmf.bases,
      sourceActivations: sourceNmf.activations,
      options: { iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFCrossResult;
  });

  it("result-has-bases-and-activations", () => {
    assert.ok(Array.isArray(crossResult.bases), "cross result should have bases array");
    assert.ok(Array.isArray(crossResult.activations), "cross result should have activations array");
  });

  it("component-count-matches-source", () => {
    assert.strictEqual(
      crossResult.components,
      sourceNmf.components,
      "cross result component count should match source NMF",
    );
    assert.strictEqual(crossResult.bases.length, sourceNmf.components);
    assert.strictEqual(crossResult.activations.length, sourceNmf.components);
  });

  it("each-basis-is-non-empty", () => {
    for (let i = 0; i < crossResult.bases.length; i++) {
      assert.ok(crossResult.bases[i].length > 0, `cross bases[${i}] should be non-empty`);
    }
  });

  it("each-activation-is-non-empty", () => {
    for (let i = 0; i < crossResult.activations.length; i++) {
      assert.ok(crossResult.activations[i].length > 0, `cross activations[${i}] should be non-empty`);
    }
  });

  it("basis-bin-dimension-matches-source", () => {
    const sourceBinCount = sourceNmf.bases[0].length;
    for (let i = 0; i < crossResult.bases.length; i++) {
      assert.strictEqual(
        crossResult.bases[i].length,
        sourceBinCount,
        `cross bases[${i}] bin count should match source (${sourceBinCount})`,
      );
    }
  });

  it("cross-result-differs-from-source-activations", () => {
    const src = sourceNmf.activations[0];
    const cross = crossResult.activations[0];
    const len = Math.min(src.length, cross.length);
    let diffCount = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(src[i] - cross[i]) > 1e-9) diffCount++;
    }
    assert.ok(diffCount > 0, "cross-synthesis activations should differ from source activations");
  });
});
