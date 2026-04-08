/**
 * Workflow: nmf-separation
 *
 * Tests the AnalysisService resynthesize IPC contract.
 * Corresponds to the IPC-testable subset of tests/nmf-separation.spec.ts.
 * (Database-backed sep command and derived sample storage are not covered here —
 * those require the full Electron + DatabaseManager stack.)
 *
 * The core analytical operation tested here is: given NMF bases + activations,
 * resynthesize individual components back to audio.
 *
 * Checks:
 *   - resynthesize() returns a non-empty componentAudio array
 *   - resynthesize() returns the same length for all components of the same decomposition
 *   - componentAudio values are finite numbers
 *   - different component indices produce different audio (components are distinct)
 *   - resynthesize() works for each valid component index
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
  nmfResult?: BufNMFResult;
}

export function buildWorkflow() {
  const wf = createWorkflow("nmf-separation");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-sep-"));
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

  const runNmf = wf.action("run-nmf", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const nmfResult = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      options: { components: 3 },
    }) as BufNMFResult;
    return { nmfResult };
  }, { after: [readWav] });

  // ---- Checks ---------------------------------------------------------------

  wf.check("component-audio-is-non-empty", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { componentAudio } = await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      bases: ctx.nmfResult!.bases,
      activations: ctx.nmfResult!.activations,
      componentIndex: 0,
    });
    assert.ok(componentAudio.length > 0, "resynthesized component should be non-empty");
  }, { after: [runNmf] });

  wf.check("all-components-same-length", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const lengths: number[] = [];
    for (let i = 0; i < ctx.nmfResult!.components; i++) {
      const { componentAudio } = await ctx.analysisClient.invoke("resynthesize", {
        audioData: ctx.channelData!,
        sampleRate: ctx.sampleRate!,
        bases: ctx.nmfResult!.bases,
        activations: ctx.nmfResult!.activations,
        componentIndex: i,
      });
      lengths.push(componentAudio.length);
    }
    for (let i = 1; i < lengths.length; i++) {
      assert.strictEqual(lengths[i], lengths[0], `component[${i}] length ${lengths[i]} !== component[0] length ${lengths[0]}`);
    }
  }, { after: [runNmf] });

  wf.check("component-audio-values-are-finite", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { componentAudio } = await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      bases: ctx.nmfResult!.bases,
      activations: ctx.nmfResult!.activations,
      componentIndex: 0,
    });
    const nonFinite = componentAudio.findIndex((v) => !isFinite(v));
    assert.strictEqual(nonFinite, -1, `component audio contains non-finite value at index ${nonFinite}`);
  }, { after: [runNmf] });

  wf.check("components-are-distinct", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const comp0 = (await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      bases: ctx.nmfResult!.bases,
      activations: ctx.nmfResult!.activations,
      componentIndex: 0,
    })).componentAudio;
    const comp1 = (await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      bases: ctx.nmfResult!.bases,
      activations: ctx.nmfResult!.activations,
      componentIndex: 1,
    })).componentAudio;
    const identical = comp0.every((v, i) => v === comp1[i]);
    assert.ok(!identical, "different component indices should produce different audio");
  }, { after: [runNmf] });

  wf.check("all-component-indices-succeed", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    for (let i = 0; i < ctx.nmfResult!.components; i++) {
      const { componentAudio } = await ctx.analysisClient.invoke("resynthesize", {
        audioData: ctx.channelData!,
        sampleRate: ctx.sampleRate!,
        bases: ctx.nmfResult!.bases,
        activations: ctx.nmfResult!.activations,
        componentIndex: i,
      });
      assert.ok(componentAudio.length > 0, `component[${i}] should be non-empty`);
    }
  }, { after: [runNmf] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "component-audio-is-non-empty",
    "all-components-same-length",
    "component-audio-values-are-finite",
    "components-are-distinct",
    "all-component-indices-succeed",
  ]});

  return wf.build();
}
