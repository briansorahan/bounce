/**
 * Workflow: list-samples
 *
 * Tests the listSamples IPC contract (via AudioFileService + QueryService).
 * Corresponds to tests/list-samples.spec.ts.
 *
 * Checks:
 *   - listSamples() on an empty database returns an empty array
 *   - listSamples() after readAudioFile() returns one entry
 *   - The entry's display_name contains the filename
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { SampleListRecord } from "../../src/shared/domain-types";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  testDir?: string;
  wavPath?: string;
  samplesBeforeRead?: SampleListRecord[];
  samplesAfterRead?: SampleListRecord[];
}

export function buildWorkflow() {
  const wf = createWorkflow("list-samples");

  const setup = wf.action("setup", async (_ctx) => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-ls-"));
    const wavPath = path.join(testDir, "list-test.wav");
    createTestWav(wavPath, 0.2);
    return { testDir, wavPath };
  });

  const listEmpty = wf.action("list-samples-empty", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const samplesBeforeRead = await ctx.queryService.listSamples();
    return { samplesBeforeRead };
  }, { after: [setup] });

  const readFile = wf.action("read-wav-file", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioFileClient.invoke("readAudioFile", { filePathOrHash: ctx.wavPath! });
    return {};
  }, { after: [listEmpty] });

  const listAfterRead = wf.action("list-samples-after-read", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const samplesAfterRead = await ctx.queryService.listSamples();
    return { samplesAfterRead };
  }, { after: [readFile] });

  // ---- Checks ---------------------------------------------------------------

  wf.check("empty-database-returns-empty-array", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.deepEqual(ctx.samplesBeforeRead, []);
  }, { after: [listEmpty] });

  wf.check("after-read-returns-one-sample", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.equal(ctx.samplesAfterRead!.length, 1);
  }, { after: [listAfterRead] });

  wf.check("sample-display-name-contains-filename", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const sample = ctx.samplesAfterRead![0];
    assert.ok(
      sample.display_name?.includes("list-test.wav"),
      `Expected display_name to include "list-test.wav", got: ${sample.display_name}`,
    );
  }, { after: [listAfterRead] });

  wf.check("sample-has-correct-sample-type", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.equal(ctx.samplesAfterRead![0].sample_type, "raw");
  }, { after: [listAfterRead] });

  wf.check("sample-has-correct-sample-rate", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.equal(ctx.samplesAfterRead![0].sample_rate, 44100);
  }, { after: [listAfterRead] });

  // ---- Cleanup -------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (ctx.testDir) {
      fs.rmSync(ctx.testDir, { recursive: true, force: true });
    }
    return {};
  }, {
    after: [
      "empty-database-returns-empty-array",
      "after-read-returns-one-sample",
      "sample-display-name-contains-filename",
      "sample-has-correct-sample-type",
      "sample-has-correct-sample-rate",
    ],
  });

  return wf.build();
}
