/**
 * Workflow: nx-basic
 *
 * Tests the AnalysisService bufNMFCross IPC contract.
 * Corresponds to the IPC-testable subset of tests/nx-basic.spec.ts.
 *
 * The Playwright spec checks that the nx command "does not crash" (success:true).
 * Here we verify the underlying cross-synthesis produces a structurally valid
 * result, using the same audio as both source and target (matching the spec).
 *
 * Important: BufNMF and BufNMFCross must use the same fftSize. We use 1024
 * throughout to avoid the "FFT size mismatch" error from the native addon.
 *
 * Checks:
 *   - bufNMFCross() returns bases and activations arrays
 *   - result component count matches source NMF component count
 *   - each basis is non-empty
 *   - each activation is non-empty
 *   - result bases have same frequency-bin dimension as source bases
 *   - cross-synthesis result differs from the source NMF result
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult, BufNMFCrossResult } from "../../src/shared/rpc/analysis.rpc";

// fftSize must match between bufNMF and bufNMFCross.
const FFT_SIZE = 1024;

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  wavPath?: string;
  channelData?: number[];
  sampleRate?: number;
  sourceNmf?: BufNMFResult;
  crossResult?: BufNMFCrossResult;
}

export function buildWorkflow() {
  const wf = createWorkflow("nx-basic");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-nx-"));
    const wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.5);
    return { tmpDir, wavPath };
  });

  const readWav = wf.action("read-wav", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return { channelData: result.channelData, sampleRate: result.sampleRate };
  }, { after: [setup] });

  const runSourceNmf = wf.action("run-source-nmf", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sourceNmf = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      options: { components: 2, iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFResult;
    return { sourceNmf };
  }, { after: [readWav] });

  const runCrossSynthesis = wf.action("run-cross-synthesis", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const crossResult = await ctx.analysisClient.invoke("bufNMFCross", {
      targetAudioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      sourceBases: ctx.sourceNmf!.bases,
      sourceActivations: ctx.sourceNmf!.activations,
      options: { iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFCrossResult;
    return { crossResult };
  }, { after: [runSourceNmf] });

  // ---- Checks ---------------------------------------------------------------

  wf.check("result-has-bases-and-activations", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(Array.isArray(ctx.crossResult!.bases), "cross result should have bases array");
    assert.ok(Array.isArray(ctx.crossResult!.activations), "cross result should have activations array");
  }, { after: [runCrossSynthesis] });

  wf.check("component-count-matches-source", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.strictEqual(
      ctx.crossResult!.components,
      ctx.sourceNmf!.components,
      "cross result component count should match source NMF",
    );
    assert.strictEqual(ctx.crossResult!.bases.length, ctx.sourceNmf!.components);
    assert.strictEqual(ctx.crossResult!.activations.length, ctx.sourceNmf!.components);
  }, { after: [runCrossSynthesis] });

  wf.check("each-basis-is-non-empty", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    for (let i = 0; i < ctx.crossResult!.bases.length; i++) {
      assert.ok(ctx.crossResult!.bases[i].length > 0, `cross bases[${i}] should be non-empty`);
    }
  }, { after: [runCrossSynthesis] });

  wf.check("each-activation-is-non-empty", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    for (let i = 0; i < ctx.crossResult!.activations.length; i++) {
      assert.ok(ctx.crossResult!.activations[i].length > 0, `cross activations[${i}] should be non-empty`);
    }
  }, { after: [runCrossSynthesis] });

  wf.check("basis-bin-dimension-matches-source", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sourceBinCount = ctx.sourceNmf!.bases[0].length;
    for (let i = 0; i < ctx.crossResult!.bases.length; i++) {
      assert.strictEqual(
        ctx.crossResult!.bases[i].length,
        sourceBinCount,
        `cross bases[${i}] bin count should match source (${sourceBinCount})`,
      );
    }
  }, { after: [runCrossSynthesis] });

  wf.check("cross-result-differs-from-source-activations", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    // Activations should differ since cross-synthesis adapts them to the target.
    const src = ctx.sourceNmf!.activations[0];
    const cross = ctx.crossResult!.activations[0];
    const len = Math.min(src.length, cross.length);
    let diffCount = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(src[i] - cross[i]) > 1e-9) diffCount++;
    }
    assert.ok(diffCount > 0, "cross-synthesis activations should differ from source activations");
  }, { after: [runCrossSynthesis] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "result-has-bases-and-activations",
    "component-count-matches-source",
    "each-basis-is-non-empty",
    "each-activation-is-non-empty",
    "basis-bin-dimension-matches-source",
    "cross-result-differs-from-source-activations",
  ]});

  return wf.build();
}
