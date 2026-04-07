/**
 * Workflow: instrument
 *
 * Tests the InstrumentService IPC contract (createInstrument, getInstrument,
 * listInstruments, deleteInstrument, addInstrumentSample, getInstrumentSamples).
 * No audio engine, no Electron.
 *
 * Corresponds to the non-audio-engine tests in tests/instrument.spec.ts.
 *
 * Checks:
 *   - listInstruments() on empty store returns []
 *   - createInstrument() returns a record with correct fields
 *   - getInstrument() retrieves the created record
 *   - listInstruments() reflects created instruments
 *   - createInstrument() with config persists config_json
 *   - addInstrumentSample() after reading a wav file
 *   - getInstrumentSamples() returns the added sample
 *   - addInstrumentSample() for unknown sample throws
 *   - deleteInstrument() returns true for existing instrument
 *   - deleteInstrument() returns false for nonexistent instrument
 *   - listInstruments() after delete reflects removal
 *   - getInstrument() after delete returns null
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { InstrumentRecord, InstrumentSampleRecord } from "../../src/shared/domain-types";

interface Ctx extends WorkflowServices, Record<string, unknown> {}

export function buildWorkflow() {
  const wf = createWorkflow("instrument");

  // ---- initial state --------------------------------------------------------

  wf.check("empty-list-returns-empty-array", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const instruments = await ctx.instrumentClient.invoke("listInstruments", {});
    assert.deepEqual(instruments, []);
  });

  // ---- create & read -------------------------------------------------------

  const createKeys = wf.action("create-sampler-keys", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const record = await ctx.instrumentClient.invoke("createInstrument", {
      name: "keys",
      kind: "sampler",
    });
    return { keysRecord: record };
  }, { after: ["empty-list-returns-empty-array"] });

  wf.check("create-returns-record-with-correct-name", (rawCtx) => {
    const ctx = rawCtx as Ctx & { keysRecord: InstrumentRecord };
    assert.equal(ctx.keysRecord.name, "keys");
  }, { after: [createKeys] });

  wf.check("create-returns-record-with-correct-kind", (rawCtx) => {
    const ctx = rawCtx as Ctx & { keysRecord: InstrumentRecord };
    assert.equal(ctx.keysRecord.kind, "sampler");
  }, { after: [createKeys] });

  wf.check("create-returns-record-with-numeric-id", (rawCtx) => {
    const ctx = rawCtx as Ctx & { keysRecord: InstrumentRecord };
    assert.ok(typeof ctx.keysRecord.id === "number" && ctx.keysRecord.id > 0);
  }, { after: [createKeys] });

  const getKeys = wf.action("get-keys-instrument", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const record = await ctx.instrumentClient.invoke("getInstrument", { name: "keys" });
    return { fetchedKeys: record };
  }, { after: [createKeys] });

  wf.check("get-returns-same-record", (rawCtx) => {
    const ctx = rawCtx as Ctx & { keysRecord: InstrumentRecord; fetchedKeys: InstrumentRecord | null };
    assert.ok(ctx.fetchedKeys !== null, "getInstrument should return a record");
    assert.equal(ctx.fetchedKeys!.id, ctx.keysRecord.id);
    assert.equal(ctx.fetchedKeys!.name, ctx.keysRecord.name);
  }, { after: [getKeys] });

  wf.check("get-nonexistent-returns-null", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const record = await ctx.instrumentClient.invoke("getInstrument", { name: "__no_such_instrument__" });
    assert.equal(record, null);
  });

  // ---- list ----------------------------------------------------------------

  const createDrums = wf.action("create-sampler-drums", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const record = await ctx.instrumentClient.invoke("createInstrument", {
      name: "drums",
      kind: "sampler",
    });
    return { drumsRecord: record };
  }, { after: [createKeys] });

  const listAfterCreate = wf.action("list-instruments-after-create", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const instruments = await ctx.instrumentClient.invoke("listInstruments", {});
    return { listedInstruments: instruments };
  }, { after: [createDrums] });

  wf.check("list-shows-both-instruments", (rawCtx) => {
    const ctx = rawCtx as Ctx & { listedInstruments: InstrumentRecord[] };
    const names = ctx.listedInstruments.map((i) => i.name);
    assert.ok(names.includes("keys"), `expected "keys" in ${JSON.stringify(names)}`);
    assert.ok(names.includes("drums"), `expected "drums" in ${JSON.stringify(names)}`);
  }, { after: [listAfterCreate] });

  // ---- config_json ---------------------------------------------------------

  const createWithConfig = wf.action("create-instrument-with-config", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const record = await ctx.instrumentClient.invoke("createInstrument", {
      name: "poly-pad",
      kind: "sampler",
      config: { polyphony: 4 },
    });
    return { polyPadRecord: record };
  }, { after: ["empty-list-returns-empty-array"] });

  wf.check("config-json-is-persisted", (rawCtx) => {
    const ctx = rawCtx as Ctx & { polyPadRecord: InstrumentRecord };
    assert.ok(ctx.polyPadRecord.config_json !== null, "config_json should not be null");
    const parsed = JSON.parse(ctx.polyPadRecord.config_json!);
    assert.equal(parsed.polyphony, 4);
  }, { after: [createWithConfig] });

  // ---- addInstrumentSample -------------------------------------------------

  const setupSample = wf.action("setup-wav-file", (_rawCtx) => {
    const wavPath = path.join(os.tmpdir(), "bounce-wf-inst-sample.wav");
    createTestWav(wavPath, 0.2);
    return Promise.resolve({ wavPath });
  });

  const readWav = wf.action("read-wav-for-instrument", async (rawCtx) => {
    const ctx = rawCtx as Ctx & { wavPath: string };
    const result = await ctx.audioFileClient.invoke("readAudioFile", { filePathOrHash: ctx.wavPath });
    return { sampleHash: result.hash };
  }, { after: [setupSample] });

  const addSample = wf.action("add-instrument-sample", async (rawCtx) => {
    const ctx = rawCtx as Ctx & { sampleHash: string };
    await ctx.instrumentClient.invoke("addInstrumentSample", {
      instrumentName: "keys",
      sampleHash: ctx.sampleHash,
      noteNumber: 60,
      loop: false,
    });
    return {};
  }, { after: [createKeys, readWav] });

  const getSamples = wf.action("get-instrument-samples", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const samples = await ctx.instrumentClient.invoke("getInstrumentSamples", { instrumentName: "keys" });
    return { instrumentSamples: samples };
  }, { after: [addSample] });

  wf.check("instrument-has-one-sample", (rawCtx) => {
    const ctx = rawCtx as Ctx & { instrumentSamples: InstrumentSampleRecord[] };
    assert.equal(ctx.instrumentSamples.length, 1, "should have exactly 1 sample");
  }, { after: [getSamples] });

  wf.check("sample-is-on-correct-note", (rawCtx) => {
    const ctx = rawCtx as Ctx & { instrumentSamples: InstrumentSampleRecord[] };
    assert.equal(ctx.instrumentSamples[0].note_number, 60);
  }, { after: [getSamples] });

  wf.check("sample-hash-matches", (rawCtx) => {
    const ctx = rawCtx as Ctx & { instrumentSamples: InstrumentSampleRecord[]; sampleHash: string };
    assert.equal(ctx.instrumentSamples[0].sample_hash, ctx.sampleHash);
  }, { after: [getSamples] });

  wf.check("add-sample-for-unknown-instrument-returns-empty", async (rawCtx) => {
    const ctx = rawCtx as Ctx & { sampleHash: string };
    // getInstrumentSamples for nonexistent returns []
    const samples = await ctx.instrumentClient.invoke("getInstrumentSamples", {
      instrumentName: "__no_such_instrument__",
    });
    assert.deepEqual(samples, []);
  }, { after: [readWav] });

  wf.check("add-sample-for-unknown-sample-hash-throws", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await assert.rejects(
      ctx.instrumentClient.invoke("addInstrumentSample", {
        instrumentName: "keys",
        sampleHash: "a".repeat(64),
        noteNumber: 60,
      }),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      },
    );
  }, { after: [createKeys] });

  // ---- delete --------------------------------------------------------------

  const deleteDrums = wf.action("delete-drums-instrument", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.instrumentClient.invoke("deleteInstrument", { name: "drums" });
    return { deleteResult: result };
  }, { after: [createDrums] });

  wf.check("delete-existing-returns-true", (rawCtx) => {
    const ctx = rawCtx as Ctx & { deleteResult: boolean };
    assert.equal(ctx.deleteResult, true);
  }, { after: [deleteDrums] });

  wf.check("delete-nonexistent-returns-false", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.instrumentClient.invoke("deleteInstrument", { name: "__ghost__" });
    assert.equal(result, false);
  });

  const listAfterDelete = wf.action("list-after-delete", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const instruments = await ctx.instrumentClient.invoke("listInstruments", {});
    return { listAfterDelete: instruments };
  }, { after: [deleteDrums] });

  wf.check("list-after-delete-excludes-drums", (rawCtx) => {
    const ctx = rawCtx as Ctx & { listAfterDelete: InstrumentRecord[] };
    const names = ctx.listAfterDelete.map((i) => i.name);
    assert.ok(!names.includes("drums"), `"drums" should be gone after delete`);
  }, { after: [listAfterDelete] });

  const getDeleted = wf.action("get-deleted-instrument", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const record = await ctx.instrumentClient.invoke("getInstrument", { name: "drums" });
    return { deletedRecord: record };
  }, { after: [deleteDrums] });

  wf.check("get-after-delete-returns-null", (rawCtx) => {
    const ctx = rawCtx as Ctx & { deletedRecord: InstrumentRecord | null };
    assert.equal(ctx.deletedRecord, null);
  }, { after: [getDeleted] });

  return wf.build();
}
