import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult } from "../../src/shared/rpc/analysis.rpc";

describe("nmf-separation", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let channelData: number[];
  let sampleRate: number;
  let nmfResult: BufNMFResult;

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-sep-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.5);
  });

  it("read-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
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

  it("component-audio-is-non-empty", async () => {
    const { componentAudio } = await services.analysisClient.invoke("resynthesize", {
      audioData: channelData,
      sampleRate,
      bases: nmfResult.bases,
      activations: nmfResult.activations,
      componentIndex: 0,
    });
    assert.ok(componentAudio.length > 0, "resynthesized component should be non-empty");
  });

  it("all-components-same-length", async () => {
    const lengths: number[] = [];
    for (let i = 0; i < nmfResult.components; i++) {
      const { componentAudio } = await services.analysisClient.invoke("resynthesize", {
        audioData: channelData,
        sampleRate,
        bases: nmfResult.bases,
        activations: nmfResult.activations,
        componentIndex: i,
      });
      lengths.push(componentAudio.length);
    }
    for (let i = 1; i < lengths.length; i++) {
      assert.strictEqual(lengths[i], lengths[0], `component[${i}] length ${lengths[i]} !== component[0] length ${lengths[0]}`);
    }
  });

  it("component-audio-values-are-finite", async () => {
    const { componentAudio } = await services.analysisClient.invoke("resynthesize", {
      audioData: channelData,
      sampleRate,
      bases: nmfResult.bases,
      activations: nmfResult.activations,
      componentIndex: 0,
    });
    const nonFinite = componentAudio.findIndex((v) => !isFinite(v));
    assert.strictEqual(nonFinite, -1, `component audio contains non-finite value at index ${nonFinite}`);
  });

  it("components-are-distinct", async () => {
    const comp0 = (await services.analysisClient.invoke("resynthesize", {
      audioData: channelData,
      sampleRate,
      bases: nmfResult.bases,
      activations: nmfResult.activations,
      componentIndex: 0,
    })).componentAudio;
    const comp1 = (await services.analysisClient.invoke("resynthesize", {
      audioData: channelData,
      sampleRate,
      bases: nmfResult.bases,
      activations: nmfResult.activations,
      componentIndex: 1,
    })).componentAudio;
    const identical = comp0.every((v, i) => v === comp1[i]);
    assert.ok(!identical, "different component indices should produce different audio");
  });

  it("all-component-indices-succeed", async () => {
    for (let i = 0; i < nmfResult.components; i++) {
      const { componentAudio } = await services.analysisClient.invoke("resynthesize", {
        audioData: channelData,
        sampleRate,
        bases: nmfResult.bases,
        activations: nmfResult.activations,
        componentIndex: i,
      });
      assert.ok(componentAudio.length > 0, `component[${i}] should be non-empty`);
    }
  });
});
