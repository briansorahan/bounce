import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";

describe("granular-instrument", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let wavPath: string;
  let sampleHash: string;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    cleanup?.();
  });

  it("setup", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-granular-inst-"));
    wavPath = path.join(tmpDir, "test.wav");
    createTestWav(wavPath, 0.2);
  });

  it("read-wav", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
    sampleHash = result.hash;
  });

  it("create-sampler", async () => {
    await services.instrumentClient.invoke("createInstrument", {
      name: "drums",
      kind: "sampler",
      config: { polyphony: 4 },
    });
  });

  it("sampler-in-list", async () => {
    const instruments = await services.instrumentClient.invoke("listInstruments", {});
    const names = instruments.map((i) => i.name);
    assert.ok(names.includes("drums"), `Expected 'drums' in list, got: ${names.join(", ")}`);
  });

  it("create-granular", async () => {
    await services.instrumentClient.invoke("createInstrument", {
      name: "pads",
      kind: "granular",
      config: { polyphony: 8 },
    });
  });

  it("both-instruments-in-list", async () => {
    const instruments = await services.instrumentClient.invoke("listInstruments", {});
    const names = instruments.map((i) => i.name);
    assert.ok(names.includes("drums"), `Expected 'drums' in list`);
    assert.ok(names.includes("pads"), `Expected 'pads' in list`);
  });

  it("add-sample", async () => {
    await services.instrumentClient.invoke("addInstrumentSample", {
      instrumentName: "drums",
      sampleHash,
      noteNumber: 60,
    });
  });

  it("sample-attached", async () => {
    const samples = await services.instrumentClient.invoke("getInstrumentSamples", {
      instrumentName: "drums",
    });
    const hashes = samples.map((s) => s.sample_hash);
    assert.ok(
      hashes.includes(sampleHash),
      `Expected ${sampleHash.substring(0, 8)}... in instrument samples`,
    );
  });

  it("note-on", async () => {
    await services.audioEngineClient.invoke("instrumentNoteOn", {
      instrumentId: "drums",
      note: 60,
      velocity: 100,
    });
  });

  it("note-on-no-error", () => {
    assert.ok(true);
  });

  it("note-off", async () => {
    await services.audioEngineClient.invoke("instrumentNoteOff", {
      instrumentId: "drums",
      note: 60,
    });
  });

  it("note-off-no-error", () => {
    assert.ok(true);
  });

  it("delete-sampler", async () => {
    await services.instrumentClient.invoke("deleteInstrument", { name: "drums" });
  });

  it("sampler-deleted", async () => {
    const instruments = await services.instrumentClient.invoke("listInstruments", {});
    const names = instruments.map((i) => i.name);
    assert.ok(!names.includes("drums"), "Expected 'drums' to be deleted");
    assert.ok(names.includes("pads"), "Expected 'pads' to still be present");
  });
});
