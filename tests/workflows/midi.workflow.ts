/**
 * Workflow: midi
 *
 * Tests the MidiService IPC contract (saveMidiSequence, listMidiSequences,
 * getMidiSequence, deleteMidiSequence).
 * No audio hardware, no native MIDI, no Electron.
 *
 * Corresponds to the persistence/retrieval tests in tests/midi.spec.ts
 * (devices, record, play require hardware and are not covered here).
 *
 * Checks:
 *   - listMidiSequences() on empty store returns []
 *   - saveMidiSequence() returns a record with correct fields
 *   - listMidiSequences() shows the saved sequence
 *   - getMidiSequence() returns record + events
 *   - getMidiSequence() for unknown name returns null
 *   - saveMidiSequence() with the same name overwrites (upsert)
 *   - deleteMidiSequence() removes the sequence
 *   - listMidiSequences() after delete returns []
 *   - getMidiSequence() after delete returns null
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
import type { WorkflowServices } from "./helpers";
import type { MidiEvent, MidiSequenceRecord } from "../../src/shared/ipc-contract";

interface Ctx extends WorkflowServices, Record<string, unknown> {}

const NOTE_ON:  MidiEvent = { type: "note_on",  channel: 0, note: 60, velocity: 0.63, timestampMs: 0 };
const NOTE_OFF: MidiEvent = { type: "note_off", channel: 0, note: 60, velocity: 0,    timestampMs: 100 };

export function buildWorkflow() {
  const wf = createWorkflow("midi");

  // ---- initial state -------------------------------------------------------

  wf.check("empty-store-returns-empty-list", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sequences = await ctx.midiClient.invoke("listMidiSequences", {});
    assert.deepEqual(sequences, []);
  });

  wf.check("get-unknown-sequence-returns-null", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.midiClient.invoke("getMidiSequence", { name: "__no_such_seq__" });
    assert.equal(result, null);
  });

  // ---- save & retrieve -----------------------------------------------------

  const saveSeq = wf.action("save-midi-sequence", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const record = await ctx.midiClient.invoke("saveMidiSequence", {
      name: "my-seq",
      events: [NOTE_ON, NOTE_OFF],
      durationMs: 200,
    });
    return { savedRecord: record };
  }, { after: ["empty-store-returns-empty-list"] });

  wf.check("save-returns-record-with-correct-name", (rawCtx) => {
    const ctx = rawCtx as Ctx & { savedRecord: MidiSequenceRecord };
    assert.equal(ctx.savedRecord.name, "my-seq");
  }, { after: [saveSeq] });

  wf.check("save-returns-correct-event-count", (rawCtx) => {
    const ctx = rawCtx as Ctx & { savedRecord: MidiSequenceRecord };
    assert.equal(ctx.savedRecord.event_count, 2);
  }, { after: [saveSeq] });

  wf.check("save-returns-correct-duration", (rawCtx) => {
    const ctx = rawCtx as Ctx & { savedRecord: MidiSequenceRecord };
    assert.equal(ctx.savedRecord.duration_ms, 200);
  }, { after: [saveSeq] });

  wf.check("save-returns-numeric-id", (rawCtx) => {
    const ctx = rawCtx as Ctx & { savedRecord: MidiSequenceRecord };
    assert.ok(typeof ctx.savedRecord.id === "number" && ctx.savedRecord.id > 0);
  }, { after: [saveSeq] });

  const listAfterSave = wf.action("list-after-save", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sequences = await ctx.midiClient.invoke("listMidiSequences", {});
    return { listAfterSave: sequences };
  }, { after: [saveSeq] });

  wf.check("list-shows-saved-sequence", (rawCtx) => {
    const ctx = rawCtx as Ctx & { listAfterSave: MidiSequenceRecord[] };
    assert.equal(ctx.listAfterSave.length, 1);
    assert.equal(ctx.listAfterSave[0].name, "my-seq");
  }, { after: [listAfterSave] });

  const getSeq = wf.action("get-midi-sequence", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.midiClient.invoke("getMidiSequence", { name: "my-seq" });
    return { fetchedSeq: result };
  }, { after: [saveSeq] });

  wf.check("get-returns-record", (rawCtx) => {
    const ctx = rawCtx as Ctx & { fetchedSeq: { record: MidiSequenceRecord; events: MidiEvent[] } | null };
    assert.ok(ctx.fetchedSeq !== null, "getMidiSequence should return a result");
    assert.equal(ctx.fetchedSeq!.record.name, "my-seq");
  }, { after: [getSeq] });

  wf.check("get-returns-events", (rawCtx) => {
    const ctx = rawCtx as Ctx & { fetchedSeq: { record: MidiSequenceRecord; events: MidiEvent[] } | null };
    assert.equal(ctx.fetchedSeq!.events.length, 2);
    assert.equal(ctx.fetchedSeq!.events[0].type, "note_on");
    assert.equal(ctx.fetchedSeq!.events[1].type, "note_off");
  }, { after: [getSeq] });

  // ---- upsert (overwrite with same name) -----------------------------------

  const overwriteSeq = wf.action("overwrite-midi-sequence", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const record = await ctx.midiClient.invoke("saveMidiSequence", {
      name: "my-seq",
      events: [NOTE_ON],
      durationMs: 50,
    });
    return { overwrittenRecord: record };
  }, { after: [saveSeq] });

  wf.check("overwrite-preserves-id", (rawCtx) => {
    const ctx = rawCtx as Ctx & { savedRecord: MidiSequenceRecord; overwrittenRecord: MidiSequenceRecord };
    assert.equal(ctx.overwrittenRecord.id, ctx.savedRecord.id);
  }, { after: [overwriteSeq] });

  wf.check("overwrite-updates-event-count", (rawCtx) => {
    const ctx = rawCtx as Ctx & { overwrittenRecord: MidiSequenceRecord };
    assert.equal(ctx.overwrittenRecord.event_count, 1);
  }, { after: [overwriteSeq] });

  wf.check("overwrite-updates-duration", (rawCtx) => {
    const ctx = rawCtx as Ctx & { overwrittenRecord: MidiSequenceRecord };
    assert.equal(ctx.overwrittenRecord.duration_ms, 50);
  }, { after: [overwriteSeq] });

  // ---- multiple sequences --------------------------------------------------

  const saveSecond = wf.action("save-second-sequence", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.midiClient.invoke("saveMidiSequence", {
      name: "second-seq",
      events: [NOTE_ON, NOTE_OFF, NOTE_ON],
      durationMs: 400,
    });
    return {};
  }, { after: [saveSeq] });

  const listTwo = wf.action("list-two-sequences", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sequences = await ctx.midiClient.invoke("listMidiSequences", {});
    return { twoSequences: sequences };
  }, { after: [saveSecond] });

  wf.check("list-shows-two-sequences", (rawCtx) => {
    const ctx = rawCtx as Ctx & { twoSequences: MidiSequenceRecord[] };
    assert.equal(ctx.twoSequences.length, 2);
    const names = ctx.twoSequences.map((s) => s.name);
    assert.ok(names.includes("my-seq"));
    assert.ok(names.includes("second-seq"));
  }, { after: [listTwo] });

  // ---- delete (runs after the two-sequence list to avoid interference) -----

  const deleteSeq = wf.action("delete-midi-sequence", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.midiClient.invoke("deleteMidiSequence", { name: "my-seq" });
    return {};
  }, { after: [listTwo] });

  const listAfterDelete = wf.action("list-after-delete", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sequences = await ctx.midiClient.invoke("listMidiSequences", {});
    return { listAfterDelete: sequences };
  }, { after: [deleteSeq] });

  wf.check("list-after-delete-excludes-deleted", (rawCtx) => {
    const ctx = rawCtx as Ctx & { listAfterDelete: MidiSequenceRecord[] };
    const names = ctx.listAfterDelete.map((s) => s.name);
    assert.ok(!names.includes("my-seq"), `"my-seq" should be gone after delete`);
  }, { after: [listAfterDelete] });

  const getAfterDelete = wf.action("get-after-delete", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const result = await ctx.midiClient.invoke("getMidiSequence", { name: "my-seq" });
    return { afterDeleteResult: result };
  }, { after: [deleteSeq] });

  wf.check("get-after-delete-returns-null", (rawCtx) => {
    const ctx = rawCtx as Ctx & { afterDeleteResult: unknown };
    assert.equal(ctx.afterDeleteResult, null);
  }, { after: [getAfterDelete] });

  return wf.build();
}
