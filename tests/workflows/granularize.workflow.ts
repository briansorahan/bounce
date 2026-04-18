/**
 * Workflow: granularize
 *
 * Tests the grain-slicing computation via GranularizeService.
 *
 * Verifies grain count, hash structure, silence filtering, and determinism.
 * Storage behavior (storeFeature, createDerivedSample) is a DatabaseManager
 * concern and remains covered by Playwright specs only.
 *
 * Checks:
 *   - 1s sample at 100ms grain size → 10 grains
 *   - all hashes are 64-char hex strings (sine wave, silence disabled → none null)
 *   - featureHash is a 64-char hex string
 *   - grainDuration is approximately 100ms
 *   - 200ms grain size → 5 grains
 *   - results are deterministic (same inputs → same hashes)
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";

interface GranularizeResult {
  grainHashes: Array<string | null>;
  featureHash: string;
  sampleRate: number;
  grainDuration: number;
  grainStartPositions: number[];
}

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  wavPath?: string;
  sampleHash?: string;
  channelData?: number[];
  sampleRate?: number;
  grainResult?: GranularizeResult;
  grainResult200?: GranularizeResult;
}

export function buildWorkflow() {
  const wf = createWorkflow("granularize");

  // ---- Setup ---------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-granularize-"));
    const wavPath = path.join(tmpDir, "test.wav");
    // 1.0s sine wave — grains will be above any reasonable silence threshold.
    createTestWav(wavPath, 1.0);
    return { tmpDir, wavPath };
  });

  const readWav = wf.action("read-wav", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return { sampleHash: result.hash, channelData: result.channelData, sampleRate: result.sampleRate };
  }, { after: [setup] });

  // ---- 100ms grains --------------------------------------------------------

  const granularize100 = wf.action("granularize-100ms", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.granularizeClient.invoke("granularize", {
      sourceHash: ctx.sampleHash!,
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      channels: 1,
      duration: 1.0,
      options: { grainSize: 100, silenceThreshold: -100 },
    });
    return { grainResult: result };
  }, { after: [readWav] });

  wf.check("grain-count-is-10", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.strictEqual(
      ctx.grainResult!.grainHashes.length,
      10,
      `Expected 10 grains, got ${ctx.grainResult!.grainHashes.length}`,
    );
  }, { after: [granularize100] });

  wf.check("no-silent-grains", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const nullCount = ctx.grainResult!.grainHashes.filter((h) => h === null).length;
    assert.strictEqual(nullCount, 0, `Expected 0 silent grains, got ${nullCount}`);
  }, { after: [granularize100] });

  wf.check("grain-hashes-are-64-char-hex", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    for (const h of ctx.grainResult!.grainHashes) {
      assert.ok(h !== null && /^[0-9a-f]{64}$/.test(h), `Invalid grain hash: ${h}`);
    }
  }, { after: [granularize100] });

  wf.check("feature-hash-is-64-char-hex", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(
      /^[0-9a-f]{64}$/.test(ctx.grainResult!.featureHash),
      `Invalid featureHash: ${ctx.grainResult!.featureHash}`,
    );
  }, { after: [granularize100] });

  wf.check("grain-duration-approx-100ms", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(
      Math.abs(ctx.grainResult!.grainDuration - 0.1) < 0.01,
      `Expected grainDuration ~0.1s, got ${ctx.grainResult!.grainDuration}`,
    );
  }, { after: [granularize100] });

  // ---- 200ms grains --------------------------------------------------------

  const granularize200 = wf.action("granularize-200ms", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.granularizeClient.invoke("granularize", {
      sourceHash: ctx.sampleHash!,
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      channels: 1,
      duration: 1.0,
      options: { grainSize: 200, silenceThreshold: -100 },
    });
    return { grainResult200: result };
  }, { after: ["grain-count-is-10"] });

  wf.check("larger-grain-size-fewer-grains", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.strictEqual(
      ctx.grainResult200!.grainHashes.length,
      5,
      `Expected 5 grains at 200ms, got ${ctx.grainResult200!.grainHashes.length}`,
    );
  }, { after: [granularize200] });

  // ---- Determinism ---------------------------------------------------------

  wf.check("hashes-are-deterministic", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result2 = await ctx.granularizeClient.invoke("granularize", {
      sourceHash: ctx.sampleHash!,
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      channels: 1,
      duration: 1.0,
      options: { grainSize: 100, silenceThreshold: -100 },
    });
    assert.deepStrictEqual(
      result2.grainHashes,
      ctx.grainResult!.grainHashes,
      "Expected grain hashes to be deterministic across repeated calls",
    );
  }, { after: [granularize100] });

  // ---- Cleanup -------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "grain-count-is-10",
    "no-silent-grains",
    "grain-hashes-are-64-char-hex",
    "feature-hash-is-64-char-hex",
    "grain-duration-approx-100ms",
    "larger-grain-size-fewer-grains",
    "hashes-are-deterministic",
  ]});

  return wf.build();
}
