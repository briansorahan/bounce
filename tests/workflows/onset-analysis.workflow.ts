/**
 * Workflow: onset-analysis
 *
 * Tests the AnalysisService onsetSlice IPC contract.
 * Corresponds to the IPC-testable subset of tests/onset-analysis.spec.ts.
 * (Visualization and DOM assertions in that spec are renderer-only and not
 * covered here.)
 *
 * Checks:
 *   - onsetSlice() on transient-rich audio returns at least one onset
 *   - onset positions are non-negative
 *   - onset positions are in ascending order
 *   - onsetSlice() with a higher threshold returns fewer onsets
 *   - onsetSlice() on silent audio returns no onsets
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import type { WorkflowServices } from "./helpers";
import type { OnsetSliceResult } from "../../src/shared/rpc/analysis.rpc";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  tmpDir?: string;
  transientWavPath?: string;
  silentWavPath?: string;
  channelData?: number[];
  silentChannelData?: number[];
}

/**
 * Write a WAV with sharp impulse transients at regular intervals.
 * Each transient is a short decaying impulse followed by silence —
 * strongly activates onset detection regardless of threshold.
 */
function createTransientWav(filePath: string): void {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * 0.5);
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

  // Transient every 0.1s: sharp decay impulse, then silence.
  const period = Math.floor(sampleRate * 0.1);
  const impulseLen = 20;
  for (let i = 0; i < numSamples; i++) {
    const phase = i % period;
    const v = phase < impulseLen ? Math.floor(0.9 * 32767 * (1 - phase / impulseLen)) : 0;
    buf.writeInt16LE(v, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buf);
}

/** Write a fully silent WAV. */
function createSilentWav(filePath: string): void {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * 0.2);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize, 0);

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

  fs.writeFileSync(filePath, buf);
}

export function buildWorkflow() {
  const wf = createWorkflow("onset-analysis");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-onset-"));
    const transientWavPath = path.join(tmpDir, "transients.wav");
    const silentWavPath = path.join(tmpDir, "silent.wav");
    createTransientWav(transientWavPath);
    createSilentWav(silentWavPath);
    return { tmpDir, transientWavPath, silentWavPath };
  });

  const readTransient = wf.action("read-transient-wav", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.transientWavPath!,
    });
    return { channelData: result.channelData };
  }, { after: [setup] });

  const readSilent = wf.action("read-silent-wav", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.silentWavPath!,
    });
    return { silentChannelData: result.channelData };
  }, { after: [setup] });

  // ---- Checks: transient audio ----------------------------------------------

  wf.check("returns-at-least-one-onset", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("onsetSlice", {
      audioData: ctx.channelData!,
    }) as OnsetSliceResult;
    assert.ok(result.onsets.length > 0, "expected at least one onset in transient-rich audio");
  }, { after: [readTransient] });

  wf.check("onset-positions-are-non-negative", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("onsetSlice", {
      audioData: ctx.channelData!,
    }) as OnsetSliceResult;
    for (const onset of result.onsets) {
      assert.ok(onset >= 0, `onset position ${onset} should be non-negative`);
    }
  }, { after: [readTransient] });

  wf.check("onset-positions-are-ascending", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("onsetSlice", {
      audioData: ctx.channelData!,
    }) as OnsetSliceResult;
    for (let i = 1; i < result.onsets.length; i++) {
      assert.ok(
        result.onsets[i] > result.onsets[i - 1],
        `onset[${i}]=${result.onsets[i]} should be > onset[${i - 1}]=${result.onsets[i - 1]}`,
      );
    }
  }, { after: [readTransient] });

  wf.check("higher-threshold-returns-fewer-onsets", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const low = await ctx.analysisClient.invoke("onsetSlice", {
      audioData: ctx.channelData!,
      options: { threshold: 0.1 },
    }) as OnsetSliceResult;
    const high = await ctx.analysisClient.invoke("onsetSlice", {
      audioData: ctx.channelData!,
      options: { threshold: 0.9 },
    }) as OnsetSliceResult;
    assert.ok(
      high.onsets.length <= low.onsets.length,
      `high threshold (${high.onsets.length}) should yield ≤ onsets than low threshold (${low.onsets.length})`,
    );
  }, { after: [readTransient] });

  // ---- Checks: silent audio ------------------------------------------------

  wf.check("silent-audio-returns-no-onsets", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.analysisClient.invoke("onsetSlice", {
      audioData: ctx.silentChannelData!,
    }) as OnsetSliceResult;
    assert.strictEqual(result.onsets.length, 0, "silent audio should produce no onsets");
  }, { after: [readSilent] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "returns-at-least-one-onset",
    "onset-positions-are-non-negative",
    "onset-positions-are-ascending",
    "higher-threshold-returns-fewer-onsets",
    "silent-audio-returns-no-onsets",
  ]});

  return wf.build();
}
