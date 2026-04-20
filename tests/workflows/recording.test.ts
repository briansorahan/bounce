import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";

describe("recording", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let deviceIndex: number;
  let pcm: number[];
  let sampleRate: number;
  let channels: number;
  let duration: number;
  let storedHash: string;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("listAudioInputs returns devices", async () => {
    const result = await services.audioEngineClient.invoke("listAudioInputs", {});
    assert.ok(result.devices.length > 0, "Expected at least one audio input device");
    const first = result.devices[0];
    assert.ok(typeof first.index === "number", "device.index must be a number");
    assert.ok(typeof first.name === "string" && first.name.length > 0, "device.name must be a non-empty string");
    deviceIndex = first.index;
  });

  it("startRecording with first device", async () => {
    await services.audioEngineClient.invoke("startRecording", { deviceIndex, sampleRate: 44100 });
  });

  it("startRecording twice throws already-recording error", async () => {
    await assert.rejects(
      () => services.audioEngineClient.invoke("startRecording", { deviceIndex, sampleRate: 44100 }),
      /already recording/i,
    );
  });

  it("stopRecording returns PCM data", async () => {
    const result = await services.audioEngineClient.invoke("stopRecording", {});
    assert.ok(result.pcm.length > 0, "Expected non-empty PCM buffer from stopRecording");
    assert.ok(result.sampleRate > 0, "Expected positive sampleRate");
    assert.strictEqual(result.channels, 1, "Expected mono recording");
    assert.ok(result.duration > 0, "Expected positive duration");
    pcm = result.pcm;
    sampleRate = result.sampleRate;
    channels = result.channels;
    duration = result.duration;
  });

  it("storeRecording persists the sample", async () => {
    const result = await services.audioFileClient.invoke("storeRecording", {
      name: "my-recording",
      pcm,
      sampleRate,
      channels,
      duration,
      overwrite: false,
    });
    assert.strictEqual(result.status, "ok", "Expected status 'ok' on first store");
    assert.ok(typeof result.hash === "string" && result.hash.length > 0, "Expected a hash in the result");
    storedHash = result.hash;
  });

  it("getSampleByRecordingName finds the stored sample", async () => {
    const sample = await services.queryService.getSampleByRecordingName("my-recording");
    assert.ok(sample !== null, "Expected sample to be found by recording name");
    assert.strictEqual(sample!.hash, storedHash, "Hash mismatch between store result and query result");
  });

  it("storeRecording with overwrite:false returns 'exists' for duplicate name", async () => {
    const result = await services.audioFileClient.invoke("storeRecording", {
      name: "my-recording",
      pcm,
      sampleRate,
      channels,
      duration,
      overwrite: false,
    });
    assert.strictEqual(result.status, "exists");
  });

  it("storeRecording with overwrite:true replaces the existing sample", async () => {
    const result = await services.audioFileClient.invoke("storeRecording", {
      name: "my-recording",
      pcm,
      sampleRate,
      channels,
      duration,
      overwrite: true,
    });
    assert.strictEqual(result.status, "ok");
    assert.ok(typeof result.hash === "string" && result.hash.length > 0);
  });
});
