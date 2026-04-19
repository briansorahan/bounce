import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import { AUDIO_EXTENSIONS } from "../../src/electron/audio-extensions";

describe("audio-formats", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let missingFilePath: string;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("setup", () => {
    missingFilePath = path.join(os.tmpdir(), "bounce-wf-af-nonexistent.wav");
  });

  it("rejects-missing-file", async () => {
    await assert.rejects(
      services.audioFileClient.invoke("readAudioFile", { filePathOrHash: missingFilePath }),
      (err: Error) => {
        assert.ok(err.message.length > 0, "error message should be non-empty");
        return true;
      },
    );
  });

  it("supported-formats-include-common-types", () => {
    const exts = AUDIO_EXTENSIONS as readonly string[];
    for (const expected of [".wav", ".flac", ".mp3", ".ogg"]) {
      assert.ok(
        exts.includes(expected),
        `AUDIO_EXTENSIONS should include "${expected}"`,
      );
    }
  });

  it("all-extensions-have-leading-dot", () => {
    for (const ext of AUDIO_EXTENSIONS) {
      assert.ok(
        ext.startsWith("."),
        `Extension "${ext}" should start with a dot`,
      );
    }
  });

  it("all-extensions-are-lowercase", () => {
    for (const ext of AUDIO_EXTENSIONS) {
      assert.equal(
        ext,
        ext.toLowerCase(),
        `Extension "${ext}" should be lowercase`,
      );
    }
  });
});
