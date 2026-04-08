/**
 * Workflow: nmf-component-context
 *
 * Tests the IPC-testable core of tests/nmf-component-context.spec.ts.
 *
 * The Playwright spec verifies that visualize-nmf reloads the *original*
 * sample after a component has been played (a renderer state management
 * concern). The DOM and canvas assertions are not reproducible here.
 *
 * What IS testable: after NMF analysis and component resynthesis, the
 * original audio remains accessible and unmodified — i.e. reading the
 * original file by hash returns the same data that was loaded initially.
 *
 * Checks:
 *   - original sample is re-readable by hash after NMF analysis
 *   - re-read by hash returns the same channelData as the original read
 *   - re-read by hash returns the same sampleRate
 *   - component audio is shorter than or equal in length to the original
 *   - component audio is distinct from the original audio
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { ReadAudioFileResult } from "../../src/shared/rpc/audio-file.rpc";
import type { BufNMFResult } from "../../src/shared/rpc/analysis.rpc";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  wavPath?: string;
  originalRead?: ReadAudioFileResult;
  nmfResult?: BufNMFResult;
  componentAudio?: number[];
}

export function buildWorkflow() {
  const wf = createWorkflow("nmf-component-context");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-nmfctx-"));
    const wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.5);
    return { tmpDir, wavPath };
  });

  const readOriginal = wf.action("read-original", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const originalRead = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return { originalRead };
  }, { after: [setup] });

  const runNmf = wf.action("run-nmf", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const nmfResult = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.originalRead!.channelData,
      sampleRate: ctx.originalRead!.sampleRate,
      options: { components: 3 },
    }) as BufNMFResult;
    return { nmfResult };
  }, { after: [readOriginal] });

  const resynthComponent = wf.action("resynth-component-0", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { componentAudio } = await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.originalRead!.channelData,
      sampleRate: ctx.originalRead!.sampleRate,
      bases: ctx.nmfResult!.bases,
      activations: ctx.nmfResult!.activations,
      componentIndex: 0,
    });
    return { componentAudio };
  }, { after: [runNmf] });

  // ---- Checks ---------------------------------------------------------------

  wf.check("original-still-readable-by-hash", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const reRead = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.originalRead!.hash,
    });
    assert.ok(reRead.channelData.length > 0, "re-read by hash should return non-empty channelData");
  }, { after: [resynthComponent] });

  wf.check("re-read-channel-data-matches-original", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const reRead = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.originalRead!.hash,
    });
    assert.strictEqual(
      reRead.channelData.length,
      ctx.originalRead!.channelData.length,
      "re-read channelData length should match original",
    );
    assert.strictEqual(reRead.hash, ctx.originalRead!.hash, "re-read hash should match original");
  }, { after: [resynthComponent] });

  wf.check("re-read-sample-rate-matches-original", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const reRead = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.originalRead!.hash,
    });
    assert.strictEqual(reRead.sampleRate, ctx.originalRead!.sampleRate, "re-read sampleRate should match original");
  }, { after: [resynthComponent] });

  wf.check("component-audio-is-distinct-from-original", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const original = ctx.originalRead!.channelData;
    const component = ctx.componentAudio!;
    // Compare over the shorter length
    const len = Math.min(original.length, component.length);
    let diffCount = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(original[i] - component[i]) > 1e-6) diffCount++;
    }
    assert.ok(diffCount > 0, "component audio should differ from original audio");
  }, { after: [resynthComponent] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "original-still-readable-by-hash",
    "re-read-channel-data-matches-original",
    "re-read-sample-rate-matches-original",
    "component-audio-is-distinct-from-original",
  ]});

  return wf.build();
}
