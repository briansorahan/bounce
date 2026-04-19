import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { InstrumentRecord, InstrumentSampleRecord } from "../../src/shared/domain-types";

describe("instrument", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let keysRecord: InstrumentRecord;
  let fetchedKeys: InstrumentRecord | null;
  let drumsRecord: InstrumentRecord;
  let listedInstruments: InstrumentRecord[];
  let polyPadRecord: InstrumentRecord;
  let wavPath: string;
  let sampleHash: string;
  let instrumentSamples: InstrumentSampleRecord[];
  let deleteResult: boolean;
  let listAfterDeleteInstruments: InstrumentRecord[];
  let deletedRecord: InstrumentRecord | null;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("empty-list-returns-empty-array", async () => {
    const instruments = await services.instrumentClient.invoke("listInstruments", {});
    assert.deepEqual(instruments, []);
  });

  it("get-nonexistent-returns-null", async () => {
    const record = await services.instrumentClient.invoke("getInstrument", { name: "__no_such_instrument__" });
    assert.equal(record, null);
  });

  it("delete-nonexistent-returns-false", async () => {
    const result = await services.instrumentClient.invoke("deleteInstrument", { name: "__ghost__" });
    assert.equal(result, false);
  });

  it("create-sampler-keys", async () => {
    keysRecord = await services.instrumentClient.invoke("createInstrument", {
      name: "keys",
      kind: "sampler",
    });
  });

  it("create-returns-record-with-correct-name", () => {
    assert.equal(keysRecord.name, "keys");
  });

  it("create-returns-record-with-correct-kind", () => {
    assert.equal(keysRecord.kind, "sampler");
  });

  it("create-returns-record-with-numeric-id", () => {
    assert.ok(typeof keysRecord.id === "number" && keysRecord.id > 0);
  });

  it("get-keys-instrument", async () => {
    fetchedKeys = await services.instrumentClient.invoke("getInstrument", { name: "keys" });
  });

  it("get-returns-same-record", () => {
    assert.ok(fetchedKeys !== null, "getInstrument should return a record");
    assert.equal(fetchedKeys!.id, keysRecord.id);
    assert.equal(fetchedKeys!.name, keysRecord.name);
  });

  it("create-sampler-drums", async () => {
    drumsRecord = await services.instrumentClient.invoke("createInstrument", {
      name: "drums",
      kind: "sampler",
    });
  });

  it("list-instruments-after-create", async () => {
    listedInstruments = await services.instrumentClient.invoke("listInstruments", {});
  });

  it("list-shows-both-instruments", () => {
    const names = listedInstruments.map((i) => i.name);
    assert.ok(names.includes("keys"), `expected "keys" in ${JSON.stringify(names)}`);
    assert.ok(names.includes("drums"), `expected "drums" in ${JSON.stringify(names)}`);
  });

  it("create-instrument-with-config", async () => {
    polyPadRecord = await services.instrumentClient.invoke("createInstrument", {
      name: "poly-pad",
      kind: "sampler",
      config: { polyphony: 4 },
    });
  });

  it("config-json-is-persisted", () => {
    assert.ok(polyPadRecord.config_json !== null, "config_json should not be null");
    const parsed = JSON.parse(polyPadRecord.config_json!);
    assert.equal(parsed.polyphony, 4);
  });

  it("setup-wav-file", () => {
    wavPath = path.join(os.tmpdir(), "bounce-wf-inst-sample.wav");
    createTestWav(wavPath, 0.2);
  });

  it("read-wav-for-instrument", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    sampleHash = result.hash;
  });

  it("add-sample-for-unknown-instrument-returns-empty", async () => {
    const samples = await services.instrumentClient.invoke("getInstrumentSamples", {
      instrumentName: "__no_such_instrument__",
    });
    assert.deepEqual(samples, []);
  });

  it("add-sample-for-unknown-sample-hash-throws", async () => {
    await assert.rejects(
      services.instrumentClient.invoke("addInstrumentSample", {
        instrumentName: "keys",
        sampleHash: "a".repeat(64),
        noteNumber: 60,
      }),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      },
    );
  });

  it("add-instrument-sample", async () => {
    await services.instrumentClient.invoke("addInstrumentSample", {
      instrumentName: "keys",
      sampleHash,
      noteNumber: 60,
      loop: false,
    });
  });

  it("get-instrument-samples", async () => {
    instrumentSamples = await services.instrumentClient.invoke("getInstrumentSamples", { instrumentName: "keys" });
  });

  it("instrument-has-one-sample", () => {
    assert.equal(instrumentSamples.length, 1, "should have exactly 1 sample");
  });

  it("sample-is-on-correct-note", () => {
    assert.equal(instrumentSamples[0].note_number, 60);
  });

  it("sample-hash-matches", () => {
    assert.equal(instrumentSamples[0].sample_hash, sampleHash);
  });

  it("delete-drums-instrument", async () => {
    deleteResult = await services.instrumentClient.invoke("deleteInstrument", { name: "drums" });
  });

  it("delete-existing-returns-true", () => {
    assert.equal(deleteResult, true);
  });

  it("list-after-delete", async () => {
    listAfterDeleteInstruments = await services.instrumentClient.invoke("listInstruments", {});
  });

  it("list-after-delete-excludes-drums", () => {
    const names = listAfterDeleteInstruments.map((i) => i.name);
    assert.ok(!names.includes("drums"), `"drums" should be gone after delete`);
  });

  it("get-deleted-instrument", async () => {
    deletedRecord = await services.instrumentClient.invoke("getInstrument", { name: "drums" });
  });

  it("get-after-delete-returns-null", () => {
    assert.equal(deletedRecord, null);
  });
});
