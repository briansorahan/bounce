/**
 * Workflow: play-component-then-play-full
 *
 * Tests that the audio engine correctly tracks multiple concurrent playbacks
 * when switching between NMF component audio and the original full sample.
 *
 * This covers the service-layer behaviour exercised by the Playwright test
 * tests/play-component-then-play-full.spec.ts. The renderer-level concern
 * (sn.current() returning the original hash) is renderer-bound and remains
 * tested by the Playwright spec.
 *
 * Steps:
 *   1. Create and read a WAV file
 *   2. Run NMF decomposition (bufNMF, 3 components)
 *   3. Resynthesize component 1 → componentAudio
 *   4. Play component audio under a derived hash
 *   5. Verify component hash is active in the engine
 *   6. Play full sample audio under the original hash
 *   7. Verify both hashes are concurrently active
 *   8. Stop component; verify only the original hash remains active
 *
 * Checks:
 *   - resynthesize() returns non-empty audio for component 1
 *   - after playing component audio, its hash is active
 *   - after playing full audio, the original hash is also active
 *   - both component and full can be active simultaneously
 *   - stopping the component leaves the full sample active
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult } from "../../src/shared/rpc/analysis.rpc";

const COMPONENT_INDEX = 1;

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  wavPath?: string;
  sampleHash?: string;
  componentHash?: string;
  channelData?: number[];
  sampleRate?: number;
  nmfResult?: BufNMFResult;
  componentAudio?: number[];
}

export function buildWorkflow() {
  const wf = createWorkflow("play-component-then-play-full");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-play-comp-"));
    const wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.5);
    return { tmpDir, wavPath };
  });

  const readWav = wf.action("read-wav", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return {
      sampleHash: result.hash,
      channelData: result.channelData,
      sampleRate: result.sampleRate,
    };
  }, { after: [setup] });

  // ---- NMF decomposition ---------------------------------------------------

  const runNmf = wf.action("run-nmf", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const nmfResult = await ctx.analysisClient.invoke("bufNMF", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      options: { components: 3 },
    }) as BufNMFResult;
    return { nmfResult };
  }, { after: [readWav] });

  // ---- Resynthesize component ----------------------------------------------

  const resynthComponent = wf.action("resynthesize-component", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { componentAudio } = await ctx.analysisClient.invoke("resynthesize", {
      audioData: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      bases: ctx.nmfResult!.bases,
      activations: ctx.nmfResult!.activations,
      componentIndex: COMPONENT_INDEX,
    });
    // Derive a stable component hash from the original sample hash.
    const componentHash = `${ctx.sampleHash!}:component:${COMPONENT_INDEX}`;
    return { componentAudio, componentHash };
  }, { after: [runNmf] });

  wf.check("component-audio-is-non-empty", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(ctx.componentAudio!.length > 0, "resynthesized component audio should be non-empty");
  }, { after: [resynthComponent] });

  // ---- Play component audio ------------------------------------------------

  const playComponent = wf.action("play-component", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("play", {
      sampleHash: ctx.componentHash!,
      pcm: ctx.componentAudio!,
      sampleRate: ctx.sampleRate!,
      loop: false,
    });
    return {};
  }, { after: [resynthComponent] });

  wf.check("component-hash-is-active-after-play", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      state.activeSampleHashes.includes(ctx.componentHash!),
      `expected component hash ${ctx.componentHash} in active playbacks`,
    );
  }, { after: [playComponent] });

  // ---- Play full sample ----------------------------------------------------

  const playFull = wf.action("play-full", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("play", {
      sampleHash: ctx.sampleHash!,
      pcm: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      loop: false,
    });
    return {};
  }, { after: [playComponent] });

  wf.check("full-sample-hash-is-active-after-play", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      state.activeSampleHashes.includes(ctx.sampleHash!),
      `expected original hash ${ctx.sampleHash} in active playbacks after playing full sample`,
    );
  }, { after: [playFull] });

  wf.check("both-hashes-active-simultaneously", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      state.activeSampleHashes.includes(ctx.componentHash!),
      `expected component hash ${ctx.componentHash} to still be active`,
    );
    assert.ok(
      state.activeSampleHashes.includes(ctx.sampleHash!),
      `expected original hash ${ctx.sampleHash} to be active`,
    );
  }, { after: [playFull] });

  // ---- Stop component; full should remain active ---------------------------

  const stopComponent = wf.action("stop-component", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("stop", { sampleHash: ctx.componentHash! });
    return {};
  }, { after: [playFull] });

  wf.check("full-sample-still-active-after-stopping-component", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      !state.activeSampleHashes.includes(ctx.componentHash!),
      "component hash should be gone after stop()",
    );
    assert.ok(
      state.activeSampleHashes.includes(ctx.sampleHash!),
      `original hash ${ctx.sampleHash} should still be active after stopping the component`,
    );
  }, { after: [stopComponent] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (ctx.tmpDir) fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
    return {};
  }, { after: [stopComponent] });

  return wf.build();
}
