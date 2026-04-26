import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";

interface GranularizeResult {
  grainHashes: Array<string | null>;
  featureHash: string;
  sampleRate: number;
  grainDuration: number;
  grainStartPositions: number[];
}

describe("grains", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let sampleHash: string;
  let channelData: number[];
  let sampleRate: number;
  let grainResult: GranularizeResult;
  let grainResult200: GranularizeResult;

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-grains-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 1.0);
  });

  it("read-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    sampleHash = result.hash;
    channelData = result.channelData;
    sampleRate = result.sampleRate;
  });

  it("grains-100ms", async () => {
    grainResult = await services.grainsClient.invoke("grains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration: 1.0,
      options: { grainSize: 100, silenceThreshold: -100 },
    }) as GranularizeResult;
  });

  it("grain-count-is-10", () => {
    assert.strictEqual(
      grainResult.grainHashes.length,
      10,
      `Expected 10 grains, got ${grainResult.grainHashes.length}`,
    );
  });

  it("no-silent-grains", () => {
    const nullCount = grainResult.grainHashes.filter((h) => h === null).length;
    assert.strictEqual(nullCount, 0, `Expected 0 silent grains, got ${nullCount}`);
  });

  it("grain-hashes-are-64-char-hex", () => {
    for (const h of grainResult.grainHashes) {
      assert.ok(h !== null && /^[0-9a-f]{64}$/.test(h), `Invalid grain hash: ${h}`);
    }
  });

  it("feature-hash-is-64-char-hex", () => {
    assert.ok(
      /^[0-9a-f]{64}$/.test(grainResult.featureHash),
      `Invalid featureHash: ${grainResult.featureHash}`,
    );
  });

  it("grain-duration-approx-100ms", () => {
    assert.ok(
      Math.abs(grainResult.grainDuration - 0.1) < 0.01,
      `Expected grainDuration ~0.1s, got ${grainResult.grainDuration}`,
    );
  });

  it("grains-200ms", async () => {
    grainResult200 = await services.grainsClient.invoke("grains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration: 1.0,
      options: { grainSize: 200, silenceThreshold: -100 },
    }) as GranularizeResult;
  });

  it("larger-grain-size-fewer-grains", () => {
    assert.strictEqual(
      grainResult200.grainHashes.length,
      5,
      `Expected 5 grains at 200ms, got ${grainResult200.grainHashes.length}`,
    );
  });

  it("hashes-are-deterministic", async () => {
    const result2 = await services.grainsClient.invoke("grains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration: 1.0,
      options: { grainSize: 100, silenceThreshold: -100 },
    });
    assert.deepStrictEqual(
      result2.grainHashes,
      grainResult.grainHashes,
      "Expected grain hashes to be deterministic across repeated calls",
    );
  });
});
