import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BounceGrainsResult, GrainsResult } from "../../src/shared/rpc/granularize.rpc";

describe("grains-bounce", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let sampleHash: string;
  let channelData: number[];
  let sampleRate: number;
  let duration: number;
  let grainResult: GrainsResult;
  let bounceResult: BounceGrainsResult;

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-grains-bounce-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 1.0);
  });

  it("read-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    sampleHash = result.hash;
    channelData = result.channelData;
    sampleRate = result.sampleRate;
    duration = result.channelData.length / result.sampleRate;
  });

  // -------------------------------------------------------------------------
  // Test case 1: Default bounce
  // Load sample → grains → bounceGrains with all defaults
  // Verify result has a valid hash and duration matches input
  // -------------------------------------------------------------------------

  it("grains-default", async () => {
    grainResult = await services.grainsClient.invoke("grains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      options: { grainSize: 100, silenceThreshold: -100 },
    });
  });

  it("default-bounce", async () => {
    const grainPositions = grainResult.grainStartPositions.filter(
      (_, i) => grainResult.grainHashes[i] !== null,
    );
    const grainSizeSamples = Math.round((100 * sampleRate) / 1000);

    bounceResult = await services.grainsClient.invoke("bounceGrains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
      options: {},
    });
  });

  it("output-hash-is-64-char-hex", () => {
    assert.ok(
      /^[0-9a-f]{64}$/.test(bounceResult.outputHash),
      `Expected 64-char hex outputHash, got: ${bounceResult.outputHash}`,
    );
  });

  it("default-duration-matches-input", () => {
    assert.ok(
      Math.abs(bounceResult.duration - duration) < 0.01,
      `Expected duration ~${duration}s, got ${bounceResult.duration}s`,
    );
  });

  it("output-data-is-non-empty", () => {
    assert.ok(
      Array.isArray(bounceResult.outputData) && bounceResult.outputData.length > 0,
      "outputData should be a non-empty array",
    );
  });

  it("output-is-mono", () => {
    assert.strictEqual(bounceResult.channels, 1, "Output should always be mono (channels=1)");
  });

  it("sample-rate-preserved", () => {
    assert.strictEqual(bounceResult.sampleRate, sampleRate, "sampleRate should match input");
  });

  it("grain-count-is-positive", () => {
    assert.ok(bounceResult.grainCount > 0, `Expected grainCount > 0, got ${bounceResult.grainCount}`);
  });

  // -------------------------------------------------------------------------
  // Test case 2: Custom options — density, pitch, and explicit duration
  // -------------------------------------------------------------------------

  it("custom-options-bounce", async () => {
    const grainPositions = grainResult.grainStartPositions.filter(
      (_, i) => grainResult.grainHashes[i] !== null,
    );
    const grainSizeSamples = Math.round((100 * sampleRate) / 1000);

    const result = await services.grainsClient.invoke("bounceGrains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
      options: { density: 40, pitch: 1.5, duration: 5 },
    });

    assert.ok(
      Math.abs(result.duration - 5.0) < 0.01,
      `Expected output duration ~5.0s, got ${result.duration}s`,
    );
    assert.ok(
      /^[0-9a-f]{64}$/.test(result.outputHash),
      `Expected valid outputHash, got: ${result.outputHash}`,
    );
  });

  it("custom-options-output-length-matches-duration", async () => {
    const targetDuration = 3.0;
    const grainPositions = grainResult.grainStartPositions.filter(
      (_, i) => grainResult.grainHashes[i] !== null,
    );
    const grainSizeSamples = Math.round((100 * sampleRate) / 1000);

    const result = await services.grainsClient.invoke("bounceGrains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
      options: { duration: targetDuration },
    });

    const expectedSamples = Math.round(targetDuration * sampleRate);
    assert.ok(
      Math.abs(result.outputData.length - expectedSamples) <= 1,
      `Expected ~${expectedSamples} samples for ${targetDuration}s at ${sampleRate}Hz, got ${result.outputData.length}`,
    );
  });

  // -------------------------------------------------------------------------
  // Test case 3: Envelope variants (0=Hann, 1=Hamming, 2=Triangle, 3=Tukey)
  // Each should produce valid output with a distinct hash — exercises all
  // envelope code paths analogous to a help()-level feature survey.
  // -------------------------------------------------------------------------

  it("envelope-hann-is-valid", async () => {
    const grainPositions = grainResult.grainStartPositions.filter(
      (_, i) => grainResult.grainHashes[i] !== null,
    );
    const grainSizeSamples = Math.round((100 * sampleRate) / 1000);

    const result = await services.grainsClient.invoke("bounceGrains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
      options: { envelope: 0 },
    });
    assert.ok(/^[0-9a-f]{64}$/.test(result.outputHash), "Hann envelope should produce valid hash");
  });

  it("envelope-hamming-is-valid", async () => {
    const grainPositions = grainResult.grainStartPositions.filter(
      (_, i) => grainResult.grainHashes[i] !== null,
    );
    const grainSizeSamples = Math.round((100 * sampleRate) / 1000);

    const result = await services.grainsClient.invoke("bounceGrains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
      options: { envelope: 1 },
    });
    assert.ok(/^[0-9a-f]{64}$/.test(result.outputHash), "Hamming envelope should produce valid hash");
  });

  it("envelope-triangle-is-valid", async () => {
    const grainPositions = grainResult.grainStartPositions.filter(
      (_, i) => grainResult.grainHashes[i] !== null,
    );
    const grainSizeSamples = Math.round((100 * sampleRate) / 1000);

    const result = await services.grainsClient.invoke("bounceGrains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
      options: { envelope: 2 },
    });
    assert.ok(/^[0-9a-f]{64}$/.test(result.outputHash), "Triangle envelope should produce valid hash");
  });

  it("envelope-tukey-is-valid", async () => {
    const grainPositions = grainResult.grainStartPositions.filter(
      (_, i) => grainResult.grainHashes[i] !== null,
    );
    const grainSizeSamples = Math.round((100 * sampleRate) / 1000);

    const result = await services.grainsClient.invoke("bounceGrains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
      options: { envelope: 3 },
    });
    assert.ok(/^[0-9a-f]{64}$/.test(result.outputHash), "Tukey envelope should produce valid hash");
  });

  it("envelope-variants-produce-distinct-hashes", async () => {
    const grainPositions = grainResult.grainStartPositions.filter(
      (_, i) => grainResult.grainHashes[i] !== null,
    );
    const grainSizeSamples = Math.round((100 * sampleRate) / 1000);

    const baseParams = {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
    };

    const [r0, r1, r2, r3] = await Promise.all([
      services.grainsClient.invoke("bounceGrains", { ...baseParams, options: { envelope: 0 } }),
      services.grainsClient.invoke("bounceGrains", { ...baseParams, options: { envelope: 1 } }),
      services.grainsClient.invoke("bounceGrains", { ...baseParams, options: { envelope: 2 } }),
      services.grainsClient.invoke("bounceGrains", { ...baseParams, options: { envelope: 3 } }),
    ]);

    const hashes = new Set([r0.outputHash, r1.outputHash, r2.outputHash, r3.outputHash]);
    assert.strictEqual(
      hashes.size,
      4,
      "Each envelope variant should produce a distinct output hash",
    );
  });

  // -------------------------------------------------------------------------
  // Test case 4: Chaining — grains → bounceGrains in one sequential pipeline
  // Verifies that the two-step workflow produces deterministic results when
  // called back-to-back (equivalent to sn.load().grains().bounce() in the REPL)
  // -------------------------------------------------------------------------

  it("chained-grains-then-bounce-is-deterministic", async () => {
    const grainSizeMs = 50;
    const grainSizeSamples = Math.round((grainSizeMs * sampleRate) / 1000);

    const run = async (): Promise<BounceGrainsResult> => {
      const g = await services.grainsClient.invoke("grains", {
        sourceHash: sampleHash,
        audioData: channelData,
        sampleRate,
        channels: 1,
        duration,
        options: { grainSize: grainSizeMs, silenceThreshold: -100 },
      });

      const grainPositions = g.grainStartPositions.filter(
        (_, i) => g.grainHashes[i] !== null,
      );

      return services.grainsClient.invoke("bounceGrains", {
        sourceHash: sampleHash,
        audioData: channelData,
        sampleRate,
        channels: 1,
        duration,
        grainPositions,
        grainSizeSamples,
        options: { density: 20, pitch: 1.0 },
      });
    };

    const [first, second] = await Promise.all([run(), run()]);

    assert.strictEqual(
      first.outputHash,
      second.outputHash,
      "grains().bounce() pipeline must be deterministic across repeated calls",
    );
  });

  it("chained-pipeline-produces-valid-result-shape", async () => {
    const grainSizeMs = 50;
    const grainSizeSamples = Math.round((grainSizeMs * sampleRate) / 1000);

    const g = await services.grainsClient.invoke("grains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      options: { grainSize: grainSizeMs, silenceThreshold: -100 },
    });

    const grainPositions = g.grainStartPositions.filter(
      (_, i) => g.grainHashes[i] !== null,
    );

    const result = await services.grainsClient.invoke("bounceGrains", {
      sourceHash: sampleHash,
      audioData: channelData,
      sampleRate,
      channels: 1,
      duration,
      grainPositions,
      grainSizeSamples,
      options: {},
    });

    assert.ok(/^[0-9a-f]{64}$/.test(result.outputHash), "outputHash should be 64-char hex");
    assert.strictEqual(result.channels, 1, "channels should be 1 (mono)");
    assert.strictEqual(result.sampleRate, sampleRate, "sampleRate should be preserved");
    assert.ok(result.grainCount > 0, "grainCount should be positive");
    assert.ok(
      Math.abs(result.duration - duration) < 0.01,
      `duration should match source (${duration}s), got ${result.duration}s`,
    );
  });
});
