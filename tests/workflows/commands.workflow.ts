/**
 * Workflow: commands
 *
 * Tests the service-layer behaviour behind key REPL audio commands:
 *   sn.read()  — load a WAV file; reject a non-audio file
 *   samp.play() — play a sample through the audio engine
 *   samp.stop() — stop a playing sample
 *
 * REPL-only commands (help(), clear()) are renderer-bound and are not covered
 * here; they remain tested by tests/commands.spec.ts.
 *
 * Corresponds to the IPC-testable subset of tests/commands.spec.ts.
 *
 * Checks:
 *   - readAudioFile() on a valid WAV returns a hash, channelData, and sampleRate
 *   - readAudioFile() on a non-audio file throws with UNSUPPORTED_FORMAT code
 *   - after play(), the sample hash appears in getPlaybackState
 *   - after stop(), the sample hash is removed from getPlaybackState
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav, createTextFile } from "./helpers";
import type { WorkflowServices } from "./helpers";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  wavPath?: string;
  textPath?: string;
  sampleHash?: string;
  channelData?: number[];
  sampleRate?: number;
}

export function buildWorkflow() {
  const wf = createWorkflow("commands");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-commands-"));
    const wavPath = path.join(tmpDir, "test.wav");
    const textPath = path.join(tmpDir, "not-audio.txt");
    createTestWav(wavPath, 0.2);
    createTextFile(textPath);
    return { tmpDir, wavPath, textPath };
  });

  // ---- sn.read: valid WAV --------------------------------------------------

  const readWav = wf.action("read-valid-wav", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return { sampleHash: result.hash, channelData: result.channelData, sampleRate: result.sampleRate };
  }, { after: [setup] });

  wf.check("read-wav-returns-hash", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(typeof ctx.sampleHash === "string" && ctx.sampleHash.length > 0, "hash should be a non-empty string");
  }, { after: [readWav] });

  wf.check("read-wav-returns-channel-data", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(Array.isArray(ctx.channelData) && ctx.channelData.length > 0, "channelData should be a non-empty array");
  }, { after: [readWav] });

  wf.check("read-wav-returns-sample-rate", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(typeof ctx.sampleRate === "number" && ctx.sampleRate > 0, "sampleRate should be a positive number");
  }, { after: [readWav] });

  // ---- sn.read: non-audio rejection ----------------------------------------

  wf.check("read-non-audio-file-throws", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    let threw = false;
    try {
      await ctx.audioFileClient.invoke("readAudioFile", {
        filePathOrHash: ctx.textPath!,
      });
    } catch (err) {
      threw = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert.ok(
        msg.toLowerCase().includes("unsupported"),
        `expected "unsupported" in error message, got: ${msg}`,
      );
    }
    assert.ok(threw, "expected readAudioFile to throw for a non-audio file");
  }, { after: [setup] });

  // ---- samp.play() ---------------------------------------------------------

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

  wf.check("play-adds-hash-to-active-playbacks", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      state.activeSampleHashes.includes(ctx.sampleHash!),
      `expected ${ctx.sampleHash} in active playbacks after play()`,
    );
  }, { after: [playSample] });

  // ---- samp.stop() ---------------------------------------------------------

  const stopSample = wf.action("stop-sample", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("stop", { sampleHash: ctx.sampleHash! });
    return {};
  }, { after: [playSample] });

  wf.check("stop-removes-hash-from-active-playbacks", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.audioEngineClient.invoke("getPlaybackState", {});
    assert.ok(
      !state.activeSampleHashes.includes(ctx.sampleHash!),
      `expected ${ctx.sampleHash} to be absent from active playbacks after stop()`,
    );
  }, { after: [stopSample] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (ctx.tmpDir) fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
    return {};
  }, { after: [stopSample] });

  return wf.build();
}
