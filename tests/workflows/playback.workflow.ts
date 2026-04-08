/**
 * Workflow: playback
 *
 * Tests the AudioEngine IPC contract for sample playback using
 * MockAudioEngineService. Verifies that play/stop/stopAll commands are
 * recorded and that the active-playback state is accurate.
 *
 * Real-time behavior (position advancement, ended telemetry) is inherently
 * asynchronous and is covered by Playwright specs only.
 *
 * Checks:
 *   - after play(), the sample hash appears in getPlaybackState
 *   - after stop(), the sample hash is removed from getPlaybackState
 *   - after playing two samples and calling stopAll(), active set is empty
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  wavPath?: string;
  sampleHash?: string;
  channelData?: number[];
  sampleRate?: number;
}

export function buildWorkflow() {
  const wf = createWorkflow("playback");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-playback-"));
    const wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.2);
    return { tmpDir, wavPath };
  });

  const readWav = wf.action("read-wav", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return { sampleHash: result.hash, channelData: result.channelData, sampleRate: result.sampleRate };
  }, { after: [setup] });

  // ---- Play / stop cycle ----------------------------------------------------

  const playSample = wf.action("play-sample", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("play", {
      sampleHash: ctx.sampleHash!,
      pcm: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      loop: false,
    });
    return {};
  }, { after: [readWav] });

  wf.check("sample-is-active-after-play", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { activeSampleHashes } = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      activeSampleHashes.includes(ctx.sampleHash!),
      `Expected ${ctx.sampleHash!.substring(0, 8)}... to be active`,
    );
  }, { after: [playSample] });

  const stopSample = wf.action("stop-sample", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("stop", { sampleHash: ctx.sampleHash! });
    return {};
  }, { after: ["sample-is-active-after-play"] });

  wf.check("sample-not-active-after-stop", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { activeSampleHashes } = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      !activeSampleHashes.includes(ctx.sampleHash!),
      `Expected ${ctx.sampleHash!.substring(0, 8)}... to no longer be active`,
    );
  }, { after: [stopSample] });

  // ---- stopAll clears all active playbacks ----------------------------------

  const playTwo = wf.action("play-two", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    // Play the same sample twice with different synthetic hashes to simulate two active playbacks.
    await ctx.audioEngineClient.invoke("play", {
      sampleHash: "mock-hash-a",
      pcm: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      loop: false,
    });
    await ctx.audioEngineClient.invoke("play", {
      sampleHash: "mock-hash-b",
      pcm: ctx.channelData!,
      sampleRate: ctx.sampleRate!,
      loop: false,
    });
    return {};
  }, { after: ["sample-not-active-after-stop"] });

  const stopAll = wf.action("stop-all", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("stopAll", {});
    return {};
  }, { after: [playTwo] });

  wf.check("stop-all-clears-active", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { activeSampleHashes } = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.strictEqual(activeSampleHashes.length, 0, "Expected no active playbacks after stopAll");
  }, { after: [stopAll] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "sample-is-active-after-play",
    "sample-not-active-after-stop",
    "stop-all-clears-active",
  ]});

  return wf.build();
}
