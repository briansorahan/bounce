/**
 * Workflow: nmf-analysis
 *
 * Tests the AnalysisService bufNMF IPC contract.
 * Corresponds to the IPC-testable subset of tests/nmf-analysis.spec.ts.
 * (Visualization and DOM assertions in that spec are renderer-only and not
 * covered here.)
 *
 * BufNMFResult shape (from native addon):
 *   components  — number (the requested count)
 *   bases       — number[][] (spectral bases, one per component)
 *   activations — number[][] (activation envelopes, one per component)
 *   iterations  — number
 *   converged   — boolean
 *
 * Checks:
 *   - bufNMF() returns bases and activations arrays
 *   - default component count (1) produces 1 basis and 1 activation
 *   - each basis array is non-empty
 *   - each activation array is non-empty
 *   - components option is respected: components:3 gives 3 bases/activations
 *   - converged flag is a boolean
 *   - iterations is a positive number
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult } from "../../src/shared/rpc/analysis.rpc";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  wavPath?: string;
  channelData?: number[];
  sampleRate?: number;
}

export function buildWorkflow() {
  const wf = createWorkflow("nmf-analysis");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-nmf-"));
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

  // ---- Checks ---------------------------------------------------------------

  wf.check("result-has-bases-and-activations", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
    }) as BufNMFResult;
    assert.ok(Array.isArray(result.bases), "bases should be an array");
    assert.ok(Array.isArray(result.activations), "activations should be an array");
  }, { after: [readWav] });

  wf.check("default-yields-1-component", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
    }) as BufNMFResult;
    assert.strictEqual(result.components, 1, "default component count should be 1");
    assert.strictEqual(result.bases.length, 1, "default should yield 1 basis");
    assert.strictEqual(result.activations.length, 1, "default should yield 1 activation");
  }, { after: [readWav] });

  wf.check("each-basis-is-non-empty", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
    }) as BufNMFResult;
    for (let i = 0; i < result.bases.length; i++) {
      assert.ok(result.bases[i].length > 0, `bases[${i}] should be non-empty`);
    }
  }, { after: [readWav] });

  wf.check("each-activation-is-non-empty", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
    }) as BufNMFResult;
    for (let i = 0; i < result.activations.length; i++) {
      assert.ok(result.activations[i].length > 0, `activations[${i}] should be non-empty`);
    }
  }, { after: [readWav] });

  wf.check("components-option-3-respected", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      options: { components: 3 },
    }) as BufNMFResult;
    assert.strictEqual(result.components, 3, "components:3 should be reflected in result");
    assert.strictEqual(result.bases.length, 3, "components:3 should yield 3 bases");
    assert.strictEqual(result.activations.length, 3, "components:3 should yield 3 activations");
  }, { after: [readWav] });

  wf.check("converged-is-boolean", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
    }) as BufNMFResult;
    assert.strictEqual(typeof result.converged, "boolean", "converged should be a boolean");
  }, { after: [readWav] });

  wf.check("iterations-is-positive", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
    }) as BufNMFResult;
    assert.ok(result.iterations > 0, `iterations should be positive, got ${result.iterations}`);
  }, { after: [readWav] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "result-has-bases-and-activations",
    "default-yields-1-component",
    "each-basis-is-non-empty",
    "each-activation-is-non-empty",
    "components-option-3-respected",
    "converged-is-boolean",
    "iterations-is-positive",
  ]});

  return wf.build();
}
