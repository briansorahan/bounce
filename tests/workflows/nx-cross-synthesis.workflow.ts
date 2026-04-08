/**
 * Workflow: nx-cross-synthesis
 *
 * Tests the AnalysisService bufNMFCross IPC contract with distinct source
 * and target audio — the real cross-synthesis use case.
 * Corresponds to the IPC-testable subset of tests/nx-cross-synthesis.spec.ts.
 *
 * The Playwright spec additionally verifies DB storage of the nmf-cross
 * feature and derived components. Those require DatabaseManager and are not
 * reproduced here.
 *
 * Two acoustically distinct WAVs are used:
 *   source — 440 Hz sine wave (pure tone)
 *   target — 880 Hz sine wave (different fundamental)
 *
 * Checks:
 *   - cross-synthesis of target with source dictionary returns valid result
 *   - result component count matches source NMF component count
 *   - cross-synthesis result can be used to resynthesize target components
 *   - target cross-synthesis activations differ from source-on-itself activations
 *   - resynthesized target component differs from resynthesized source component
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult, BufNMFCrossResult } from "../../src/shared/rpc/analysis.rpc";

const FFT_SIZE = 1024;
const COMPONENTS = 2;

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  sourceChannelData?: number[];
  targetChannelData?: number[];
  sampleRate?: number;
  sourceNmf?: BufNMFResult;
  crossOnSource?: BufNMFCrossResult;
  crossOnTarget?: BufNMFCrossResult;
}

function writeSineWav(filePath: string, frequencyHz: number, durationSeconds = 0.4): void {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buf.writeUInt16LE(bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const v = Math.floor(Math.sin(2 * Math.PI * frequencyHz * i / sampleRate) * 32767 * 0.8);
    buf.writeInt16LE(v, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buf);
}

export function buildWorkflow() {
  const wf = createWorkflow("nx-cross-synthesis");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-nxcross-"));
    writeSineWav(path.join(tmpDir, "source.wav"), 440);
    writeSineWav(path.join(tmpDir, "target.wav"), 880);
    return { tmpDir };
  });

  const readSource = wf.action("read-source", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: path.join(ctx.tmpDir!, "source.wav"),
    });
    return { sourceChannelData: result.channelData, sampleRate: result.sampleRate };
  }, { after: [setup] });

  const readTarget = wf.action("read-target", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: path.join(ctx.tmpDir!, "target.wav"),
    });
    return { targetChannelData: result.channelData };
  }, { after: [setup] });

  const runSourceNmf = wf.action("run-source-nmf", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sourceNmf = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.sourceChannelData!,
      sampleRate: ctx.sampleRate!,
      options: { components: COMPONENTS, iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFResult;
    return { sourceNmf };
  }, { after: [readSource] });

  // Cross-synthesis: source applied to itself (baseline)
  const crossOnSource = wf.action("cross-on-source", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const crossOnSource = await ctx.analysisClient.invoke("bufNMFCross", {
      targetAudioData: ctx.sourceChannelData!,
      sampleRate: ctx.sampleRate!,
      sourceBases: ctx.sourceNmf!.bases,
      sourceActivations: ctx.sourceNmf!.activations,
      options: { iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFCrossResult;
    return { crossOnSource };
  }, { after: [runSourceNmf] });

  // Cross-synthesis: source dictionary applied to target (the real use case)
  const crossOnTarget = wf.action("cross-on-target", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const crossOnTarget = await ctx.analysisClient.invoke("bufNMFCross", {
      targetAudioData: ctx.targetChannelData!,
      sampleRate: ctx.sampleRate!,
      sourceBases: ctx.sourceNmf!.bases,
      sourceActivations: ctx.sourceNmf!.activations,
      options: { iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFCrossResult;
    return { crossOnTarget };
  }, { after: [runSourceNmf, readTarget] });

  // ---- Checks ---------------------------------------------------------------

  wf.check("cross-on-target-has-valid-structure", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(Array.isArray(ctx.crossOnTarget!.bases), "bases should be an array");
    assert.ok(Array.isArray(ctx.crossOnTarget!.activations), "activations should be an array");
    assert.strictEqual(ctx.crossOnTarget!.components, COMPONENTS);
    assert.strictEqual(ctx.crossOnTarget!.bases.length, COMPONENTS);
    assert.strictEqual(ctx.crossOnTarget!.activations.length, COMPONENTS);
  }, { after: [crossOnTarget] });

  wf.check("target-activations-differ-from-source-activations", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const srcAct = ctx.crossOnSource!.activations[0];
    const tgtAct = ctx.crossOnTarget!.activations[0];
    const len = Math.min(srcAct.length, tgtAct.length);
    let diffCount = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(srcAct[i] - tgtAct[i]) > 1e-9) diffCount++;
    }
    assert.ok(diffCount > 0, "cross-synthesis of a different target should produce different activations");
  }, { after: [crossOnSource, crossOnTarget] });

  wf.check("can-resynthesize-target-component", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { componentAudio } = await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.targetChannelData!,
      sampleRate: ctx.sampleRate!,
      bases: ctx.crossOnTarget!.bases,
      activations: ctx.crossOnTarget!.activations,
      componentIndex: 0,
    });
    assert.ok(componentAudio.length > 0, "resynthesized target component should be non-empty");
    const nonFinite = componentAudio.findIndex((v) => !isFinite(v));
    assert.strictEqual(nonFinite, -1, "resynthesized target component should contain only finite values");
  }, { after: [crossOnTarget] });

  wf.check("target-component-differs-from-source-component", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const srcComp = (await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.sourceChannelData!,
      sampleRate: ctx.sampleRate!,
      bases: ctx.crossOnSource!.bases,
      activations: ctx.crossOnSource!.activations,
      componentIndex: 0,
    })).componentAudio;
    const tgtComp = (await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.targetChannelData!,
      sampleRate: ctx.sampleRate!,
      bases: ctx.crossOnTarget!.bases,
      activations: ctx.crossOnTarget!.activations,
      componentIndex: 0,
    })).componentAudio;
    const len = Math.min(srcComp.length, tgtComp.length);
    let diffCount = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(srcComp[i] - tgtComp[i]) > 1e-9) diffCount++;
    }
    assert.ok(diffCount > 0, "resynthesized target component should differ from resynthesized source component");
  }, { after: [crossOnSource, crossOnTarget] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "cross-on-target-has-valid-structure",
    "target-activations-differ-from-source-activations",
    "can-resynthesize-target-component",
    "target-component-differs-from-source-component",
  ]});

  return wf.build();
}
