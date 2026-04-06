/**
 * Workflow: audio-formats
 *
 * Tests the AUDIO_EXTENSIONS constant and missing-file rejection.
 * Corresponds to the audio-format-related assertions in tests/commands.spec.ts.
 *
 * Checks:
 *   - Attempting to read a non-existent file raises an error
 *   - AUDIO_EXTENSIONS includes common formats (.wav, .flac, .mp3, .ogg)
 *   - Every extension has a leading dot
 *   - Every extension is lowercase
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import { createWorkflow } from "./types";
import type { WorkflowServices } from "./helpers";
import { AUDIO_EXTENSIONS } from "../../src/electron/audio-extensions";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  missingFilePath?: string;
}

export function buildWorkflow() {
  const wf = createWorkflow("audio-formats");

  const setup = wf.action("setup", (_ctx) => {
    const missingFilePath = path.join(os.tmpdir(), "bounce-wf-af-nonexistent.wav");
    return Promise.resolve({ missingFilePath });
  });

  wf.check("rejects-missing-file", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await assert.rejects(
      ctx.audioFileClient.invoke("readAudioFile", { filePathOrHash: ctx.missingFilePath! }),
      (err: Error) => {
        assert.ok(err.message.length > 0, "error message should be non-empty");
        return true;
      },
    );
  }, { after: [setup] });

  wf.check("supported-formats-include-common-types", (_ctx) => {
    const exts = AUDIO_EXTENSIONS as readonly string[];
    for (const expected of [".wav", ".flac", ".mp3", ".ogg"]) {
      assert.ok(
        exts.includes(expected),
        `AUDIO_EXTENSIONS should include "${expected}"`,
      );
    }
  });

  wf.check("all-extensions-have-leading-dot", (_ctx) => {
    for (const ext of AUDIO_EXTENSIONS) {
      assert.ok(
        ext.startsWith("."),
        `Extension "${ext}" should start with a dot`,
      );
    }
  });

  wf.check("all-extensions-are-lowercase", (_ctx) => {
    for (const ext of AUDIO_EXTENSIONS) {
      assert.equal(
        ext,
        ext.toLowerCase(),
        `Extension "${ext}" should be lowercase`,
      );
    }
  });

  return wf.build();
}
