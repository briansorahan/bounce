/**
 * Workflow: granular-instrument
 *
 * Tests instrument lifecycle (state management via instrumentClient) and
 * note routing (fire-and-forget via audioEngineClient).
 *
 * Terminal output checks (e.g. "Granular 'clouds'" in xterm-rows) are
 * renderer-dependent and remain in Playwright specs only.
 *
 * Checks:
 *   - createInstrument() is reflected in listInstruments()
 *   - two instruments appear after creating both
 *   - addInstrumentSample() is reflected in getInstrumentSamples()
 *   - instrumentNoteOn / instrumentNoteOff accept without error
 *   - deleteInstrument() removes from list
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
}

export function buildWorkflow() {
  const wf = createWorkflow("granular-instrument");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-granular-inst-"));
    const wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.2);
    return { tmpDir, wavPath };
  });

  const readWav = wf.action("read-wav", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: ctx.wavPath!,
    });
    return { sampleHash: result.hash };
  }, { after: [setup] });

  // ---- Instrument creation -------------------------------------------------

  const createSampler = wf.action("create-sampler", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.instrumentClient.invoke("createInstrument", {
      name: "drums",
      kind: "sampler",
      config: { polyphony: 4 },
    });
    return {};
  }, { after: [setup] });

  wf.check("sampler-in-list", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const instruments = await ctx.instrumentClient.invoke("listInstruments", {});
    const names = instruments.map((i) => i.name);
    assert.ok(names.includes("drums"), `Expected 'drums' in list, got: ${names.join(", ")}`);
  }, { after: [createSampler] });

  const createGranular = wf.action("create-granular", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.instrumentClient.invoke("createInstrument", {
      name: "pads",
      kind: "granular",
      config: { polyphony: 8 },
    });
    return {};
  }, { after: ["sampler-in-list"] });

  wf.check("both-instruments-in-list", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const instruments = await ctx.instrumentClient.invoke("listInstruments", {});
    const names = instruments.map((i) => i.name);
    assert.ok(names.includes("drums"), `Expected 'drums' in list`);
    assert.ok(names.includes("pads"), `Expected 'pads' in list`);
  }, { after: [createGranular] });

  // ---- Sample loading -------------------------------------------------------

  const addSample = wf.action("add-sample", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.instrumentClient.invoke("addInstrumentSample", {
      instrumentName: "drums",
      sampleHash: ctx.sampleHash!,
      noteNumber: 60,
    });
    return {};
  }, { after: [createSampler, readWav] });

  wf.check("sample-attached", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const samples = await ctx.instrumentClient.invoke("getInstrumentSamples", {
      instrumentName: "drums",
    });
    const hashes = samples.map((s) => s.sample_hash);
    assert.ok(
      hashes.includes(ctx.sampleHash!),
      `Expected ${ctx.sampleHash!.substring(0, 8)}... in instrument samples`,
    );
  }, { after: [addSample] });

  // ---- Note on/off routing -------------------------------------------------

  const noteOn = wf.action("note-on", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("instrumentNoteOn", {
      instrumentId: "drums",
      note: 60,
      velocity: 100,
    });
    return {};
  }, { after: ["sample-attached"] });

  wf.check("note-on-no-error", (_rawCtx) => {
    // If the action above did not throw, this check passes.
    assert.ok(true);
  }, { after: [noteOn] });

  const noteOff = wf.action("note-off", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioEngineClient.invoke("instrumentNoteOff", {
      instrumentId: "drums",
      note: 60,
    });
    return {};
  }, { after: [noteOn] });

  wf.check("note-off-no-error", (_rawCtx) => {
    assert.ok(true);
  }, { after: [noteOff] });

  // ---- Deletion ------------------------------------------------------------

  const deleteSampler = wf.action("delete-sampler", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.instrumentClient.invoke("deleteInstrument", { name: "drums" });
    return {};
  }, { after: [
    "note-on-no-error",
    "note-off-no-error",
    "sample-attached",
  ]});

  wf.check("sampler-deleted", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const instruments = await ctx.instrumentClient.invoke("listInstruments", {});
    const names = instruments.map((i) => i.name);
    assert.ok(!names.includes("drums"), "Expected 'drums' to be deleted");
    assert.ok(names.includes("pads"), "Expected 'pads' to still be present");
  }, { after: [deleteSampler] });

  // ---- Cleanup --------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    fs.rmSync(ctx.tmpDir!, { recursive: true, force: true });
  }, { after: [
    "sampler-in-list",
    "both-instruments-in-list",
    "sample-attached",
    "note-on-no-error",
    "note-off-no-error",
    "sampler-deleted",
  ]});

  return wf.build();
}
