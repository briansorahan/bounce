import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { LsResult, WalkResult } from "../../src/shared/rpc/filesystem.rpc";

describe("filesystem", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let testDir: string;
  let wavPath: string;
  let initialCwd: string;
  let newCwd: string;
  let lsResult: LsResult;
  let lsHiddenResult: LsResult;
  let globResult: string[];
  let walkResult: WalkResult;
  let relativeReadHash: string;

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
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-fs-"));
    fs.writeFileSync(path.join(testDir, "visible.txt"), "hello");
    fs.mkdirSync(path.join(testDir, ".hidden"));
    wavPath = path.join(testDir, "test.wav");
    createTestWav(wavPath, 0.2);
  });

  it("get-initial-pwd", async () => {
    initialCwd = await services.filesystemClient.invoke("pwd", {});
  });

  it("pwd-returns-absolute-path", () => {
    assert.ok(path.isAbsolute(initialCwd), `Expected absolute path, got: ${initialCwd}`);
  });

  it("cd-rejects-nonexistent-path", async () => {
    await assert.rejects(
      services.filesystemClient.invoke("cd", { dirPath: "/this/path/does/not/exist/__bounce_test__" }),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      },
    );
  });

  it("cd-rejects-a-file-path", async () => {
    await assert.rejects(
      services.filesystemClient.invoke("cd", { dirPath: wavPath }),
      (err: Error) => {
        assert.ok(err.message.includes("Not a directory"));
        return true;
      },
    );
  });

  it("cd-to-test-dir", async () => {
    newCwd = await services.filesystemClient.invoke("cd", { dirPath: testDir });
  });

  it("cd-returns-new-absolute-path", () => {
    assert.equal(newCwd, testDir);
  });

  it("pwd-reflects-cd", async () => {
    const cwd = await services.filesystemClient.invoke("pwd", {});
    assert.equal(cwd, testDir);
  });

  it("ls-test-dir", async () => {
    lsResult = await services.filesystemClient.invoke("ls", {});
  });

  it("ls-lists-visible-files", () => {
    const names = lsResult.entries.map((e) => e.name);
    assert.ok(names.includes("visible.txt"), `visible.txt not found in: ${names.join(", ")}`);
    assert.ok(names.includes("test.wav"), `test.wav not found in: ${names.join(", ")}`);
  });

  it("ls-hides-dotfiles-by-default", () => {
    const names = lsResult.entries.map((e) => e.name);
    assert.ok(!names.includes(".hidden"), ".hidden should not appear in default ls");
  });

  it("ls-marks-wav-as-audio", () => {
    const wavEntry = lsResult.entries.find((e) => e.name === "test.wav");
    assert.ok(wavEntry, "test.wav entry not found");
    assert.equal(wavEntry!.isAudio, true);
  });

  it("ls-test-dir-with-hidden", async () => {
    lsHiddenResult = await services.filesystemClient.invoke("ls", { showHidden: true });
  });

  it("ls-show-hidden-reveals-dotfiles", () => {
    const names = lsHiddenResult.entries.map((e) => e.name);
    assert.ok(names.includes(".hidden"), ".hidden should appear with showHidden=true");
  });

  it("glob-wav-files", async () => {
    globResult = await services.filesystemClient.invoke("glob", { pattern: "*.wav" });
  });

  it("glob-returns-wav-file", () => {
    assert.ok(
      globResult.some((p) => p.endsWith("test.wav")),
      `Expected test.wav in glob results: ${globResult.join(", ")}`,
    );
  });

  it("walk-test-dir", async () => {
    walkResult = await services.filesystemClient.invoke("walk", { dirPath: testDir });
  });

  it("walk-returns-entries", () => {
    assert.ok(walkResult.entries.length > 0);
  });

  it("walk-entries-include-file-type", () => {
    const types = walkResult.entries.map((e) => e.type);
    assert.ok(types.includes("file"), `Expected "file" type in walk results`);
  });

  it("walk-includes-wav-path", () => {
    const paths = walkResult.entries.map((e) => e.path);
    assert.ok(
      paths.some((p) => p.endsWith("test.wav")),
      `Expected test.wav in walk results`,
    );
  });

  it("read-relative-path", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: "test.wav" });
    relativeReadHash = result.hash;
  });

  it("relative-read-resolves-against-cwd", () => {
    assert.equal(typeof relativeReadHash, "string");
    assert.equal(relativeReadHash.length, 64);
  });
});
