import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";

describe("transport-pattern", () => {
  let services: WorkflowServices;
  let cleanup: () => void;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("set-bpm-120", async () => {
    await services.audioEngineClient.invoke("setBpm", { bpm: 120 });
  });

  it("bpm-is-120", async () => {
    const { bpm } = await services.audioEngineClient.invoke("getBpm", {});
    assert.strictEqual(bpm, 120);
  });

  it("bpm-rejects-negative", async () => {
    let threw = false;
    try {
      await services.audioEngineClient.invoke("setBpm", { bpm: -1 });
    } catch {
      threw = true;
    }
    assert.ok(threw, "Expected setBpm(-1) to throw");
  });

  it("bpm-rejects-zero", async () => {
    let threw = false;
    try {
      await services.audioEngineClient.invoke("setBpm", { bpm: 0 });
    } catch {
      threw = true;
    }
    assert.ok(threw, "Expected setBpm(0) to throw");
  });

  it("bpm-rejects-too-large", async () => {
    let threw = false;
    try {
      await services.audioEngineClient.invoke("setBpm", { bpm: 401 });
    } catch {
      threw = true;
    }
    assert.ok(threw, "Expected setBpm(401) to throw");
  });

  it("transport-start", async () => {
    await services.audioEngineClient.invoke("transportStart", {});
  });

  it("transport-is-running", async () => {
    const { running } = await services.audioEngineClient.invoke("isTransportRunning", {});
    assert.strictEqual(running, true);
  });

  it("transport-stop", async () => {
    await services.audioEngineClient.invoke("transportStop", {});
  });

  it("transport-not-running", async () => {
    const { running } = await services.audioEngineClient.invoke("isTransportRunning", {});
    assert.strictEqual(running, false);
  });

  it("set-bpm-240", async () => {
    await services.audioEngineClient.invoke("setBpm", { bpm: 240 });
  });

  it("bpm-is-240", async () => {
    const { bpm } = await services.audioEngineClient.invoke("getBpm", {});
    assert.strictEqual(bpm, 240);
  });

  it("set-pattern", async () => {
    const stepsJson = JSON.stringify([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    await services.audioEngineClient.invoke("setPattern", { channelIndex: 0, stepsJson });
  });

  it("pattern-stored", async () => {
    const stepsJson = JSON.stringify([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    const result = await services.audioEngineClient.invoke("getPattern", { channelIndex: 0 });
    assert.ok(result.stepsJson !== null, "Expected pattern to be stored");
    assert.strictEqual(result.stepsJson, stepsJson);
  });

  it("clear-pattern", async () => {
    await services.audioEngineClient.invoke("clearPattern", { channelIndex: 0 });
  });

  it("pattern-cleared", async () => {
    const result = await services.audioEngineClient.invoke("getPattern", { channelIndex: 0 });
    assert.strictEqual(result.stepsJson, null, "Expected pattern to be cleared");
  });
});
