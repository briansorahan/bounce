/**
 * Workflow: transport-pattern
 *
 * Tests the AudioEngine transport and pattern commands via MockAudioEngineService.
 *
 * Real-time behavior (transport tick telemetry) is covered by Playwright specs only.
 *
 * Checks:
 *   - setBpm/getBpm round-trip
 *   - setBpm rejects out-of-range values
 *   - transportStart/Stop state transitions
 *   - setPattern/clearPattern round-trip
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
import type { WorkflowServices } from "./helpers";

type Ctx = WorkflowServices & Record<string, unknown>;

export function buildWorkflow() {
  const wf = createWorkflow("transport-pattern");

  // ---- BPM get/set ---------------------------------------------------------

  const setBpm120 = wf.action("set-bpm-120", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("setBpm", { bpm: 120 });
    return {};
  });

  wf.check("bpm-is-120", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { bpm } = await ctx.audioEngineClient.invoke("getBpm", {});
    assert.strictEqual(bpm, 120);
  }, { after: [setBpm120] });

  const setBpm240 = wf.action("set-bpm-240", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("setBpm", { bpm: 240 });
    return {};
  }, { after: ["bpm-is-120"] });

  wf.check("bpm-is-240", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { bpm } = await ctx.audioEngineClient.invoke("getBpm", {});
    assert.strictEqual(bpm, 240);
  }, { after: [setBpm240] });

  // ---- BPM range validation ------------------------------------------------

  wf.check("bpm-rejects-negative", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    let threw = false;
    try {
      await ctx.audioEngineClient.invoke("setBpm", { bpm: -1 });
    } catch {
      threw = true;
    }
    assert.ok(threw, "Expected setBpm(-1) to throw");
  }, { after: ["bpm-is-120"] });

  wf.check("bpm-rejects-zero", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    let threw = false;
    try {
      await ctx.audioEngineClient.invoke("setBpm", { bpm: 0 });
    } catch {
      threw = true;
    }
    assert.ok(threw, "Expected setBpm(0) to throw");
  }, { after: ["bpm-is-120"] });

  wf.check("bpm-rejects-too-large", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    let threw = false;
    try {
      await ctx.audioEngineClient.invoke("setBpm", { bpm: 401 });
    } catch {
      threw = true;
    }
    assert.ok(threw, "Expected setBpm(401) to throw");
  }, { after: ["bpm-is-120"] });

  // ---- Transport start/stop ------------------------------------------------

  const transportStart = wf.action("transport-start", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("transportStart", {});
    return {};
  }, { after: ["bpm-is-120"] });

  wf.check("transport-is-running", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { running } = await ctx.audioEngineClient.invoke("isTransportRunning", {});
    assert.strictEqual(running, true);
  }, { after: [transportStart] });

  const transportStop = wf.action("transport-stop", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("transportStop", {});
    return {};
  }, { after: ["transport-is-running"] });

  wf.check("transport-not-running", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const { running } = await ctx.audioEngineClient.invoke("isTransportRunning", {});
    assert.strictEqual(running, false);
  }, { after: [transportStop] });

  // ---- Pattern set/clear ---------------------------------------------------

  const stepsJson = JSON.stringify([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);

  const setPattern = wf.action("set-pattern", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("setPattern", { channelIndex: 0, stepsJson });
    return {};
  }, { after: ["transport-not-running"] });

  wf.check("pattern-stored", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioEngineClient.invoke("getPattern", { channelIndex: 0 });
    assert.ok(result.stepsJson !== null, "Expected pattern to be stored");
    assert.strictEqual(result.stepsJson, stepsJson);
  }, { after: [setPattern] });

  const clearPattern = wf.action("clear-pattern", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("clearPattern", { channelIndex: 0 });
    return {};
  }, { after: ["pattern-stored"] });

  wf.check("pattern-cleared", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioEngineClient.invoke("getPattern", { channelIndex: 0 });
    assert.strictEqual(result.stepsJson, null, "Expected pattern to be cleared");
  }, { after: [clearPattern] });

  return wf.build();
}
