/**
 * Workflow: recording
 *
 * Tests the native-audio-engine-backed recording pipeline at the service layer:
 *   listAudioInputs  — returns available capture devices from the mock engine
 *   startRecording   — opens a capture device
 *   stopRecording    — stops capture and returns raw PCM
 *   storeRecording   — persists PCM as a named sample in the store
 *   getSampleByRecordingName — retrieves the stored sample by name
 *
 * All engine calls go through MockAudioEngineService (pure TypeScript, no
 * native addon). All persistence goes through InMemoryStore via AudioFileService.
 *
 * Checks:
 *   - listAudioInputs returns at least one device with index and name
 *   - startRecording with a valid device index succeeds
 *   - startRecording twice throws "already recording"
 *   - stopRecording returns non-empty PCM and metadata
 *   - storeRecording with the returned PCM creates a sample with status "ok"
 *   - getSampleByRecordingName finds the stored sample by name
 *   - storeRecording with the same name and overwrite:false returns "exists"
 *   - storeRecording with overwrite:true replaces the sample
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
import type { WorkflowServices } from "./helpers";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  deviceIndex?: number;
  pcm?: number[];
  sampleRate?: number;
  channels?: number;
  duration?: number;
  storedHash?: string;
}

export function buildWorkflow() {
  const wf = createWorkflow("recording");

  // ---- List audio inputs ---------------------------------------------------

  const listInputs = wf.action("listAudioInputs returns devices", async (ctx: Ctx) => {
    const result = await ctx.audioEngineClient.invoke("listAudioInputs", {});
    assert.ok(result.devices.length > 0, "Expected at least one audio input device");
    const first = result.devices[0];
    assert.ok(typeof first.index === "number", "device.index must be a number");
    assert.ok(typeof first.name === "string" && first.name.length > 0, "device.name must be a non-empty string");
    return { deviceIndex: first.index };
  });

  // ---- Start recording -----------------------------------------------------

  const startRec = wf.action(
    "startRecording with first device",
    async (ctx: Ctx) => {
      await ctx.audioEngineClient.invoke("startRecording", { deviceIndex: ctx.deviceIndex!, sampleRate: 44100 });
      return {};
    },
    { after: [listInputs] },
  );

  wf.check(
    "startRecording twice throws already-recording error",
    async (ctx: Ctx) => {
      await assert.rejects(
        () => ctx.audioEngineClient.invoke("startRecording", { deviceIndex: ctx.deviceIndex!, sampleRate: 44100 }),
        /already recording/i,
      );
    },
    { after: [startRec] },
  );

  // ---- Stop recording ------------------------------------------------------

  const stopRec = wf.action(
    "stopRecording returns PCM data",
    async (ctx: Ctx) => {
      const result = await ctx.audioEngineClient.invoke("stopRecording", {});
      assert.ok(result.pcm.length > 0, "Expected non-empty PCM buffer from stopRecording");
      assert.ok(result.sampleRate > 0, "Expected positive sampleRate");
      assert.strictEqual(result.channels, 1, "Expected mono recording");
      assert.ok(result.duration > 0, "Expected positive duration");
      return {
        pcm: result.pcm,
        sampleRate: result.sampleRate,
        channels: result.channels,
        duration: result.duration,
      };
    },
    { after: [startRec] },
  );

  // ---- Store recording via AudioFileService --------------------------------

  const storeRec = wf.action(
    "storeRecording persists the sample",
    async (ctx: Ctx) => {
      const result = await ctx.audioFileClient.invoke("storeRecording", {
        name: "my-recording",
        pcm: ctx.pcm!,
        sampleRate: ctx.sampleRate!,
        channels: ctx.channels!,
        duration: ctx.duration!,
        overwrite: false,
      });
      assert.strictEqual(result.status, "ok", "Expected status 'ok' on first store");
      assert.ok(typeof result.hash === "string" && result.hash.length > 0, "Expected a hash in the result");
      return { storedHash: result.hash };
    },
    { after: [stopRec] },
  );

  // ---- Query stored sample -------------------------------------------------

  wf.check(
    "getSampleByRecordingName finds the stored sample",
    async (ctx: Ctx) => {
      const sample = await ctx.queryService.getSampleByRecordingName("my-recording");
      assert.ok(sample !== null, "Expected sample to be found by recording name");
      assert.strictEqual(sample!.hash, ctx.storedHash, "Hash mismatch between store result and query result");
    },
    { after: [storeRec] },
  );

  // ---- Overwrite behaviour -------------------------------------------------

  wf.check(
    "storeRecording with overwrite:false returns 'exists' for duplicate name",
    async (ctx: Ctx) => {
      const result = await ctx.audioFileClient.invoke("storeRecording", {
        name: "my-recording",
        pcm: ctx.pcm!,
        sampleRate: ctx.sampleRate!,
        channels: ctx.channels!,
        duration: ctx.duration!,
        overwrite: false,
      });
      assert.strictEqual(result.status, "exists");
    },
    { after: [storeRec] },
  );

  wf.check(
    "storeRecording with overwrite:true replaces the existing sample",
    async (ctx: Ctx) => {
      const result = await ctx.audioFileClient.invoke("storeRecording", {
        name: "my-recording",
        pcm: ctx.pcm!,
        sampleRate: ctx.sampleRate!,
        channels: ctx.channels!,
        duration: ctx.duration!,
        overwrite: true,
      });
      assert.strictEqual(result.status, "ok");
      assert.ok(typeof result.hash === "string" && result.hash.length > 0);
    },
    { after: [storeRec] },
  );

  return wf.build();
}
