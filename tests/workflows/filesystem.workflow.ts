/**
 * Workflow: filesystem
 *
 * Tests the FilesystemService IPC contract.
 * Corresponds to tests/filesystem.spec.ts.
 *
 * Checks:
 *   - pwd() returns an absolute path
 *   - cd() changes the cwd and returns the new absolute path
 *   - cd() rejects a non-existent path
 *   - ls() lists directory contents
 *   - ls() hides dotfiles by default; showHidden=true reveals them
 *   - glob() returns matched paths relative to cwd
 *   - walk() returns file entries for a directory
 *   - walk() entries include FileType values
 *   - sn.read() resolves a relative path against cwd (via AudioFileService)
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { LsResult, WalkResult } from "../../src/shared/rpc/filesystem.rpc";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  testDir?: string;
  wavPath?: string;
  initialCwd?: string;
  newCwd?: string;
  lsResult?: LsResult;
  lsHiddenResult?: LsResult;
  globResult?: string[];
  walkResult?: WalkResult;
}

export function buildWorkflow() {
  const wf = createWorkflow("filesystem");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async (_ctx) => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-fs-"));
    // Create a visible file, a dotfile, and a subdirectory
    fs.writeFileSync(path.join(testDir, "visible.txt"), "hello");
    fs.mkdirSync(path.join(testDir, ".hidden"));
    const wavPath = path.join(testDir, "test.wav");
    createTestWav(wavPath, 0.2);
    return { testDir, wavPath };
  });

  // ---- Actions --------------------------------------------------------------

  const getPwd = wf.action("get-initial-pwd", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const initialCwd = await ctx.filesystemClient.invoke("pwd", {});
    return { initialCwd };
  }, { after: [setup] });

  const doCd = wf.action("cd-to-test-dir", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const newCwd = await ctx.filesystemClient.invoke("cd", { dirPath: ctx.testDir! });
    return { newCwd };
  }, { after: [getPwd] });

  const doLs = wf.action("ls-test-dir", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const lsResult = await ctx.filesystemClient.invoke("ls", {});
    return { lsResult };
  }, { after: [doCd] });

  const doLsHidden = wf.action("ls-test-dir-with-hidden", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const lsHiddenResult = await ctx.filesystemClient.invoke("ls", { showHidden: true });
    return { lsHiddenResult };
  }, { after: [doCd] });

  const doGlob = wf.action("glob-wav-files", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const globResult = await ctx.filesystemClient.invoke("glob", { pattern: "*.wav" });
    return { globResult };
  }, { after: [doCd] });

  const doWalk = wf.action("walk-test-dir", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const walkResult = await ctx.filesystemClient.invoke("walk", { dirPath: ctx.testDir! });
    return { walkResult };
  }, { after: [doCd] });

  const readRelative = wf.action("read-relative-path", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    // cwd is testDir; read the wav by relative name only
    const result = await ctx.audioFileClient.invoke("readAudioFile", { filePathOrHash: "test.wav" });
    return { relativeReadHash: result.hash };
  }, { after: [doCd] });

  // ---- Checks ---------------------------------------------------------------

  wf.check("pwd-returns-absolute-path", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(path.isAbsolute(ctx.initialCwd!), `Expected absolute path, got: ${ctx.initialCwd}`);
  }, { after: [getPwd] });

  wf.check("cd-returns-new-absolute-path", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.equal(ctx.newCwd, ctx.testDir);
  }, { after: [doCd] });

  wf.check("pwd-reflects-cd", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const cwd = await ctx.filesystemClient.invoke("pwd", {});
    assert.equal(cwd, ctx.testDir);
  }, { after: [doCd] });

  wf.check("cd-rejects-nonexistent-path", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await assert.rejects(
      ctx.filesystemClient.invoke("cd", { dirPath: "/this/path/does/not/exist/__bounce_test__" }),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      },
    );
  }, { after: [getPwd] });

  wf.check("cd-rejects-a-file-path", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await assert.rejects(
      ctx.filesystemClient.invoke("cd", { dirPath: ctx.wavPath! }),
      (err: Error) => {
        assert.ok(err.message.includes("Not a directory"));
        return true;
      },
    );
  }, { after: [setup] });

  wf.check("ls-lists-visible-files", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const names = ctx.lsResult!.entries.map((e) => e.name);
    assert.ok(names.includes("visible.txt"), `visible.txt not found in: ${names.join(", ")}`);
    assert.ok(names.includes("test.wav"), `test.wav not found in: ${names.join(", ")}`);
  }, { after: [doLs] });

  wf.check("ls-hides-dotfiles-by-default", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const names = ctx.lsResult!.entries.map((e) => e.name);
    assert.ok(!names.includes(".hidden"), ".hidden should not appear in default ls");
  }, { after: [doLs] });

  wf.check("ls-show-hidden-reveals-dotfiles", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const names = ctx.lsHiddenResult!.entries.map((e) => e.name);
    assert.ok(names.includes(".hidden"), ".hidden should appear with showHidden=true");
  }, { after: [doLsHidden] });

  wf.check("ls-marks-wav-as-audio", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const wavEntry = ctx.lsResult!.entries.find((e) => e.name === "test.wav");
    assert.ok(wavEntry, "test.wav entry not found");
    assert.equal(wavEntry!.isAudio, true);
  }, { after: [doLs] });

  wf.check("glob-returns-wav-file", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(
      ctx.globResult!.some((p) => p.endsWith("test.wav")),
      `Expected test.wav in glob results: ${ctx.globResult!.join(", ")}`,
    );
  }, { after: [doGlob] });

  wf.check("walk-returns-entries", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    assert.ok(ctx.walkResult!.entries.length > 0);
  }, { after: [doWalk] });

  wf.check("walk-entries-include-file-type", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const types = ctx.walkResult!.entries.map((e) => e.type);
    assert.ok(types.includes("file"), `Expected "file" type in walk results`);
  }, { after: [doWalk] });

  wf.check("walk-includes-wav-path", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const paths = ctx.walkResult!.entries.map((e) => e.path);
    assert.ok(
      paths.some((p) => p.endsWith("test.wav")),
      `Expected test.wav in walk results`,
    );
  }, { after: [doWalk] });

  wf.check("relative-read-resolves-against-cwd", (rawCtx) => {
    const ctx = rawCtx as Ctx & { relativeReadHash: string };
    assert.equal(typeof ctx.relativeReadHash, "string");
    assert.equal(ctx.relativeReadHash.length, 64);
  }, { after: [readRelative] });

  // ---- Cleanup -------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (ctx.testDir) {
      fs.rmSync(ctx.testDir, { recursive: true, force: true });
    }
    return {};
  }, {
    after: [
      "pwd-returns-absolute-path",
      "cd-returns-new-absolute-path",
      "pwd-reflects-cd",
      "cd-rejects-nonexistent-path",
      "cd-rejects-a-file-path",
      "ls-lists-visible-files",
      "ls-hides-dotfiles-by-default",
      "ls-show-hidden-reveals-dotfiles",
      "ls-marks-wav-as-audio",
      "glob-returns-wav-file",
      "walk-returns-entries",
      "walk-entries-include-file-type",
      "walk-includes-wav-path",
      "relative-read-resolves-against-cwd",
    ],
  });

  return wf.build();
}
