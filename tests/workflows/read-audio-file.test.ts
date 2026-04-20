import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav, createTextFile } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { ReadAudioFileResult } from "../../src/shared/rpc/audio-file.rpc";

describe("read-audio-file", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let testFilesDir: string;
  let wavPath: string;
  let txtPath: string;
  let firstRead: ReadAudioFileResult;
  let secondRead: ReadAudioFileResult;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => {
    if (testFilesDir) fs.rmSync(testFilesDir, { recursive: true, force: true });
    cleanup?.();
  });

  it("create-test-files", () => {
    testFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-raf-"));
    wavPath = path.join(testFilesDir, "test.wav");
    txtPath = path.join(testFilesDir, "test.txt");
    createTestWav(wavPath, 0.2);
    createTextFile(txtPath);
  });

  it("read-wav-file", async () => {
    firstRead = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
  });

  it("hash-is-64-hex-chars", () => {
    assert.equal(typeof firstRead.hash, "string", "hash should be a string");
    assert.equal(firstRead.hash.length, 64, "SHA-256 hex should be 64 chars");
    assert.match(firstRead.hash, /^[0-9a-f]+$/, "hash should be lowercase hex");
  });

  it("sample-rate-is-44100", () => {
    assert.equal(firstRead.sampleRate, 44100);
  });

  it("channel-data-is-non-empty-array", () => {
    assert.ok(Array.isArray(firstRead.channelData), "channelData should be an array");
    assert.ok(firstRead.channelData.length > 0, "channelData should be non-empty");
  });

  it("file-path-is-set", () => {
    assert.equal(firstRead.filePath, wavPath);
  });

  it("sample-stored-in-query-service", async () => {
    const sample = await services.queryService.getSampleByHash(firstRead.hash);
    assert.ok(sample !== null, "sample should be stored and visible via QueryService");
    assert.equal(sample!.sample_rate, 44100);
    assert.equal(sample!.sample_type, "raw");
  });

  it("sample-appears-in-list-samples", async () => {
    const samples = await services.queryService.listSamples();
    const found = samples.find((s) => s.hash === firstRead.hash);
    assert.ok(found, "sample should appear in listSamples result");
  });

  it("read-wav-file-again", async () => {
    secondRead = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
  });

  it("re-reading-same-file-gives-identical-hash", () => {
    assert.equal(
      secondRead.hash,
      firstRead.hash,
      "hash should be deterministic for identical audio data",
    );
  });

  it("rejects-file-with-non-audio-extension", async () => {
    await assert.rejects(
      services.audioFileClient.invoke("readAudioFile", { filePathOrHash: txtPath }),
      (err: Error) => {
        assert.ok(
          err.message.includes("Unsupported file format"),
          `Expected "Unsupported file format" but got: ${err.message}`,
        );
        return true;
      },
    );
  });
});
