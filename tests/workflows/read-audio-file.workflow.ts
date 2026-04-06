/**
 * Workflow: read-audio-file
 *
 * Tests the core AudioFileService.readAudioFile IPC contract.
 * Corresponds to the IPC-testable subset of tests/commands.spec.ts and
 * tests/playback.spec.ts — specifically the "did the read operation succeed"
 * checks that do NOT require renderer DOM assertions.
 *
 * Checks:
 *   - Valid WAV file → hash is a 64-char hex SHA-256
 *   - Valid WAV file → sampleRate matches the WAV header
 *   - Valid WAV file → channelData is a non-empty number array
 *   - Valid WAV file → sample is stored and retrievable from StateService
 *   - Valid WAV file → sample appears in listSamples
 *   - Re-reading the same file → identical hash (deterministic)
 *   - File with no audio extension → BounceError SAMPLE_READ_FAILED
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav, createTextFile } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { ReadAudioFileResult } from "../../src/shared/rpc/audio-file.rpc";

// Typed context for this workflow.
interface Ctx extends WorkflowServices, Record<string, unknown> {
  testFilesDir?: string;
  wavPath?: string;
  txtPath?: string;
  firstRead?: ReadAudioFileResult;
  secondRead?: ReadAudioFileResult;
}

export function buildWorkflow() {
  const wf = createWorkflow("read-audio-file");

  // ---- Setup ----------------------------------------------------------------

  const createFiles = wf.action("create-test-files", async (ctx) => {
    const testFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-raf-"));
    const wavPath = path.join(testFilesDir, "test.wav");
    const txtPath = path.join(testFilesDir, "test.txt");
    createTestWav(wavPath, 0.2);
    createTextFile(txtPath);
    return { testFilesDir, wavPath, txtPath };
  });

  // ---- Actions --------------------------------------------------------------

  const readWav = wf.action("read-wav-file", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const firstRead = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return { firstRead };
  }, { after: [createFiles] });

  const readWavAgain = wf.action("read-wav-file-again", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const secondRead = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return { secondRead };
  }, { after: [readWav] });

  // ---- Checks: successful read ---------------------------------------------

  wf.check("hash-is-64-hex-chars", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.equal(typeof ctx.firstRead!.hash, "string", "hash should be a string");
    assert.equal(ctx.firstRead!.hash.length, 64, "SHA-256 hex should be 64 chars");
    assert.match(ctx.firstRead!.hash, /^[0-9a-f]+$/, "hash should be lowercase hex");
  }, { after: [readWav] });

  wf.check("sample-rate-is-44100", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.equal(ctx.firstRead!.sampleRate, 44100);
  }, { after: [readWav] });

  wf.check("channel-data-is-non-empty-array", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(Array.isArray(ctx.firstRead!.channelData), "channelData should be an array");
    assert.ok(ctx.firstRead!.channelData.length > 0, "channelData should be non-empty");
  }, { after: [readWav] });

  wf.check("file-path-is-set", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.equal(ctx.firstRead!.filePath, ctx.wavPath!);
  }, { after: [readWav] });

  // ---- Checks: persistence -------------------------------------------------

  wf.check("sample-stored-in-state-service", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sample = await ctx.stateClient.invoke("getSampleByHash", {
      hash: ctx.firstRead!.hash,
    });
    assert.ok(sample !== null, "sample should be stored in StateService");
    assert.equal(sample!.sample_rate, 44100);
    assert.equal(sample!.sample_type, "raw");
  }, { after: [readWav] });

  wf.check("sample-appears-in-list-samples", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const samples = await ctx.stateClient.invoke("listSamples", {});
    const found = samples.find((s) => s.hash === ctx.firstRead!.hash);
    assert.ok(found, "sample should appear in listSamples result");
  }, { after: [readWav] });

  // ---- Checks: idempotency -------------------------------------------------

  wf.check("re-reading-same-file-gives-identical-hash", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.equal(
      ctx.secondRead!.hash,
      ctx.firstRead!.hash,
      "hash should be deterministic for identical audio data",
    );
  }, { after: [readWavAgain] });

  // ---- Checks: error cases -------------------------------------------------

  wf.check("rejects-file-with-non-audio-extension", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await assert.rejects(
      ctx.audioFileClient.invoke("readAudioFile", {
        filePathOrHash: ctx.txtPath!,
      }),
      (err: Error) => {
        assert.ok(
          err.message.includes("Unsupported file format"),
          `Expected "Unsupported file format" but got: ${err.message}`,
        );
        return true;
      },
    );
  }, { after: [createFiles] });

  // ---- Cleanup -------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (ctx.testFilesDir) {
      fs.rmSync(ctx.testFilesDir, { recursive: true, force: true });
    }
    return {};
  }, {
    after: [
      "hash-is-64-hex-chars",
      "sample-rate-is-44100",
      "channel-data-is-non-empty-array",
      "file-path-is-set",
      "sample-stored-in-state-service",
      "sample-appears-in-list-samples",
      "re-reading-same-file-gives-identical-hash",
      "rejects-file-with-non-audio-extension",
    ],
  });

  return wf.build();
}
