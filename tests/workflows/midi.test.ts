import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { MidiEvent, MidiSequenceRecord } from "../../src/shared/ipc-contract";

const NOTE_ON: MidiEvent = { type: "note_on", channel: 0, note: 60, velocity: 0.63, timestampMs: 0 };
const NOTE_OFF: MidiEvent = { type: "note_off", channel: 0, note: 60, velocity: 0, timestampMs: 100 };

describe("midi", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let savedRecord: MidiSequenceRecord;
  let listAfterSaveRecords: MidiSequenceRecord[];
  let fetchedSeq: { record: MidiSequenceRecord; events: MidiEvent[] } | null;
  let overwrittenRecord: MidiSequenceRecord;
  let twoSequences: MidiSequenceRecord[];
  let listAfterDeleteRecords: MidiSequenceRecord[];
  let afterDeleteResult: unknown;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("empty-store-returns-empty-list", async () => {
    const sequences = await services.midiClient.invoke("listMidiSequences", {});
    assert.deepEqual(sequences, []);
  });

  it("get-unknown-sequence-returns-null", async () => {
    const result = await services.midiClient.invoke("getMidiSequence", { name: "__no_such_seq__" });
    assert.equal(result, null);
  });

  it("save-midi-sequence", async () => {
    savedRecord = await services.midiClient.invoke("saveMidiSequence", {
      name: "my-seq",
      events: [NOTE_ON, NOTE_OFF],
      durationMs: 200,
    });
  });

  it("save-returns-record-with-correct-name", () => {
    assert.equal(savedRecord.name, "my-seq");
  });

  it("save-returns-correct-event-count", () => {
    assert.equal(savedRecord.event_count, 2);
  });

  it("save-returns-correct-duration", () => {
    assert.equal(savedRecord.duration_ms, 200);
  });

  it("save-returns-numeric-id", () => {
    assert.ok(typeof savedRecord.id === "number" && savedRecord.id > 0);
  });

  it("list-after-save", async () => {
    listAfterSaveRecords = await services.midiClient.invoke("listMidiSequences", {});
  });

  it("list-shows-saved-sequence", () => {
    assert.equal(listAfterSaveRecords.length, 1);
    assert.equal(listAfterSaveRecords[0].name, "my-seq");
  });

  it("get-midi-sequence", async () => {
    fetchedSeq = await services.midiClient.invoke("getMidiSequence", { name: "my-seq" });
  });

  it("get-returns-record", () => {
    assert.ok(fetchedSeq !== null, "getMidiSequence should return a result");
    assert.equal(fetchedSeq!.record.name, "my-seq");
  });

  it("get-returns-events", () => {
    assert.equal(fetchedSeq!.events.length, 2);
    assert.equal(fetchedSeq!.events[0].type, "note_on");
    assert.equal(fetchedSeq!.events[1].type, "note_off");
  });

  it("overwrite-midi-sequence", async () => {
    overwrittenRecord = await services.midiClient.invoke("saveMidiSequence", {
      name: "my-seq",
      events: [NOTE_ON],
      durationMs: 50,
    });
  });

  it("overwrite-preserves-id", () => {
    assert.equal(overwrittenRecord.id, savedRecord.id);
  });

  it("overwrite-updates-event-count", () => {
    assert.equal(overwrittenRecord.event_count, 1);
  });

  it("overwrite-updates-duration", () => {
    assert.equal(overwrittenRecord.duration_ms, 50);
  });

  it("save-second-sequence", async () => {
    await services.midiClient.invoke("saveMidiSequence", {
      name: "second-seq",
      events: [NOTE_ON, NOTE_OFF, NOTE_ON],
      durationMs: 400,
    });
  });

  it("list-two-sequences", async () => {
    twoSequences = await services.midiClient.invoke("listMidiSequences", {});
  });

  it("list-shows-two-sequences", () => {
    assert.equal(twoSequences.length, 2);
    const names = twoSequences.map((s) => s.name);
    assert.ok(names.includes("my-seq"));
    assert.ok(names.includes("second-seq"));
  });

  it("delete-midi-sequence", async () => {
    await services.midiClient.invoke("deleteMidiSequence", { name: "my-seq" });
  });

  it("list-after-delete", async () => {
    listAfterDeleteRecords = await services.midiClient.invoke("listMidiSequences", {});
  });

  it("list-after-delete-excludes-deleted", () => {
    const names = listAfterDeleteRecords.map((s) => s.name);
    assert.ok(!names.includes("my-seq"), `"my-seq" should be gone after delete`);
  });

  it("get-after-delete", async () => {
    afterDeleteResult = await services.midiClient.invoke("getMidiSequence", { name: "my-seq" });
  });

  it("get-after-delete-returns-null", () => {
    assert.equal(afterDeleteResult, null);
  });
});
