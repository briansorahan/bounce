import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { ReadAudioFileResult } from "../../src/shared/rpc/audio-file.rpc";
import type { BufNMFResult } from "../../src/shared/rpc/analysis.rpc";

describe("nmf-component-context", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let originalRead: ReadAudioFileResult;
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-nmfctx-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.5);
  });

  it("read-original", async () => {
    originalRead = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
  });

  it("run-nmf", async () => {
    nmfResult = await services.analysisClient.invoke("bufNMF", {
      audioData: originalRead.channelData,
      sampleRate: originalRead.sampleRate,
      options: { components: 3 },
    }) as BufNMFResult;
  });

  it("resynth-component-0", async () => {
    const result = await services.analysisClient.invoke("resynthesize", {
      audioData: originalRead.channelData,
      sampleRate: originalRead.sampleRate,
      bases: nmfResult.bases,
      activations: nmfResult.activations,
      componentIndex: 0,
    });
    componentAudio = result.componentAudio;
  });

  it("original-still-readable-by-hash", async () => {
    const reRead = await services.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: originalRead.hash,
    });
    assert.ok(reRead.channelData.length > 0, "re-read by hash should return non-empty channelData");
  });

  it("re-read-channel-data-matches-original", async () => {
    const reRead = await services.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: originalRead.hash,
    });
    assert.strictEqual(
      reRead.channelData.length,
      originalRead.channelData.length,
      "re-read channelData length should match original",
    );
    assert.strictEqual(reRead.hash, originalRead.hash, "re-read hash should match original");
  });

  it("re-read-sample-rate-matches-original", async () => {
    const reRead = await services.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: originalRead.hash,
    });
    assert.strictEqual(reRead.sampleRate, originalRead.sampleRate, "re-read sampleRate should match original");
  });

  it("component-audio-is-distinct-from-original", () => {
    const original = originalRead.channelData;
    const component = componentAudio;
    const len = Math.min(original.length, component.length);
    let diffCount = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(original[i] - component[i]) > 1e-6) diffCount++;
    }
    assert.ok(diffCount > 0, "component audio should differ from original audio");
  });
});
