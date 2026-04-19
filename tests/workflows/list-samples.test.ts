import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { SampleListRecord } from "../../src/shared/domain-types";

describe("list-samples", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let testDir: string;
  let wavPath: string;
  let samplesBeforeRead: SampleListRecord[];
  let samplesAfterRead: SampleListRecord[];

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => {
    if (testDir) fs.rmSync(testDir, { recursive: true, force: true });
    cleanup?.();
  });

  it("setup", () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-ls-"));
    wavPath = path.join(testDir, "list-test.wav");
    createTestWav(wavPath, 0.2);
  });

  it("list-samples-empty", async () => {
    samplesBeforeRead = await services.queryService.listSamples();
  });

  it("empty-database-returns-empty-array", () => {
    assert.deepEqual(samplesBeforeRead, []);
  });

  it("read-wav-file", async () => {
    await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
  });

  it("list-samples-after-read", async () => {
    samplesAfterRead = await services.queryService.listSamples();
  });

  it("after-read-returns-one-sample", () => {
    assert.equal(samplesAfterRead.length, 1);
  });

  it("sample-display-name-contains-filename", () => {
    const sample = samplesAfterRead[0];
    assert.ok(
      sample.display_name?.includes("list-test.wav"),
      `Expected display_name to include "list-test.wav", got: ${sample.display_name}`,
    );
  });

  it("sample-has-correct-sample-type", () => {
    assert.equal(samplesAfterRead[0].sample_type, "raw");
  });

  it("sample-has-correct-sample-rate", () => {
    assert.equal(samplesAfterRead[0].sample_rate, 44100);
  });
});
